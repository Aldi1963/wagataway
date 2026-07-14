package whatsapp

import (
	"context"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"sync"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
	"gorm.io/gorm"

	_ "github.com/mattn/go-sqlite3"
)

// SessionState holds the runtime state for a single WhatsApp device session
type SessionState struct {
	DeviceID  uint
	UserID    uint
	Status    string // "disconnected", "connecting", "connected"
	QR        string
	QRExpiry  time.Time
	Client    *whatsmeow.Client
	Container *sqlstore.Container
	cancel    context.CancelFunc
	mu        sync.RWMutex
}

// Manager coordinates all WhatsApp sessions
type Manager struct {
	sessions   map[uint]*SessionState
	mu         sync.RWMutex
	sessionDir string
	db         *gorm.DB
	onMessage  func(deviceID, userID uint, msg *events.Message)
}

// NewManager creates a new WhatsApp session manager
func NewManager(sessionDir string, db *gorm.DB) *Manager {
	if err := os.MkdirAll(sessionDir, 0750); err != nil {
		log.Fatal().Err(err).Msg("Failed to create WA sessions directory")
	}

	m := &Manager{
		sessions:   make(map[uint]*SessionState),
		sessionDir: sessionDir,
		db:         db,
	}

	// Auto-reconnect previously connected devices
	go m.autoReconnect()

	return m
}

// SetMessageHandler sets the callback for incoming messages
func (m *Manager) SetMessageHandler(handler func(deviceID, userID uint, msg *events.Message)) {
	m.onMessage = handler
}

// Connect starts a WhatsApp session for a device
func (m *Manager) Connect(deviceID, userID uint) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check if already connecting/connected
	if sess, exists := m.sessions[deviceID]; exists {
		if sess.Status != "disconnected" {
			return nil // already active
		}
		// Cleanup old session
		if sess.Client != nil {
			sess.Client.Disconnect()
		}
		if sess.cancel != nil {
			sess.cancel()
		}
	}

	sess := &SessionState{
		DeviceID: deviceID,
		UserID:   userID,
		Status:   "connecting",
	}
	m.sessions[deviceID] = sess

	// Start the actual WhatsApp connection in background
	go m.startSession(sess)

	return nil
}

// Disconnect terminates a WhatsApp session
func (m *Manager) Disconnect(deviceID uint) {
	m.mu.Lock()
	sess, exists := m.sessions[deviceID]
	m.mu.Unlock()

	if !exists {
		return
	}

	sess.mu.Lock()
	if sess.Client != nil {
		sess.Client.Disconnect()
	}
	if sess.cancel != nil {
		sess.cancel()
	}
	sess.Status = "disconnected"
	sess.QR = ""
	sess.Client = nil
	sess.mu.Unlock()

	// Update DB
	m.db.Model(&models.Device{}).Where("id = ?", deviceID).Update("status", "disconnected")

	log.Info().Uint("deviceID", deviceID).Msg("WhatsApp session disconnected")
}

// DisconnectAll disconnects all active sessions (for graceful shutdown)
func (m *Manager) DisconnectAll() {
	m.mu.RLock()
	ids := make([]uint, 0, len(m.sessions))
	for id := range m.sessions {
		ids = append(ids, id)
	}
	m.mu.RUnlock()

	for _, id := range ids {
		m.Disconnect(id)
	}

	log.Info().Int("count", len(ids)).Msg("All WhatsApp sessions disconnected")
}

// GetQR returns the current QR code data for a device
func (m *Manager) GetQR(deviceID uint) (string, time.Time) {
	m.mu.RLock()
	sess, exists := m.sessions[deviceID]
	m.mu.RUnlock()

	if !exists {
		return "", time.Time{}
	}

	sess.mu.RLock()
	defer sess.mu.RUnlock()

	return sess.QR, sess.QRExpiry
}

// GetStatus returns current session status
func (m *Manager) GetStatus(deviceID uint) string {
	m.mu.RLock()
	sess, exists := m.sessions[deviceID]
	m.mu.RUnlock()

	if !exists {
		return "disconnected"
	}

	sess.mu.RLock()
	defer sess.mu.RUnlock()

	return sess.Status
}

// GetClient returns the whatsmeow client for a device (used for advanced operations)
func (m *Manager) GetClient(deviceID uint) *whatsmeow.Client {
	m.mu.RLock()
	sess, exists := m.sessions[deviceID]
	m.mu.RUnlock()

	if !exists {
		return nil
	}

	sess.mu.RLock()
	defer sess.mu.RUnlock()

	return sess.Client
}

// SendMessage sends a WhatsApp message through a device
func (m *Manager) SendMessage(deviceID uint, to, msgType, content, mediaURL string) error {
	m.mu.RLock()
	sess, exists := m.sessions[deviceID]
	m.mu.RUnlock()

	if !exists || sess.Status != "connected" {
		return fmt.Errorf("device %d tidak terhubung", deviceID)
	}

	if sess.Client == nil {
		return fmt.Errorf("device %d client not initialized", deviceID)
	}

	// Parse recipient JID
	jid, err := parseJID(to)
	if err != nil {
		return fmt.Errorf("nomor tidak valid: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	switch msgType {
	case "text", "":
		msg := &waE2E.Message{
			Conversation: proto.String(content),
		}
		_, err = sess.Client.SendMessage(ctx, jid, msg)

	case "image":
		if mediaURL == "" {
			return fmt.Errorf("mediaURL wajib untuk tipe image")
		}
		// Upload and send image
		err = m.sendImageMessage(ctx, sess.Client, jid, mediaURL, content)

	case "document":
		if mediaURL == "" {
			return fmt.Errorf("mediaURL wajib untuk tipe document")
		}
		err = m.sendDocumentMessage(ctx, sess.Client, jid, mediaURL, content)

	default:
		// Default to text
		msg := &waE2E.Message{
			Conversation: proto.String(content),
		}
		_, err = sess.Client.SendMessage(ctx, jid, msg)
	}

	if err != nil {
		log.Error().Err(err).Uint("deviceID", deviceID).Str("to", to).Msg("Failed to send message")
		return err
	}

	log.Info().
		Uint("deviceID", deviceID).
		Str("to", to).
		Str("type", msgType).
		Msg("WhatsApp message sent")

	return nil
}

// CheckNumberRegistered checks if a phone number is registered on WhatsApp
func (m *Manager) CheckNumberRegistered(deviceID uint, phone string) (bool, error) {
	m.mu.RLock()
	sess, exists := m.sessions[deviceID]
	m.mu.RUnlock()

	if !exists || sess.Status != "connected" || sess.Client == nil {
		return false, fmt.Errorf("device %d tidak terhubung", deviceID)
	}

	jid, err := parseJID(phone)
	if err != nil {
		return false, err
	}

	resp, err := sess.Client.IsOnWhatsApp([]string{jid.User})
	if err != nil {
		return false, err
	}

	for _, r := range resp {
		if r.IsIn {
			return true, nil
		}
	}
	return false, nil
}

// GetGroups returns all groups the device is a member of
func (m *Manager) GetGroups(deviceID uint) ([]*types.GroupInfo, error) {
	m.mu.RLock()
	sess, exists := m.sessions[deviceID]
	m.mu.RUnlock()

	if !exists || sess.Status != "connected" || sess.Client == nil {
		return nil, fmt.Errorf("device %d tidak terhubung", deviceID)
	}

	groups, err := sess.Client.GetJoinedGroups()
	if err != nil {
		return nil, err
	}

	return groups, nil
}

// ProcessBulkJob processes a bulk messaging job
func (m *Manager) ProcessBulkJob(jobID uint, db *gorm.DB) {
	var job models.BulkJob
	if err := db.First(&job, jobID).Error; err != nil {
		log.Error().Err(err).Uint("jobID", jobID).Msg("Bulk job not found")
		return
	}

	now := time.Now()
	db.Model(&job).Updates(map[string]interface{}{
		"status":     "processing",
		"started_at": &now,
	})

	var recipients []models.BulkJobRecipient
	db.Where("bulk_job_id = ?", jobID).Find(&recipients)

	sentCount := 0
	failedCount := 0

	for _, r := range recipients {
		err := m.SendMessage(job.DeviceID, r.Phone, job.Type, job.Content, job.MediaURL)

		sentAt := time.Now()
		if err != nil {
			failedCount++
			db.Model(&r).Updates(map[string]interface{}{
				"status":    "failed",
				"error_msg": err.Error(),
			})
		} else {
			sentCount++
			db.Model(&r).Updates(map[string]interface{}{
				"status":  "sent",
				"sent_at": &sentAt,
			})
		}

		// Random delay between messages (anti-ban)
		delay := time.Duration(job.MinDelay+rand.Intn(job.MaxDelay-job.MinDelay+1)) * time.Second
		time.Sleep(delay)
	}

	completed := time.Now()
	status := "completed"
	if failedCount > 0 && sentCount == 0 {
		status = "failed"
	}

	db.Model(&job).Updates(map[string]interface{}{
		"status":       status,
		"sent_count":   sentCount,
		"failed_count": failedCount,
		"completed_at": &completed,
	})

	log.Info().
		Uint("jobID", jobID).
		Int("sent", sentCount).
		Int("failed", failedCount).
		Msg("Bulk job completed")
}

// startSession initializes the whatsmeow connection for a device
func (m *Manager) startSession(sess *SessionState) {
	deviceID := sess.DeviceID

	// Create per-device SQLite store for WhatsApp session persistence
	dbPath := filepath.Join(m.sessionDir, fmt.Sprintf("device_%d.db", deviceID))
	dbURI := fmt.Sprintf("file:%s?_foreign_keys=on", dbPath)

	dbLog := waLog.Noop
	container, err := sqlstore.New("sqlite3", dbURI, dbLog)
	if err != nil {
		log.Error().Err(err).Uint("deviceID", deviceID).Msg("Failed to create sqlstore")
		sess.mu.Lock()
		sess.Status = "disconnected"
		sess.mu.Unlock()
		return
	}

	sess.mu.Lock()
	sess.Container = container
	sess.mu.Unlock()

	// Get or create device store
	deviceStore, err := container.GetFirstDevice()
	if err != nil {
		log.Error().Err(err).Uint("deviceID", deviceID).Msg("Failed to get device store")
		sess.mu.Lock()
		sess.Status = "disconnected"
		sess.mu.Unlock()
		return
	}

	// Set device name/browser info
	store.DeviceProps.Os = proto.String("WaGataway")
	store.DeviceProps.PlatformType = store.DeviceProps_CHROME.Enum()

	clientLog := waLog.Noop
	client := whatsmeow.NewClient(deviceStore, clientLog)

	sess.mu.Lock()
	sess.Client = client
	sess.mu.Unlock()

	// Register event handler
	client.AddEventHandler(func(evt interface{}) {
		m.handleEvent(sess, evt)
	})

	// Check if already logged in
	if client.Store.ID == nil {
		// New device — need QR code scan
		m.connectWithQR(sess, client)
	} else {
		// Existing session — reconnect
		m.reconnectExisting(sess, client)
	}
}

// connectWithQR handles first-time connection with QR code scanning
func (m *Manager) connectWithQR(sess *SessionState, client *whatsmeow.Client) {
	deviceID := sess.DeviceID

	// Get QR channel
	qrChan, _ := client.GetQRChannel(context.Background())

	err := client.Connect()
	if err != nil {
		log.Error().Err(err).Uint("deviceID", deviceID).Msg("Failed to connect (QR mode)")
		sess.mu.Lock()
		sess.Status = "disconnected"
		sess.mu.Unlock()
		m.db.Model(&models.Device{}).Where("id = ?", deviceID).Update("status", "disconnected")
		return
	}

	// Listen for QR events
	for evt := range qrChan {
		switch evt.Event {
		case "code":
			// New QR code generated
			sess.mu.Lock()
			sess.QR = evt.Code
			sess.QRExpiry = time.Now().Add(60 * time.Second)
			sess.Status = "connecting"
			sess.mu.Unlock()

			m.db.Model(&models.Device{}).Where("id = ?", deviceID).Update("status", "connecting")

			log.Info().Uint("deviceID", deviceID).Msg("QR code generated, waiting for scan")

		case "login":
			// Successfully paired
			sess.mu.Lock()
			sess.QR = ""
			sess.Status = "connected"
			sess.mu.Unlock()

			phone := ""
			if client.Store.ID != nil {
				phone = client.Store.ID.User
			}

			now := time.Now()
			m.db.Model(&models.Device{}).Where("id = ?", deviceID).Updates(map[string]interface{}{
				"status":       "connected",
				"phone":        phone,
				"connected_at": &now,
				"last_seen":    &now,
			})

			log.Info().Uint("deviceID", deviceID).Str("phone", phone).Msg("WhatsApp paired successfully")
			return

		case "timeout":
			// QR timeout
			sess.mu.Lock()
			sess.QR = ""
			sess.Status = "disconnected"
			sess.mu.Unlock()

			m.db.Model(&models.Device{}).Where("id = ?", deviceID).Update("status", "disconnected")

			log.Warn().Uint("deviceID", deviceID).Msg("QR code timeout, not scanned")
			client.Disconnect()
			return
		}
	}
}

// reconnectExisting handles reconnection for an already-paired device
func (m *Manager) reconnectExisting(sess *SessionState, client *whatsmeow.Client) {
	deviceID := sess.DeviceID

	err := client.Connect()
	if err != nil {
		log.Error().Err(err).Uint("deviceID", deviceID).Msg("Failed to reconnect")
		sess.mu.Lock()
		sess.Status = "disconnected"
		sess.mu.Unlock()
		m.db.Model(&models.Device{}).Where("id = ?", deviceID).Update("status", "disconnected")
		return
	}

	// Connection established
	sess.mu.Lock()
	sess.Status = "connected"
	sess.QR = ""
	sess.mu.Unlock()

	phone := ""
	if client.Store.ID != nil {
		phone = client.Store.ID.User
	}

	now := time.Now()
	m.db.Model(&models.Device{}).Where("id = ?", deviceID).Updates(map[string]interface{}{
		"status":       "connected",
		"phone":        phone,
		"connected_at": &now,
		"last_seen":    &now,
	})

	log.Info().Uint("deviceID", deviceID).Str("phone", phone).Msg("WhatsApp reconnected")
}

// handleEvent processes whatsmeow events
func (m *Manager) handleEvent(sess *SessionState, evt interface{}) {
	switch v := evt.(type) {
	case *events.Message:
		m.handleIncomingMessage(sess, v)

	case *events.Connected:
		sess.mu.Lock()
		sess.Status = "connected"
		sess.QR = ""
		sess.mu.Unlock()

		now := time.Now()
		m.db.Model(&models.Device{}).Where("id = ?", sess.DeviceID).Updates(map[string]interface{}{
			"status":    "connected",
			"last_seen": &now,
		})
		log.Info().Uint("deviceID", sess.DeviceID).Msg("Connection established event")

	case *events.Disconnected:
		sess.mu.Lock()
		sess.Status = "disconnected"
		sess.mu.Unlock()

		m.db.Model(&models.Device{}).Where("id = ?", sess.DeviceID).Update("status", "disconnected")
		log.Warn().Uint("deviceID", sess.DeviceID).Msg("Disconnected from WhatsApp")

		// Auto-reconnect after a delay
		go func() {
			time.Sleep(5 * time.Second)
			m.Connect(sess.DeviceID, sess.UserID)
		}()

	case *events.LoggedOut:
		sess.mu.Lock()
		sess.Status = "disconnected"
		sess.Client = nil
		sess.mu.Unlock()

		m.db.Model(&models.Device{}).Where("id = ?", sess.DeviceID).Updates(map[string]interface{}{
			"status": "disconnected",
			"phone":  "",
		})
		log.Warn().Uint("deviceID", sess.DeviceID).Msg("Logged out from WhatsApp (session invalidated)")

	case *events.HistorySync:
		// Ignore history sync for now
		log.Debug().Uint("deviceID", sess.DeviceID).Msg("History sync received")

	case *events.Receipt:
		// Message delivery/read receipts
		m.handleReceipt(sess, v)

	case *events.Presence:
		// Online/offline presence updates
		log.Debug().Uint("deviceID", sess.DeviceID).Str("from", v.From.String()).Msg("Presence update")
	}
}

// handleIncomingMessage processes incoming WhatsApp messages
func (m *Manager) handleIncomingMessage(sess *SessionState, msg *events.Message) {
	// Skip messages from self
	if msg.Info.IsFromMe {
		return
	}

	// Skip group messages for now (can be enabled per-device)
	if msg.Info.IsGroup {
		return
	}

	// Extract text content
	text := extractMessageText(msg)
	sender := msg.Info.Sender.User

	log.Info().
		Uint("deviceID", sess.DeviceID).
		Str("from", sender).
		Str("text", truncate(text, 50)).
		Msg("Incoming message")

	// Save to chat inbox
	inbox := models.ChatInbox{
		UserID:    sess.UserID,
		DeviceID:  sess.DeviceID,
		Phone:     sender,
		Name:      msg.Info.PushName,
		Content:   text,
		Type:      getMessageType(msg),
		Direction: "in",
		IsRead:    false,
	}
	m.db.Create(&inbox)

	// Update or create conversation
	m.updateConversation(sess, sender, msg.Info.PushName, text)

	// Fire webhook
	go m.fireWebhooks(sess.UserID, sess.DeviceID, "message.received", map[string]interface{}{
		"from":      sender,
		"pushName":  msg.Info.PushName,
		"text":      text,
		"type":      getMessageType(msg),
		"timestamp": msg.Info.Timestamp,
	})

	// Check auto-reply rules
	go m.checkAutoReply(sess, sender, text)

	// Fire message handler callback
	if m.onMessage != nil {
		m.onMessage(sess.DeviceID, sess.UserID, msg)
	}
}

// handleReceipt processes message delivery receipts
func (m *Manager) handleReceipt(sess *SessionState, receipt *events.Receipt) {
	status := ""
	switch receipt.Type {
	case types.ReceiptTypeDelivered:
		status = "delivered"
	case types.ReceiptTypeRead:
		status = "read"
	default:
		return
	}

	// Update message status in DB
	for _, msgID := range receipt.MessageIDs {
		m.db.Model(&models.Message{}).
			Where("message_id = ? AND device_id = ?", msgID, sess.DeviceID).
			Update("status", status)
	}
}

// checkAutoReply checks if an incoming message matches any auto-reply rules
func (m *Manager) checkAutoReply(sess *SessionState, sender, text string) {
	if text == "" {
		return
	}

	var rules []models.AutoReply
	m.db.Where("user_id = ? AND is_active = ? AND (device_id IS NULL OR device_id = ?)",
		sess.UserID, true, sess.DeviceID).
		Order("priority DESC").
		Find(&rules)

	for _, rule := range rules {
		if matchKeyword(text, rule.Keyword, rule.MatchType) {
			// Check schedule
			if !isScheduleActive(rule.ScheduleFrom, rule.ScheduleTo) {
				continue
			}

			// Send auto-reply
			err := m.SendMessage(sess.DeviceID, sender, rule.ReplyType, rule.ReplyContent, rule.MediaURL)
			if err != nil {
				log.Error().Err(err).Uint("ruleID", rule.ID).Msg("Auto-reply failed")
			} else {
				log.Info().Uint("ruleID", rule.ID).Str("to", sender).Msg("Auto-reply sent")
			}
			return // Only first matching rule fires
		}
	}
}

// updateConversation creates or updates a chat conversation record
func (m *Manager) updateConversation(sess *SessionState, phone, pushName, lastMsg string) {
	var conv models.ChatConversation
	result := m.db.Where("user_id = ? AND device_id = ? AND phone = ?",
		sess.UserID, sess.DeviceID, phone).First(&conv)

	now := time.Now()
	if result.Error != nil {
		// Create new conversation
		conv = models.ChatConversation{
			UserID:       sess.UserID,
			DeviceID:     sess.DeviceID,
			Phone:        phone,
			ContactName:  pushName,
			LastMessage:  truncate(lastMsg, 200),
			UnreadCount:  1,
			LastActivity: now,
		}
		m.db.Create(&conv)
	} else {
		// Update existing
		m.db.Model(&conv).Updates(map[string]interface{}{
			"contact_name":  pushName,
			"last_message":  truncate(lastMsg, 200),
			"unread_count":  gorm.Expr("unread_count + 1"),
			"last_activity": now,
		})
	}
}

// fireWebhooks fires all active webhooks for a user/device event
func (m *Manager) fireWebhooks(userID, deviceID uint, event string, payload map[string]interface{}) {
	var hooks []models.Webhook
	m.db.Where("user_id = ? AND is_active = ?", userID, true).Find(&hooks)

	for _, hook := range hooks {
		// Check device filter
		if hook.DeviceID != nil && *hook.DeviceID != deviceID {
			continue
		}

		// TODO: Check if hook.Events contains this event
		// TODO: Fire HTTP POST to hook.URL with payload + hook.Secret header
		// This would use net/http with retries similar to the Node.js implementation
		_ = hook
		_ = event
		_ = payload
	}
}

// sendImageMessage uploads and sends an image
func (m *Manager) sendImageMessage(ctx context.Context, client *whatsmeow.Client, jid types.JID, mediaURL, caption string) error {
	// Download image from URL
	data, err := downloadFile(mediaURL)
	if err != nil {
		return fmt.Errorf("gagal download image: %w", err)
	}

	// Upload to WhatsApp
	uploaded, err := client.Upload(ctx, data, whatsmeow.MediaImage)
	if err != nil {
		return fmt.Errorf("gagal upload image: %w", err)
	}

	msg := &waE2E.Message{
		ImageMessage: &waE2E.ImageMessage{
			Caption:       proto.String(caption),
			URL:           proto.String(uploaded.URL),
			DirectPath:    proto.String(uploaded.DirectPath),
			MediaKey:      uploaded.MediaKey,
			Mimetype:      proto.String("image/jpeg"),
			FileEncSHA256: uploaded.FileEncSHA256,
			FileSHA256:    uploaded.FileSHA256,
			FileLength:    proto.Uint64(uint64(len(data))),
		},
	}

	_, err = client.SendMessage(ctx, jid, msg)
	return err
}

// sendDocumentMessage uploads and sends a document
func (m *Manager) sendDocumentMessage(ctx context.Context, client *whatsmeow.Client, jid types.JID, mediaURL, filename string) error {
	data, err := downloadFile(mediaURL)
	if err != nil {
		return fmt.Errorf("gagal download document: %w", err)
	}

	uploaded, err := client.Upload(ctx, data, whatsmeow.MediaDocument)
	if err != nil {
		return fmt.Errorf("gagal upload document: %w", err)
	}

	if filename == "" {
		filename = "document"
	}

	msg := &waE2E.Message{
		DocumentMessage: &waE2E.DocumentMessage{
			Title:         proto.String(filename),
			FileName:      proto.String(filename),
			URL:           proto.String(uploaded.URL),
			DirectPath:    proto.String(uploaded.DirectPath),
			MediaKey:      uploaded.MediaKey,
			Mimetype:      proto.String("application/octet-stream"),
			FileEncSHA256: uploaded.FileEncSHA256,
			FileSHA256:    uploaded.FileSHA256,
			FileLength:    proto.Uint64(uint64(len(data))),
		},
	}

	_, err = client.SendMessage(ctx, jid, msg)
	return err
}

// autoReconnect restores sessions for devices that were previously connected
func (m *Manager) autoReconnect() {
	time.Sleep(3 * time.Second) // Wait for server to fully boot

	var devices []models.Device
	m.db.Where("status = ?", "connected").Find(&devices)

	for _, d := range devices {
		log.Info().Uint("deviceID", d.ID).Str("name", d.Name).Msg("Auto-reconnecting device")
		m.Connect(d.ID, d.UserID)
		time.Sleep(2 * time.Second) // Stagger reconnections
	}

	if len(devices) > 0 {
		log.Info().Int("count", len(devices)).Msg("Auto-reconnect completed")
	}
}
