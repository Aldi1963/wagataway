package whatsapp

import (
	"context"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

// File ini me-wire flag perilaku device (autoOnline, readReceipts,
// rejectCall, typingIndicator) ke runtime whatsmeow.
//
// Flag disimpan di tabel devices dan di-cache per sesi di SessionState.
// Cache dimuat ulang setiap sesi terhubung (events.Connected) dan setiap
// kali diubah via PUT /api/devices/:id (RefreshDeviceFlags) — tanpa restart.

// loadDeviceFlags membaca flag perilaku device dari DB ke cache sesi.
func (m *Manager) loadDeviceFlags(sess *SessionState) {
	var d models.Device
	if err := m.db.Select("auto_online", "read_receipts", "reject_call", "typing_indicator").
		Where("id = ?", sess.DeviceID).First(&d).Error; err != nil {
		log.Warn().Err(err).Uint("deviceID", sess.DeviceID).
			Msg("Gagal memuat flag device, memakai nilai default (mati)")
		return
	}
	sess.mu.Lock()
	sess.AutoOnline = d.AutoOnline
	sess.ReadReceipts = d.ReadReceipts
	sess.RejectCall = d.RejectCall
	sess.TypingIndicator = d.TypingIndicator
	sess.mu.Unlock()
}

// applyPresence mengatur presence online/offline sesuai flag autoOnline.
// Dipanggil saat sesi terhubung dan saat flag diubah via API.
func (m *Manager) applyPresence(sess *SessionState) {
	sess.mu.RLock()
	client := sess.Client
	online := sess.AutoOnline
	sess.mu.RUnlock()
	if client == nil || !client.IsConnected() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if online {
		if err := client.SendPresence(ctx, types.PresenceAvailable); err != nil {
			log.Warn().Err(err).Uint("deviceID", sess.DeviceID).
				Msg("Gagal mengirim presence online")
		} else {
			log.Info().Uint("deviceID", sess.DeviceID).Msg("Presence: online")
		}
	} else {
		if err := client.SendPresence(ctx, types.PresenceUnavailable); err != nil {
			log.Warn().Err(err).Uint("deviceID", sess.DeviceID).
				Msg("Gagal mengirim presence offline")
		}
	}
}

// RefreshDeviceFlags memuat ulang flag dari DB ke sesi aktif dan menerapkan
// perubahan presence seketika bila autoOnline berubah. Aman dipanggil walau
// sesi tidak aktif (no-op).
func (m *Manager) RefreshDeviceFlags(deviceID uint) {
	m.mu.RLock()
	sess, exists := m.sessions[deviceID]
	m.mu.RUnlock()
	if !exists {
		return
	}
	sess.mu.RLock()
	oldOnline := sess.AutoOnline
	sess.mu.RUnlock()

	m.loadDeviceFlags(sess)

	sess.mu.RLock()
	newOnline := sess.AutoOnline
	sess.mu.RUnlock()
	if newOnline != oldOnline {
		go m.applyPresence(sess)
	}
}

// handleCallOffer menolak panggilan WhatsApp masuk secara otomatis bila
// flag rejectCall aktif. Dipanggil sebagai goroutine dari handleEvent.
func (m *Manager) handleCallOffer(sess *SessionState, offer *events.CallOffer) {
	sess.mu.RLock()
	reject := sess.RejectCall
	client := sess.Client
	sess.mu.RUnlock()
	if !reject || client == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := client.RejectCall(ctx, offer.From, offer.CallID); err != nil {
		log.Error().Err(err).Uint("deviceID", sess.DeviceID).
			Msg("Gagal menolak panggilan otomatis")
		return
	}
	log.Info().Uint("deviceID", sess.DeviceID).Str("from", offer.From.String()).
		Msg("Panggilan WhatsApp ditolak otomatis")
}

// maybeMarkRead mengirim tanda "sudah dibaca" untuk pesan masuk bila flag
// readReceipts aktif. Dipanggil sebagai goroutine dari handleIncomingMessage.
func (m *Manager) maybeMarkRead(sess *SessionState, msg *events.Message) {
	sess.mu.RLock()
	rr := sess.ReadReceipts
	client := sess.Client
	sess.mu.RUnlock()
	if !rr || client == nil {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := client.MarkRead(ctx,
		[]types.MessageID{msg.Info.ID},
		msg.Info.Timestamp,
		msg.Info.Chat,
		msg.Info.Sender,
	); err != nil {
		log.Warn().Err(err).Uint("deviceID", sess.DeviceID).
			Msg("Gagal menandai pesan sebagai dibaca")
	}
}
