package whatsapp

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"math/rand"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/realtime"
	"github.com/Aldi1963/wagataway/internal/security"
	"github.com/rs/zerolog/log"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waCompanionReg"
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
	// Welcome DM: antrean pengiriman (jeda 4 detik antar DM agar tidak kena
	// rate limit) + klaim anti-duplikat per (device, grup, nomor) 24 jam.
	welcomeDMCh     chan welcomeDMJob
	welcomeDMClaims map[string]time.Time
	welcomeDMMu     sync.Mutex
	welcomeDMOnce   sync.Once
	// Presence live chat: deviceID → JID string → state.
	presenceMu sync.RWMutex
	presence   map[uint]map[string]PresenceState
}

// PresenceState menyimpan status online/mengetik terakhir sebuah kontak
// untuk satu device. Diisi dari events.Presence & events.ChatPresence.
type PresenceState struct {
	Online   bool
	Typing   bool
	LastSeen time.Time
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
		presence:   make(map[uint]map[string]PresenceState),
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

// ProcessBulkJob memproses bulk job dengan rotasi pengirim round-robin antar
// device yang connected. Setiap device mengirim antreannya sendiri secara
// paralel dengan jeda acak min–max detik antar pesan (per device).
// Failover: bila satu device disconnect di tengah jalan, sisa antreannya
// otomatis dialihkan ke device lain yang masih connected (ronde berikutnya).
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
	db.Where("bulk_job_id = ? AND status = ?", jobID, "pending").Order("id ASC").Find(&recipients)

	campaignID := fmt.Sprintf("bulk-%d", jobID)

	// Device milik user dari daftar rotasi (urutan request dipertahankan).
	deviceIDs := job.GetDeviceIDs()
	var owned []models.Device
	if len(deviceIDs) > 0 {
		db.Where("user_id = ? AND id IN ?", job.UserID, deviceIDs).Find(&owned)
	}
	ownedSet := map[uint]bool{}
	for _, d := range owned {
		ownedSet[d.ID] = true
	}
	liveDevices := func() []uint {
		var live []uint
		for _, id := range deviceIDs {
			if !ownedSet[id] {
				continue // bukan milik user / sudah dihapus
			}
			if m.GetStatus(id) == "connected" {
				live = append(live, id)
			}
		}
		return live
	}

	live := liveDevices()
	if len(live) == 0 {
		errMsg := "Tidak ada perangkat pengirim yang terhubung"
		for _, r := range recipients {
			db.Model(&r).Updates(map[string]interface{}{
				"status":    "failed",
				"error_msg": errMsg,
			})
			recordMessageReport(db, job.UserID, job.DeviceID, campaignID, r.Phone, "", "failed", errMsg, time.Now())
		}
		m.finishBulkJob(db, &job)
		return
	}

	// Ronde failover: antrean yang dikembalikan device yang mati didistribusikan
	// ulang ke device yang masih hidup. Dibatasi 10 ronde agar tidak loop selamanya.
	pending := recipients
	for round := 0; len(pending) > 0 && round < 10; round++ {
		if round > 0 {
			live = liveDevices()
			if len(live) == 0 {
				break
			}
		}

		queues := distributeBulkRecipients(pending, live)

		var wg sync.WaitGroup
		var mu sync.Mutex
		var requeue []models.BulkJobRecipient
		for i, q := range queues {
			if len(q) == 0 {
				continue
			}
			wg.Add(1)
			go func(deviceID uint, q []models.BulkJobRecipient) {
				defer wg.Done()
				if rest := m.processBulkQueue(db, &job, deviceID, q, campaignID); len(rest) > 0 {
					mu.Lock()
					requeue = append(requeue, rest...)
					mu.Unlock()
					log.Warn().
						Uint("jobID", jobID).
						Uint("deviceID", deviceID).
						Int("requeued", len(rest)).
						Msg("Device terputus saat blast, antrean dialihkan (failover)")
				}
			}(live[i], q)
		}
		wg.Wait()
		pending = requeue
	}

	// Sisa antrean yang tidak bisa dialihkan (semua device mati) → failed.
	if len(pending) > 0 {
		errMsg := "Semua perangkat terputus sebelum pesan terkirim"
		for _, r := range pending {
			db.Model(&r).Updates(map[string]interface{}{
				"status":    "failed",
				"error_msg": errMsg,
			})
			recordMessageReport(db, job.UserID, job.DeviceID, campaignID, r.Phone, "", "failed", errMsg, time.Now())
		}
	}

	m.finishBulkJob(db, &job)
}

// personalizeBulkContent mengganti variabel template di konten blast per
// penerima. Variabel yang didukung: {nama} (nama kontak, fallback nomor HP),
// {nomor} (nomor penerima). Tanpa variabel, konten dikembalikan apa adanya.
func personalizeBulkContent(content string, r models.BulkJobRecipient) string {
	if !strings.Contains(content, "{") {
		return content
	}
	name := strings.TrimSpace(r.Name)
	if name == "" {
		name = r.Phone
	}
	out := strings.ReplaceAll(content, "{nama}", name)
	out = strings.ReplaceAll(out, "{nomor}", r.Phone)
	return out
}

// processBulkQueue mengirim satu antrean penerima via satu device, dengan jeda
// acak min–max detik antar pesan (berlaku per device). Mengembalikan sisa
// antrean bila device disconnect di tengah jalan (untuk failover ke device
// lain); nil bila antrean habis terkirim.
func (m *Manager) processBulkQueue(db *gorm.DB, job *models.BulkJob, deviceID uint, queue []models.BulkJobRecipient, campaignID string) []models.BulkJobRecipient {
	for i, r := range queue {
		// Cek koneksi sebelum tiap pesan: device mati → sisa antrean difailover.
		if m.GetStatus(deviceID) != "connected" {
			return queue[i:]
		}

		waMsgID, err := m.SendMessageWithOptions(deviceID, r.Phone, SendOptions{
			Type:     job.Type,
			Content:  personalizeBulkContent(job.Content, r),
			MediaURL: job.MediaURL,
		})

		sentAt := time.Now()
		if err != nil {
			if isDisconnectError(err) || m.GetStatus(deviceID) != "connected" {
				// Device putus saat mengirim → pesan ini + sisanya difailover.
				return queue[i:]
			}
			db.Model(&r).Updates(map[string]interface{}{
				"status":    "failed",
				"error_msg": err.Error(),
				"device_id": deviceID,
			})
			recordMessageReport(db, job.UserID, deviceID, campaignID, r.Phone, "", "failed", err.Error(), sentAt)
		} else {
			db.Model(&r).Updates(map[string]interface{}{
				"status":    "sent",
				"sent_at":   &sentAt,
				"device_id": deviceID,
			})
			recordMessageReport(db, job.UserID, deviceID, campaignID, r.Phone, waMsgID, "sent", "", sentAt)
		}

		// Jeda acak antar pesan untuk device ini (anti-ban). Defensif terhadap
		// konfigurasi max < min agar tidak panic di rand.Intn.
		minD, maxD := job.MinDelay, job.MaxDelay
		if maxD < minD {
			maxD = minD
		}
		if maxD > 0 {
			time.Sleep(time.Duration(minD+rand.Intn(maxD-minD+1)) * time.Second)
		}
	}
	return nil
}

// finishBulkJob menghitung ulang sent/failed dari DB (aman dari race antar
// worker) lalu menandai job selesai.
func (m *Manager) finishBulkJob(db *gorm.DB, job *models.BulkJob) {
	var sent, failed int64
	db.Model(&models.BulkJobRecipient{}).Where("bulk_job_id = ? AND status = ?", job.ID, "sent").Count(&sent)
	db.Model(&models.BulkJobRecipient{}).Where("bulk_job_id = ? AND status = ?", job.ID, "failed").Count(&failed)

	completed := time.Now()
	status := "completed"
	if failed > 0 && sent == 0 {
		status = "failed"
	}

	db.Model(job).Updates(map[string]interface{}{
		"status":       status,
		"sent_count":   sent,
		"failed_count": failed,
		"completed_at": &completed,
	})

	log.Info().
		Uint("jobID", job.ID).
		Int64("sent", sent).
		Int64("failed", failed).
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
		// Reaksi emoji ditangkap di sini (SEBELUM handleIncomingMessage)
		// agar tidak masuk alur bot/menu/AI/webhook.
		if v.Message.GetReactionMessage() != nil {
			go m.handleIncomingReaction(sess, v)
			return
		}
		// Vote polling ditangkap di sini (SEBELUM handleIncomingMessage)
		// agar tidak masuk ke alur bot/menu/AI/webhook termasuk webhook bot PPOB.
		if v.Message.GetPollUpdateMessage() != nil {
			go m.handlePollVote(sess, v)
			return
		}
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

	case *events.GroupInfo:
		// Perubahan info grup — pakai untuk welcome message anggota baru
		// (evt.Join terisi saat ada anggota yang join/ditambahkan).
		go m.handleGroupParticipantChange(sess, v)

	case *events.Presence:
		// Online/offline presence updates — disimpan ke presence store
		// dan disiarkan via SSE (live chat ala WA native).
		go m.handlePresenceEvent(sess, v)

	case *events.ChatPresence:
		// Notifikasi "mengetik..." — disimpan ke presence store
		// dan disiarkan via SSE.
		go m.handleChatPresenceEvent(sess, v)

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

	// Extract text content
	text := extractMessageText(msg)
	sender := msg.Info.Sender.User
	// JID lengkap pengirim (bisa @lid atau @s.whatsapp.net) — disimpan agar
	// balasan tidak perlu lookup PN→LID yang bisa gagal ("no LID found").
	senderJID := msg.Info.Sender.String()

	// Nomor telepon asli pengirim untuk webhook/integrasi (mis. bot PPOB
	// mencocokkan `from` dengan nomor WA user). Bila pengirim berupa LID,
	// pakai SenderAlt (PN) agar bukan ID LID yang dikirim.
	senderPhone := sender
	if msg.Info.Sender.Server == types.HiddenUserServer && msg.Info.SenderAlt.User != "" &&
		msg.Info.SenderAlt.Server == types.DefaultUserServer {
		senderPhone = msg.Info.SenderAlt.User
	}

	// Bila pengirim berupa LID dan nomor asli (PN) diketahui, migrasi
	// percakapan + inbox lama dari kunci LID ke PN agar header Live Chat
	// menampilkan nomor telepon asli, bukan ID LID. SenderJID (LID) tetap
	// disimpan untuk pengiriman balasan.
	if senderPhone != sender {
		m.migrateLIDConversation(sess.UserID, sess.DeviceID, sender, senderPhone)
	}

	// Chatbot menu bertingkat — dievaluasi DULU sebelum AI reply & auto-reply.
	// Bila ia menangani pesan (sesi menu aktif / keyword cocok / selalu-aktif),
	// keduanya dilewati agar tidak bentrok. Default nonaktif per device.
	menuHandled := m.checkMenuBot(sess, senderJID, senderPhone, text, msg.Info.IsGroup)

	// AI auto-reply hook — non-blocking, gagal diam-diam (hanya log).
	// Dipanggil sebelum skip grup agar config dengan IgnoreGroups=false tetap jalan di grup.
	// Di chat pribadi, auto-reply (rule eksplisit) menang atas AI reply agar pengirim
	// tidak menerima dua balasan sekaligus; AI menjadi fallback bila tak ada rule yang cocok.
	if !menuHandled {
		if msg.Info.IsGroup {
			go m.checkAIReply(sess, senderJID, text, true)
		} else if m.findAutoReplyRule(sess, text) != nil {
			go m.checkAutoReply(sess, senderJID, text)
		} else {
			go m.checkAIReply(sess, senderJID, text, false)
		}
	}

	// Aturan grup (anti-link, anti-spam) — non-blocking, gagal diam-diam.
	if msg.Info.IsGroup {
		go m.checkGroupRules(sess, sender, text, msg.Info.Chat.String())
	}

	// Skip group messages for now (can be enabled per-device)
	if msg.Info.IsGroup {
		return
	}

	log.Info().
		Uint("deviceID", sess.DeviceID).
		Str("from", sender).
		Str("text", truncate(text, 50)).
		Msg("Incoming message")

	// Save to chat inbox
	replyTo, replyContent := extractQuoteInfo(msg)
	inbox := models.ChatInbox{
		UserID:       sess.UserID,
		DeviceID:     sess.DeviceID,
		Phone:        senderPhone,
		SenderJID:    senderJID,
		Name:         msg.Info.PushName,
		Content:      text,
		Type:         getMessageType(msg),
		Direction:    "in",
		IsRead:       false,
		WaMessageID:  string(msg.Info.ID),
		ReplyTo:      replyTo,
		ReplyContent: replyContent,
	}
	m.db.Create(&inbox)

	// Update or create conversation
	m.updateConversation(sess, senderPhone, senderJID, msg.Info.PushName, text, getMessageType(msg))

	// Fire webhook
	go m.fireWebhooks(sess.UserID, sess.DeviceID, "message.received", map[string]interface{}{
		"from":      senderPhone,
		"senderJID": senderJID,
		"pushName":  msg.Info.PushName,
		"text":      text,
		"type":      getMessageType(msg),
		"timestamp": msg.Info.Timestamp,
	})

	// Fire message handler callback
	if m.onMessage != nil {
		m.onMessage(sess.DeviceID, sess.UserID, msg)
	}

	// Tandai sudah dibaca bila flag readReceipts aktif (non-blocking)
	go m.maybeMarkRead(sess, msg)
}

// handleIncomingReaction memproses reaksi emoji masuk: update kolom Reactions
// pada pesan yang dituju (dicocokkan via wa_message_id + device) lalu
// disiarkan via SSE. Tidak masuk alur bot/menu/AI/webhook.
func (m *Manager) handleIncomingReaction(sess *SessionState, v *events.Message) {
	rm := v.Message.GetReactionMessage()
	if rm == nil || rm.GetKey() == nil {
		return
	}
	targetID := rm.GetKey().GetID()
	if targetID == "" {
		return
	}
	emoji := rm.GetText() // "" = hapus reaksi

	var inbox models.ChatInbox
	if err := m.db.Where("device_id = ? AND wa_message_id = ? AND user_id = ?",
		sess.DeviceID, targetID, sess.UserID).First(&inbox).Error; err != nil {
		// Pesan yang dituju tidak tercatat di live chat — abaikan.
		log.Debug().Uint("deviceID", sess.DeviceID).Str("targetID", targetID).
			Msg("Reaction untuk pesan yang tidak dikenal, diabaikan")
		return
	}

	reactions := AddChatReaction(inbox.Reactions, emoji, false)
	m.db.Model(&inbox).Update("reactions", reactions)

	log.Debug().Uint("deviceID", sess.DeviceID).Str("targetID", targetID).
		Str("emoji", emoji).Msg("Incoming reaction")

	realtime.DefaultHub.SendToUser(sess.UserID, realtime.Event{
		Type: "chat:reaction",
		Payload: map[string]interface{}{
			"deviceId":    sess.DeviceID,
			"phone":       inbox.Phone,
			"waMessageId": targetID,
			"emoji":       emoji,
			"fromMe":      false,
		},
	})
}

// handlePresenceEvent menyimpan status online/offline kontak dan menyiarkannya via SSE.
func (m *Manager) handlePresenceEvent(sess *SessionState, v *events.Presence) {
	jidStr := v.From.String()
	m.presenceMu.Lock()
	if m.presence[sess.DeviceID] == nil {
		m.presence[sess.DeviceID] = make(map[string]PresenceState)
	}
	st := m.presence[sess.DeviceID][jidStr]
	st.Online = !v.Unavailable
	st.LastSeen = time.Now()
	m.presence[sess.DeviceID][jidStr] = st
	typing := st.Typing
	m.presenceMu.Unlock()

	log.Debug().Uint("deviceID", sess.DeviceID).Str("from", jidStr).
		Bool("online", st.Online).Msg("Presence update")

	realtime.DefaultHub.SendToUser(sess.UserID, realtime.Event{
		Type: "chat:presence",
		Payload: map[string]interface{}{
			"deviceId": sess.DeviceID,
			"jid":      jidStr,
			"phone":    m.resolvePresencePhone(sess, v.From),
			"online":   st.Online,
			"typing":   typing,
		},
	})
}

// handleChatPresenceEvent menyimpan status "mengetik..." kontak dan menyiarkannya via SSE.
func (m *Manager) handleChatPresenceEvent(sess *SessionState, v *events.ChatPresence) {
	// Untuk DM, Chat = JID lawan bicara.
	jidStr := v.Chat.String()
	m.presenceMu.Lock()
	if m.presence[sess.DeviceID] == nil {
		m.presence[sess.DeviceID] = make(map[string]PresenceState)
	}
	st := m.presence[sess.DeviceID][jidStr]
	st.Typing = v.State == types.ChatPresenceComposing
	st.LastSeen = time.Now()
	m.presence[sess.DeviceID][jidStr] = st
	online := st.Online
	m.presenceMu.Unlock()

	realtime.DefaultHub.SendToUser(sess.UserID, realtime.Event{
		Type: "chat:presence",
		Payload: map[string]interface{}{
			"deviceId": sess.DeviceID,
			"jid":      jidStr,
			"phone":    m.resolvePresencePhone(sess, v.Chat),
			"online":   online,
			"typing":   st.Typing,
		},
	})
}

// resolvePresencePhone mencocokkan JID presence ke nomor phone yang dipakai
// live chat. Best effort: cari percakapan via sender_jid, fallback ke user
// JID bila server-nya s.whatsapp.net, else "" (frontend bisa cocokkan via jid).
func (m *Manager) resolvePresencePhone(sess *SessionState, jid types.JID) string {
	var conv models.ChatConversation
	if err := m.db.Select("phone").Where("user_id = ? AND device_id = ? AND sender_j_id = ?",
		sess.UserID, sess.DeviceID, jid.String()).First(&conv).Error; err == nil && conv.Phone != "" {
		return conv.Phone
	}
	if jid.Server == types.DefaultUserServer {
		return jid.User
	}
	return ""
}

// GetPresence mengembalikan state presence terakhir sebuah JID untuk device.
// JID kosong bila belum ada data.
func (m *Manager) GetPresence(deviceID uint, jid string) PresenceState {
	m.presenceMu.RLock()
	defer m.presenceMu.RUnlock()
	if m.presence[deviceID] == nil {
		return PresenceState{}
	}
	return m.presence[deviceID][jid]
}

// SubscribePresenceTo meminta update presence (online/mengetik) untuk sebuah
// kontak. `to` boleh berupa nomor HP maupun JID lengkap. Best effort:
// kegagalan tidak fatal bagi pemanggil.
func (m *Manager) SubscribePresenceTo(deviceID uint, to string) error {
	m.mu.RLock()
	sess, exists := m.sessions[deviceID]
	m.mu.RUnlock()

	if !exists || sess.Status != "connected" || sess.Client == nil {
		return fmt.Errorf("device %d tidak terhubung", deviceID)
	}

	var jid types.JID
	var err error
	if strings.Contains(to, "@") {
		jid, err = types.ParseJID(to)
	} else {
		jid, err = parseJID(to)
	}
	if err != nil {
		return fmt.Errorf("tujuan tidak valid: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// WhatsApp hanya mengirim update ChatPresence bila kita menandai diri online.
	if err := sess.Client.SendPresence(ctx, types.PresenceAvailable); err != nil {
		log.Warn().Err(err).Uint("deviceID", deviceID).Msg("Gagal menandai presence available (best effort)")
	}
	return sess.Client.SubscribePresence(ctx, jid)
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

	// Update message status in DB (messages + message_reports bila tercatat).
	for _, msgID := range receipt.MessageIDs {
		m.db.Model(&models.Message{}).
			Where("message_id = ? AND device_id = ?", msgID, sess.DeviceID).
			Update("status", status)

		// Fire webhook bila pesan ini milik kita (punya MessageID tercatat).
		var msg models.Message
		if err := m.db.Select("id", `"to"`).
			Where("message_id = ? AND device_id = ?", msgID, sess.DeviceID).
			First(&msg).Error; err == nil {
			go m.fireWebhooks(sess.UserID, sess.DeviceID, "message."+status, map[string]interface{}{
				"messageId": msgID,
				"dbId":      msg.ID,
				"to":        msg.To,
				"status":    status,
			})
		}
	}

	// Perbarui juga laporan broadcast (message_reports) bila pesan ini tercatat
	// saat pengiriman (dicocokkan via message_id + device_id).
	if len(receipt.MessageIDs) > 0 {
		m.db.Model(&models.MessageReport{}).
			Where("message_id IN ? AND device_id = ?", receipt.MessageIDs, sess.DeviceID).
			Update("status", status)
	}
}

// findAutoReplyRule mengembalikan rule auto-reply pertama yang cocok untuk pesan
// (prioritas tertinggi), atau nil bila tidak ada. Dipakai untuk menentukan apakah
// AI reply perlu dilewati agar pengirim tidak menerima dua balasan sekaligus.
func (m *Manager) findAutoReplyRule(sess *SessionState, text string) *models.AutoReply {
	if text == "" {
		return nil
	}

	var rules []models.AutoReply
	m.db.Where("user_id = ? AND is_active = ? AND (device_id IS NULL OR device_id = ?)",
		sess.UserID, true, sess.DeviceID).
		Order("priority DESC").
		Find(&rules)

	for i := range rules {
		rule := &rules[i]
		if matchKeyword(text, rule.Keyword, rule.MatchType) && isScheduleActive(rule.ScheduleFrom, rule.ScheduleTo) {
			return rule
		}
	}
	return nil
}

// checkAutoReply checks if an incoming message matches any auto-reply rules
func (m *Manager) checkAutoReply(sess *SessionState, senderJID, text string) {
	rule := m.findAutoReplyRule(sess, text)
	if rule == nil {
		return
	}

	// Send auto-reply — senderJID bisa berupa "user@lid", parseJID menanganinya
	// tanpa lookup PN→LID.
	err := m.SendMessage(sess.DeviceID, senderJID, rule.ReplyType, rule.ReplyContent, rule.MediaURL)
	if err != nil {
		log.Error().Err(err).Uint("ruleID", rule.ID).Msg("Auto-reply failed")
	} else {
		log.Info().Uint("ruleID", rule.ID).Str("to", senderJID).Msg("Auto-reply sent")
	}
}

// updateConversation creates or updates a chat conversation record
func (m *Manager) updateConversation(sess *SessionState, phone, senderJID, pushName, lastMsg, msgType string) {
	var conv models.ChatConversation
	result := m.db.Where("user_id = ? AND device_id = ? AND phone = ?",
		sess.UserID, sess.DeviceID, phone).First(&conv)

	now := time.Now()
	if result.Error != nil {
		// Create new conversation
		conv = models.ChatConversation{
			UserID:          sess.UserID,
			DeviceID:        sess.DeviceID,
			Phone:           phone,
			SenderJID:       senderJID,
			ContactName:     pushName,
			LastMessage:     truncate(lastMsg, 200),
			LastMessageType: msgType,
			UnreadCount:     1,
			LastActivity:    now,
		}
		m.db.Create(&conv)
	} else {
		// Update existing — refresh SenderJID juga agar percakapan lama ikut terkoreksi
		updates := map[string]interface{}{
			"contact_name":      pushName,
			"last_message":      truncate(lastMsg, 200),
			"last_message_type": msgType,
			"unread_count":      gorm.Expr("unread_count + 1"),
			"last_activity":     now,
		}
		if senderJID != "" {
			updates["sender_j_id"] = senderJID
		}
		m.db.Model(&conv).Updates(updates)
	}
}

// migrateLIDConversation memindahkan percakapan + pesan inbox dari kunci LID
// ke nomor telepon asli (PN) begitu SenderAlt tersedia. Tidak menggabungkan:
// bila sudah ada percakapan dengan nomor asli, yang lama dibiarkan apa adanya.
func (m *Manager) migrateLIDConversation(userID, deviceID uint, lidPhone, realPhone string) {
	if lidPhone == "" || realPhone == "" || lidPhone == realPhone {
		return
	}
	var existing models.ChatConversation
	if err := m.db.Where("user_id = ? AND device_id = ? AND phone = ?",
		userID, deviceID, realPhone).First(&existing).Error; err == nil {
		return
	}
	m.db.Model(&models.ChatConversation{}).
		Where("user_id = ? AND device_id = ? AND phone = ?", userID, deviceID, lidPhone).
		Update("phone", realPhone)
	m.db.Model(&models.ChatInbox{}).
		Where("user_id = ? AND device_id = ? AND phone = ?", userID, deviceID, lidPhone).
		Update("phone", realPhone)
}

// ResolvePNForLID memetakan LID ke nomor telepon asli (PN) lewat cache
// LID→PN di session store WhatsApp. Mengembalikan "" bila tidak ketemu
// (mis. device offline atau mapping belum pernah terlihat).
func (m *Manager) ResolvePNForLID(deviceID uint, lidUser string) string {
	if lidUser == "" {
		return ""
	}
	m.mu.RLock()
	sess, ok := m.sessions[deviceID]
	m.mu.RUnlock()
	if !ok || sess == nil || sess.Client == nil || sess.Client.Store == nil {
		return ""
	}
	lidJID := types.NewJID(lidUser, types.HiddenUserServer)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	pn, err := sess.Client.Store.LIDs.GetPNForLID(ctx, lidJID)
	if err != nil || pn.User == "" || pn.Server != types.DefaultUserServer {
		return ""
	}
	return pn.User
}

// BackfillLIDConversations memigrasi semua percakapan berkunci LID milik
// user+device ke nomor asli bila mapping LID→PN tersedia. Dipanggil saat
// daftar percakapan dimuat agar header Live Chat menampilkan nomor asli
// tanpa menunggu pesan baru. Mengembalikan jumlah percakapan yang dimigrasi.
func (m *Manager) BackfillLIDConversations(userID, deviceID uint) int {
	var convs []models.ChatConversation
	m.db.Where("user_id = ? AND device_id = ? AND sender_j_id LIKE ?", userID, deviceID, "%@lid").
		Find(&convs)
	migrated := 0
	for _, conv := range convs {
		lidUser := strings.TrimSuffix(conv.SenderJID, "@"+types.HiddenUserServer)
		// Hanya yang kuncinya masih LID; yang sudah bermigrasi dilewati.
		if lidUser == "" || conv.Phone != lidUser {
			continue
		}
		if pn := m.ResolvePNForLID(deviceID, lidUser); pn != "" && pn != lidUser {
			m.migrateLIDConversation(userID, deviceID, lidUser, pn)
			migrated++
			log.Info().Uint("deviceID", deviceID).Str("lid", lidUser).Str("pn", pn).
				Msg("Backfilled LID conversation to real phone number")
		}
	}
	return migrated
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

	// Webhook URL per-device (diisi dari modal Tambah/Edit Perangkat).
	// Dihormati hanya bila webhook_enabled = true.
	var dev models.Device
	if err := m.db.Select("webhook_url", "webhook_secret", "webhook_enabled").Where("id = ?", deviceID).First(&dev).Error; err == nil {
		if !dev.WebhookEnabled {
			return
		}
		if url := strings.TrimSpace(dev.WebhookURL); url != "" {
			// Backfill: device lama yang belum punya secret dibuatkan sekali di sini
			// (selain migrasi startup) agar pengiriman pertama pun sudah bertanda.
			if dev.WebhookSecret == "" {
				if secret, err := security.GenerateWebhookSecret(); err == nil {
					dev.WebhookSecret = secret
					m.db.Model(&models.Device{}).Where("id = ?", deviceID).Update("webhook_secret", secret)
				}
			}
			go m.deliverDeviceWebhook(userID, deviceID, url, dev.WebhookSecret, event, payload)
		}
	}
}

// deliverDeviceWebhook mengirim webhook per-device. Bila URL mengarah ke bot
// PPOB (path berakhiran /whatsapp/bot), kirim format WAMP {from, message}
// yang dimengerti WhatsappBotController; selain itu kirim envelope standar.
// Payload TIDAK berubah; HMAC-SHA256 dari raw body dikirim aditif sebagai
// header X-Wagataway-Signature (+ X-Wagataway-Timestamp). PPOB mengabaikan
// header ekstra, dan alur balasan JSON {"text"} tetap seperti semula.
func (m *Manager) deliverDeviceWebhook(userID, deviceID uint, url, secret, event string, payload map[string]interface{}) {
	var raw []byte
	if isWampBotURL(url) {
		if event != "message.received" {
			return
		}
		from, _ := payload["from"].(string)
		text, _ := payload["text"].(string)
		if from == "" {
			return
		}
		var err error
		botBody := map[string]interface{}{"from": from, "message": text}
		if s := os.Getenv("WAMP_BOT_SECRET"); s != "" {
			botBody["secret"] = s
		}
		raw, err = json.Marshal(botBody)
		if err != nil {
			log.Error().Err(err).Uint("deviceID", deviceID).Msg("Failed to marshal WAMP bot payload")
			return
		}
		// POST ke endpoint bot PPOB dengan retry, baca JSON balasan {"text": ...},
		// lalu kirim teks balasan itu ke pengirim via device ini.
		// Payload yang dicatat ke DB TANPA secret.
		safePayload, _ := json.Marshal(map[string]interface{}{
			"from": from, "message": truncate(text, 200),
		})
		replyText, statusCode, attempts, err := postWampBotWithRetry(url, secret, raw)
		errStr := ""
		if err != nil {
			errStr = err.Error()
		}
		m.db.Create(&models.WebhookDeliveryLog{
			UserID:     userID,
			DeviceID:   deviceID,
			URL:        url,
			Event:      "wamp.bot",
			Payload:    string(safePayload),
			StatusCode: statusCode,
			Success:    err == nil,
			ErrorMsg:   truncate(errStr, 500),
			RetryCount: attempts - 1,
		})
		if err != nil {
			log.Warn().Uint("deviceID", deviceID).Str("event", event).Int("status", statusCode).Int("attempts", attempts).Str("error", errStr).Msg("WAMP bot webhook failed")
			return
		}
		log.Info().Uint("deviceID", deviceID).Int("status", statusCode).Msg("WAMP bot webhook delivered")
		if replyText == "" {
			return
		}
		// Balas via JID asli pengirim bila ada (aman untuk pengirim LID),
		// fallback ke nomor `from`. DIKECUALIKAN dari kuota pesan (Fitur 3):
		// balasan bot PPOB tidak boleh mati karena kuota user habis.
		replyTo, _ := payload["senderJID"].(string)
		if replyTo == "" {
			replyTo = from
		}
		if err := m.SendMessageNoQuota(deviceID, replyTo, "text", replyText, ""); err != nil {
			log.Warn().Err(err).Uint("deviceID", deviceID).Str("to", from).Msg("WAMP bot reply failed")
			return
		}
		log.Info().Uint("deviceID", deviceID).Str("to", from).Msg("WAMP bot reply sent")
		return
	} else {
		body := map[string]interface{}{
			"event":     event,
			"device_id": deviceID,
			"payload":   payload,
			"sent_at":   time.Now().UTC().Format(time.RFC3339),
		}
		var err error
		raw, err = json.Marshal(body)
		if err != nil {
			log.Error().Err(err).Uint("deviceID", deviceID).Msg("Failed to marshal device webhook payload")
			return
		}
	}

	statusCode, success, errMsg, _ := DeliverWebhookPayload(url, secret, event, raw)
	if !success {
		log.Warn().Uint("deviceID", deviceID).Str("event", event).Int("status", statusCode).Str("error", errMsg).Msg("Device webhook delivery failed")
	} else {
		log.Info().Uint("deviceID", deviceID).Str("event", event).Int("status", statusCode).Msg("Device webhook delivered")
	}
}

// postWampBotWithRetry: POST payload ke endpoint bot PPOB (/whatsapp/bot) dengan
// 3x percobaan dan backoff 2s, 5s. Retry HANYA untuk network error/timeout dan
// HTTP 5xx; 4xx (termasuk 404 dari middleware PPOB) dan respons non-JSON tidak
// di-retry. Mengembalikan teks balasan, status code, jumlah percobaan, error.
// Header HMAC X-Wagataway-Signature ikut terkirim (aditif; PPOB mengabaikannya)
// tanpa mengubah payload {from, message, secret}.
func postWampBotWithRetry(url, secret string, raw []byte) (string, int, int, error) {
	backoffs := []time.Duration{2 * time.Second, 5 * time.Second}
	var lastErr error
	var statusCode int
	attempts := 0
	for i := 0; i < 3; i++ {
		if i > 0 {
			time.Sleep(backoffs[i-1])
		}
		attempts++
		replyText, sc, err, retryable := postWampBotOnce(url, secret, raw)
		statusCode = sc
		if err == nil {
			return replyText, sc, attempts, nil
		}
		lastErr = err
		if !retryable {
			break
		}
		log.Warn().Int("attempt", attempts).Int("status", sc).Str("error", err.Error()).Msg("WAMP bot webhook retrying")
	}
	return "", statusCode, attempts, lastErr
}

// postWampBotOnce: satu kali POST ke endpoint bot PPOB dan kembalikan teks
// balasan dari JSON respons {"text": "..."}. retryable=true hanya untuk
// network error/timeout dan HTTP 5xx.
// Pakai HTTP client yang sadar proxy (ProxyFromEnvironment): client aman generik
// (SafeClient, dial langsung) tidak bisa keluar dari sandbox ini karena semua
// TCP diintersep ke egress proxy. URL webhook diset admin sendiri, jadi aman.
func postWampBotOnce(url, secret string, raw []byte) (string, int, error, bool) {
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return "", 0, err, false
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Event", "message.received")
	// Header HMAC aditif — PPOB mengabaikan header ekstra; payload tetap
	// {from, message, secret} dan respons JSON {"text"} diproses seperti semula.
	security.SetWebhookSignatureHeaders(req, secret, raw)

	client := &http.Client{
		Timeout: 30 * time.Second,
		Transport: &http.Transport{
			Proxy: http.ProxyFromEnvironment,
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		return "", 0, err, true
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode >= 500 {
		return "", resp.StatusCode, fmt.Errorf("HTTP %d", resp.StatusCode), true
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return "", resp.StatusCode, fmt.Errorf("HTTP %d", resp.StatusCode), false
	}
	var parsed struct {
		Text string `json:"text"`
	}
	if err := json.Unmarshal(body, &parsed); err != nil {
		return "", resp.StatusCode, fmt.Errorf("respon bukan JSON: %w", err), false
	}
	return strings.TrimSpace(parsed.Text), resp.StatusCode, nil, false
}

// isWampBotURL: true bila path URL berakhiran /whatsapp/bot (endpoint bot PPOB).
func isWampBotURL(rawURL string) bool {
	lower := strings.ToLower(strings.TrimSpace(rawURL))
	if i := strings.Index(lower, "?"); i >= 0 {
		lower = lower[:i]
	}
	if i := strings.Index(lower, "#"); i >= 0 {
		lower = lower[:i]
	}
	lower = strings.TrimSuffix(lower, "/")
	return strings.HasSuffix(lower, "/whatsapp/bot")
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
