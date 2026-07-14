package whatsapp

import (
	"fmt"
	"math/rand"
	"os"
	"sync"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// SessionState holds the runtime state for a single WhatsApp device session
type SessionState struct {
	DeviceID uint
	UserID   uint
	Status   string // "disconnected", "connecting", "connected"
	QR       string
	QRExpiry time.Time
	mu       sync.RWMutex
}

// Manager coordinates all WhatsApp sessions
type Manager struct {
	sessions   map[uint]*SessionState
	mu         sync.RWMutex
	sessionDir string
	db         *gorm.DB
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

// Connect starts a WhatsApp session for a device
func (m *Manager) Connect(deviceID, userID uint) error {
	m.mu.Lock()
	defer m.mu.Unlock()

	// Check if already connecting/connected
	if sess, exists := m.sessions[deviceID]; exists {
		if sess.Status != "disconnected" {
			return nil // already active
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
	sess.Status = "disconnected"
	sess.QR = ""
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

// SendMessage sends a WhatsApp message through a device
func (m *Manager) SendMessage(deviceID uint, to, msgType, content, mediaURL string) error {
	m.mu.RLock()
	sess, exists := m.sessions[deviceID]
	m.mu.RUnlock()

	if !exists || sess.Status != "connected" {
		return fmt.Errorf("device %d tidak terhubung", deviceID)
	}

	// TODO: Use whatsmeow client to send actual message
	// For now, simulate send
	log.Info().
		Uint("deviceID", deviceID).
		Str("to", to).
		Str("type", msgType).
		Msg("Sending WhatsApp message")

	return nil
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

// startSession initializes the actual whatsmeow connection
func (m *Manager) startSession(sess *SessionState) {
	// TODO: Implement full whatsmeow connection
	// This is where whatsmeow.NewClient, QR generation, and event handlers go
	//
	// Pseudocode:
	// 1. Create/load session store from sess.DeviceID directory
	// 2. Create whatsmeow client
	// 3. Register event handlers (messages, connection updates)
	// 4. Connect and emit QR or auto-reconnect if session exists
	//
	// For now: simulate a QR generation after 1 second
	time.Sleep(1 * time.Second)

	sess.mu.Lock()
	sess.QR = fmt.Sprintf("whatsapp://qr/%d/%d", sess.DeviceID, time.Now().Unix())
	sess.QRExpiry = time.Now().Add(60 * time.Second)
	sess.mu.Unlock()

	log.Info().Uint("deviceID", sess.DeviceID).Msg("QR code generated, waiting for scan")
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
}
