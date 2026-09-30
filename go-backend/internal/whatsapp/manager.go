package whatsapp

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waCompanionReg"
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
	// Flag perilaku device, di-cache dari DB (lihat deviceflags.go).
	// Dibaca ulang saat sesi terhubung dan saat diubah via API.
	AutoOnline      bool
	ReadReceipts    bool
	RejectCall      bool
	TypingIndicator bool
	mu              sync.RWMutex
}

// Manager coordinates all WhatsApp sessions
type Manager struct {
	sessions     map[uint]*SessionState
	mu           sync.RWMutex
	sessionDir   string
	db           *gorm.DB
	onMessage    func(deviceID, userID uint, msg *events.Message)
	shuttingDown atomic.Bool
	// Retry reconnect berulang dengan backoff: retryGen membatalkan loop lama,
	// manualStop menandai device yang sengaja diputus / logout (jangan di-retry).
	retryGen   map[uint]int
	manualStop map[uint]bool
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
		retryGen:   make(map[uint]int),
		manualStop: make(map[uint]bool),
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

	// Pengguna (atau retry loop) meminta konek: batalkan tanda stop manual
	delete(m.manualStop, deviceID)

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

	// Disconnect manual: hentikan semua retry loop yang sedang berjalan
	m.mu.Lock()
	m.manualStop[deviceID] = true
	m.retryGen[deviceID]++
	m.mu.Unlock()

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

	// Baca status sebelumnya dulu: hanya notifikasi jika transisi nyata
	// (bukan disconnect berulang) dan bukan saat graceful shutdown.
	var device models.Device
	wasDisconnected := true
	if err := m.db.Where("id = ?", deviceID).First(&device).Error; err == nil {
		wasDisconnected = device.Status == "disconnected"
	}

	// Update DB — lewati saat graceful shutdown agar status "connected"
	// tetap tersimpan dan autoReconnect bisa memulihkan sesi saat boot.
	if !m.shuttingDown.Load() {
		m.db.Model(&models.Device{}).Where("id = ?", deviceID).Update("status", "disconnected")
	}

	if !wasDisconnected && !m.shuttingDown.Load() {
		name := device.Name
		if name == "" {
			name = fmt.Sprintf("perangkat #%d", deviceID)
		}
		uid := sess.UserID
		m.db.Create(&models.Notification{
			UserID:  &uid,
			Type:    "device",
			Title:   "Perangkat terputus",
			Message: fmt.Sprintf("Perangkat %s terputus dari WhatsApp", name),
			Link:    "/devices",
		})
	}

	log.Info().Uint("deviceID", deviceID).Msg("WhatsApp session disconnected")
}

// DisconnectAll disconnects all active sessions (for graceful shutdown)
func (m *Manager) DisconnectAll() {
	// Tekan notifikasi per-device saat shutdown agar tidak spam
	m.shuttingDown.Store(true)
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

	// Indikator "mengetik..." bila flag typingIndicator aktif.
	// Dikirim sebelum pesan (composing), dihentikan setelah pesan terkirim (paused).
	sess.mu.RLock()
	typing := sess.TypingIndicator
	sess.mu.RUnlock()
	if typing {
		tpCtx, tpCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer tpCancel()
		_ = sess.Client.SendChatPresence(tpCtx, jid, types.ChatPresenceComposing, types.ChatPresenceMediaText)
		defer func() {
			_ = sess.Client.SendChatPresence(context.Background(), jid, types.ChatPresencePaused, types.ChatPresenceMediaText)
		}()
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

	resp, err := sess.Client.IsOnWhatsApp(context.Background(), []string{jid.User})
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

	groups, err := sess.Client.GetJoinedGroups(context.Background())
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
	container, err := sqlstore.New(context.Background(), "sqlite3", dbURI, dbLog)
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
	deviceStore, err := container.GetFirstDevice(context.Background())
	if err != nil {
		log.Error().Err(err).Uint("deviceID", deviceID).Msg("Failed to get device store")
		sess.mu.Lock()
		sess.Status = "disconnected"
		sess.mu.Unlock()
		return
	}

	// Set device name/browser info
	store.DeviceProps.Os = proto.String("WaGataway")
	store.DeviceProps.PlatformType = waCompanionReg.DeviceProps_CHROME.Enum()

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
		// Jangan menyerah: coba lagi dengan backoff
		go m.reconnectWithBackoff(deviceID, sess.UserID)
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

// reconnectWithBackoff mencoba menyambung ulang BERULANG dengan backoff
// eksponensial (5 dtk, 10 dtk, 20 dtk, ... maks 5 mnt) sampai berhasil.
// Berhenti bila: device terhubung, disconnect manual, logout (sesi invalid),
// ada loop retry yang lebih baru, atau server shutdown.
func (m *Manager) reconnectWithBackoff(deviceID, userID uint) {
	m.mu.Lock()
	m.retryGen[deviceID]++
	gen := m.retryGen[deviceID]
	m.mu.Unlock()

	backoff := 5 * time.Second
	const maxBackoff = 5 * time.Minute

	stopped := func() bool {
		m.mu.RLock()
		defer m.mu.RUnlock()
		return m.retryGen[deviceID] != gen || m.manualStop[deviceID]
	}

	for {
		if stopped() || m.shuttingDown.Load() {
			return
		}

		time.Sleep(backoff)

		if stopped() || m.shuttingDown.Load() {
			return
		}
		if m.GetStatus(deviceID) == "connected" {
			return
		}

		log.Info().Uint("deviceID", deviceID).Dur("backoff", backoff).Msg("Retrying WhatsApp connection")
		m.Connect(deviceID, userID)

		backoff *= 2
		if backoff > maxBackoff {
			backoff = maxBackoff
		}
	}
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
		updates := map[string]interface{}{
			"status":    "connected",
			"last_seen": &now,
		}
		// Pairing via kode pairing tidak melewati event "login" QR,
		// jadi nomor HP + connected_at diisi di sini bila sesi sudah terautentikasi.
		if sess.Client != nil && sess.Client.Store.ID != nil && sess.Client.Store.ID.User != "" {
			updates["phone"] = sess.Client.Store.ID.User
			updates["connected_at"] = &now
		}
		m.db.Model(&models.Device{}).Where("id = ?", sess.DeviceID).Updates(updates)
		// Auto-resolve notifikasi "Perangkat terputus" untuk device ini
		// (notif basi hilang sendiri begitu perangkat tersambung ulang).
		var dName models.Device
		devName := fmt.Sprintf("perangkat #%d", sess.DeviceID)
		if err := m.db.Select("name").Where("id = ?", sess.DeviceID).First(&dName).Error; err == nil && dName.Name != "" {
			devName = dName.Name
		}
		m.db.Model(&models.Notification{}).
			Where("user_id = ? AND type = ? AND title = ? AND is_read = ? AND message LIKE ?",
				sess.UserID, "device", "Perangkat terputus", false, "%"+devName+"%").
			Update("is_read", true)

		log.Info().Uint("deviceID", sess.DeviceID).Msg("Connection established event")

		// Muat flag perilaku device lalu terapkan presence
		m.loadDeviceFlags(sess)
		go m.applyPresence(sess)

	case *events.Disconnected:
		sess.mu.Lock()
		sess.Status = "disconnected"
		sess.mu.Unlock()

		m.db.Model(&models.Device{}).Where("id = ?", sess.DeviceID).Update("status", "disconnected")
		log.Warn().Uint("deviceID", sess.DeviceID).Msg("Disconnected from WhatsApp")

		// Auto-reconnect dengan retry berulang + backoff (bukan sekali coba)
		go m.reconnectWithBackoff(sess.DeviceID, sess.UserID)

	case *events.LoggedOut:
		sess.mu.Lock()
		sess.Status = "disconnected"
		sess.Client = nil
		sess.mu.Unlock()

		// Sesi di-invalidasi WhatsApp: butuh scan QR ulang, jangan di-retry
		m.mu.Lock()
		m.manualStop[sess.DeviceID] = true
		m.retryGen[sess.DeviceID]++
		m.mu.Unlock()

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

	case *events.CallOffer:
		// Panggilan WhatsApp masuk — tolak otomatis bila flag rejectCall aktif
		go m.handleCallOffer(sess, v)
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

	// Tandai sudah dibaca bila flag readReceipts aktif (non-blocking)
	go m.maybeMarkRead(sess, msg)
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

// fireWebhooks fires all active webhooks for a user/device event.
// Tiap hook dikirim via goroutine sendiri agar tidak memblokir pipeline pesan.
func (m *Manager) fireWebhooks(userID, deviceID uint, event string, payload map[string]interface{}) {
	var hooks []models.Webhook
	m.db.Where("user_id = ? AND is_active = ?", userID, true).Find(&hooks)

	for _, hook := range hooks {
		// Check device filter
		if hook.DeviceID != nil && *hook.DeviceID != deviceID {
			continue
		}

		// Check event filter (events kosong = langganan semua event)
		if !webhookWantsEvent(hook.Events, event) {
			continue
		}

		go m.deliverWebhook(hook, deviceID, event, payload)
	}

	// Webhook URL per-device (diisi dari modal Tambah/Edit Perangkat):
	// kirim envelope payload yang sama ke URL tersebut.
	var dev models.Device
	if err := m.db.Select("webhook_url").Where("id = ?", deviceID).First(&dev).Error; err == nil {
		if url := strings.TrimSpace(dev.WebhookURL); url != "" {
			go func() {
				body := map[string]interface{}{
					"event":     event,
					"device_id": deviceID,
					"payload":   payload,
					"sent_at":   time.Now().UTC().Format(time.RFC3339),
				}
				raw, err := json.Marshal(body)
				if err != nil {
					log.Error().Err(err).Uint("deviceID", deviceID).Msg("Failed to marshal device webhook payload")
					return
				}
				statusCode, success, errMsg, _ := DeliverWebhookPayload(url, "", event, raw)
				if !success {
					log.Warn().Uint("deviceID", deviceID).Str("event", event).Int("status", statusCode).Str("error", errMsg).Msg("Device webhook delivery failed")
				} else {
					log.Info().Uint("deviceID", deviceID).Str("event", event).Int("status", statusCode).Msg("Device webhook delivered")
				}
			}()
		}
	}
}

// webhookWantsEvent: true jika event ada di JSON array events milik hook,
// atau jika events kosong / tidak bisa di-parse (anggap semua event).
func webhookWantsEvent(eventsJSON, event string) bool {
	eventsJSON = strings.TrimSpace(eventsJSON)
	if eventsJSON == "" {
		return true
	}
	var events []string
	if err := json.Unmarshal([]byte(eventsJSON), &events); err != nil {
		return true
	}
	if len(events) == 0 {
		return true
	}
	for _, e := range events {
		if e == event {
			return true
		}
	}
	return false
}

// deliverWebhook mengirim satu webhook dan mencatat hasilnya ke webhook_deliveries.
func (m *Manager) deliverWebhook(hook models.Webhook, deviceID uint, event string, payload map[string]interface{}) {
	body := map[string]interface{}{
		"event":     event,
		"device_id": deviceID,
		"payload":   payload,
		"sent_at":   time.Now().UTC().Format(time.RFC3339),
	}
	raw, err := json.Marshal(body)
	if err != nil {
		log.Error().Err(err).Uint("webhookID", hook.ID).Msg("Failed to marshal webhook payload")
		return
	}

	statusCode, success, errMsg, durationMs := DeliverWebhookPayload(hook.URL, hook.Secret, event, raw)

	m.db.Create(&models.WebhookDelivery{
		WebhookID:  hook.ID,
		Event:      event,
		StatusCode: statusCode,
		Success:    success,
		ErrorMsg:   errMsg,
		DurationMs: durationMs,
		Payload:    string(raw),
	})

	now := time.Now()
	m.db.Model(&models.Webhook{}).Where("id = ?", hook.ID).Updates(map[string]interface{}{
		"trigger_count":  gorm.Expr("trigger_count + 1"),
		"last_triggered": now,
	})

	if !success {
		log.Warn().Uint("webhookID", hook.ID).Str("event", event).Str("error", errMsg).Msg("Webhook delivery failed")
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
