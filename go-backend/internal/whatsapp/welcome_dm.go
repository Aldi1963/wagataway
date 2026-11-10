package whatsapp

// Welcome DM anggota baru grup: kirim DM pribadi (chat pribadi, BUKAN ke
// grup) ke anggota yang join grup WA hasil sync, sesuai setting per grup
// (ContactGroup.WelcomeDMEnabled + WelcomeDMTemplate).
//
// Dipanggil dari handleGroupParticipantChange (group_rules.go) yang sudah
// berjalan di goroutine sendiri — non-blocking dan gagal diam-diam (hanya
// log), sehingga tidak mengganggu alur yang sudah ada (welcome ke grup,
// anti-link/anti-spam, bot PPOB).
//
// Aturan skip: nomor device sendiri, bot (types.JID.IsBot), perangkat
// pendamping (Device != 0), JID kosong, dan peserta yang join tapi langsung
// leave di event yang sama.
//
// Anti-duplikat: klaim per (deviceID, groupJID, phone) dengan TTL 24 jam
// (in-memory, disapu berkala) + tabel DB WelcomeDMSent sebagai arsip
// persisten agar survive restart. Orang yang sama keluar-masuk dalam 24 jam
// tidak dikirimi ulang — didokumentasikan di docs endpoint.
//
// Rate limit: satu worker goroutine memproses antrean dengan jeda 4 detik
// antar DM, sehingga 20 orang join sekaligus tidak memicu rate limit WA.

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

const (
	// welcomeDMDelay adalah jeda antar DM agar tidak kena rate limit WA.
	welcomeDMDelay = 4 * time.Second
	// welcomeDMDedupeTTL: tidak kirim ulang welcome DM ke nomor yang sama
	// di grup yang sama dalam rentang ini.
	welcomeDMDedupeTTL = 24 * time.Hour
	// welcomeDMQueueSize: batas antrean; lebih dari itu, DM dilewati + log
	// agar tidak OOM bila ratusan join serentak.
	welcomeDMQueueSize = 200
)

// welcomeDMJob adalah satu DM tertunda di antrean.
type welcomeDMJob struct {
	userID   uint
	deviceID uint
	to       string // target DM (JID string, boleh @lid)
	text     string
	groupJID string
	phone    string
}

// renderWelcomeDM mengganti variabel {nama} dan {grup} di template.
// Fungsi murni — bisa di-unit-test tanpa DB/klien WA.
func renderWelcomeDM(template, name, groupName string) string {
	return strings.NewReplacer(
		"{nama}", name,
		"{grup}", groupName,
	).Replace(template)
}

// welcomeDMKey membuat kunci dedupe per (device, grup, nomor).
func welcomeDMKey(deviceID uint, groupJID, phone string) string {
	return fmt.Sprintf("%d|%s|%s", deviceID, groupJID, phone)
}

// ensureWelcomeDMWorker menjalankan worker antrean tepat satu kali per Manager.
func (m *Manager) ensureWelcomeDMWorker() {
	m.welcomeDMOnce.Do(func() {
		m.welcomeDMCh = make(chan welcomeDMJob, welcomeDMQueueSize)
		m.welcomeDMClaims = make(map[string]time.Time)
		go m.welcomeDMWorker()
	})
}

// claimWelcomeDM mengklaim slot DM untuk (device, grup, nomor).
// Mengembalikan false bila nomor tersebut sudah dikirimi welcome DM dalam
// 24 jam terakhir (cek arsip DB + klaim in-memory), sehingga event join
// ganda / keluar-masuk tidak mengirim duplikat.
func (m *Manager) claimWelcomeDM(userID, deviceID uint, groupJID, phone string) bool {
	m.ensureWelcomeDMWorker()
	key := welcomeDMKey(deviceID, groupJID, phone)
	now := time.Now()

	m.welcomeDMMu.Lock()
	defer m.welcomeDMMu.Unlock()

	// Sapu klaim kedaluwarsa (murah, map kecil).
	for k, t := range m.welcomeDMClaims {
		if now.Sub(t) > welcomeDMDedupeTTL {
			delete(m.welcomeDMClaims, k)
		}
	}
	if t, ok := m.welcomeDMClaims[key]; ok && now.Sub(t) <= welcomeDMDedupeTTL {
		return false
	}

	// Arsip persisten (survive restart).
	var count int64
	if m.db != nil {
		cutoff := now.Add(-welcomeDMDedupeTTL)
		m.db.Model(&models.WelcomeDMSent{}).
			Where("user_id = ? AND device_id = ? AND group_jid = ? AND phone = ? AND created_at > ?",
				userID, deviceID, groupJID, phone, cutoff).
			Count(&count)
	}
	if count > 0 {
		m.welcomeDMClaims[key] = now // cache agar tidak query ulang
		return false
	}

	m.welcomeDMClaims[key] = now
	return true
}

// unclaimWelcomeDM membatalkan klaim bila pengiriman gagal, agar join
// berikutnya masih bisa mencoba lagi.
func (m *Manager) unclaimWelcomeDM(deviceID uint, groupJID, phone string) {
	key := welcomeDMKey(deviceID, groupJID, phone)
	m.welcomeDMMu.Lock()
	delete(m.welcomeDMClaims, key)
	m.welcomeDMMu.Unlock()
}

// enqueueWelcomeDM memasukkan DM ke antrean (non-blocking).
func (m *Manager) enqueueWelcomeDM(job welcomeDMJob) {
	m.ensureWelcomeDMWorker()
	select {
	case m.welcomeDMCh <- job:
	default:
		m.unclaimWelcomeDM(job.deviceID, job.groupJID, job.phone)
		log.Warn().
			Uint("deviceID", job.deviceID).
			Str("group", job.groupJID).
			Str("to", job.to).
			Msg("Welcome DM queue full, dropping")
	}
}

// welcomeDMWorker memproses antrean satu per satu dengan jeda konstan,
// lalu mencatat arsip pengiriman yang sukses.
func (m *Manager) welcomeDMWorker() {
	for job := range m.welcomeDMCh {
		err := m.SendMessage(job.deviceID, job.to, "text", job.text, "")
		if err != nil {
			log.Error().Err(err).
				Uint("deviceID", job.deviceID).
				Str("group", job.groupJID).
				Str("to", job.to).
				Msg("Welcome DM failed")
			m.unclaimWelcomeDM(job.deviceID, job.groupJID, job.phone)
		} else {
			log.Info().
				Uint("deviceID", job.deviceID).
				Str("group", job.groupJID).
				Str("to", job.to).
				Msg("Welcome DM sent")
			if m.db != nil {
				m.db.Create(&models.WelcomeDMSent{
					UserID:   job.userID,
					DeviceID: job.deviceID,
					GroupJID: job.groupJID,
					Phone:    job.phone,
				})
			}
		}
		time.Sleep(welcomeDMDelay)
	}
}

// resolveMemberName mengambil nama anggota untuk {nama}: FullName →
// FirstName → PushName dari kontak WA, fallback ke nomor telepon.
func (m *Manager) resolveMemberName(sess *SessionState, jid types.JID, phone string) string {
	if sess.Client != nil && sess.Client.Store != nil && sess.Client.Store.Contacts != nil {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if info, err := sess.Client.Store.Contacts.GetContact(ctx, jid); err == nil && info.Found {
			for _, n := range []string{info.FullName, info.FirstName, info.PushName} {
				if n = strings.TrimSpace(n); n != "" {
					return n
				}
			}
		}
	}
	return phone
}

// shouldSkipWelcomeDM adalah filter murni untuk satu peserta join:
// lewati nomor sendiri, bot, perangkat pendamping, JID kosong, dan
// peserta yang join tapi langsung leave di event yang sama.
func shouldSkipWelcomeDM(j types.JID, selfUser string, leaveSet map[string]bool) bool {
	if j.User == "" || j.User == selfUser {
		return true
	}
	if j.IsBot() {
		return true
	}
	if j.Device != 0 {
		return true // perangkat pendamping, bukan HP utama
	}
	if leaveSet[j.User+"@"+j.Server] {
		return true // join langsung leave
	}
	return false
}

// handleWelcomeDM memeriksa setting welcome DM untuk grup ini dan
// mengantrekan DM pribadi ke tiap anggota baru yang lolos filter.
// Dipanggil dari handleGroupParticipantChange (goroutine).
func (m *Manager) handleWelcomeDM(sess *SessionState, evt *events.GroupInfo) {
	if len(evt.Join) == 0 || sess.Client == nil {
		return
	}
	groupJID := evt.JID.String()
	if !isGroupJID(groupJID) {
		return
	}

	var cg models.ContactGroup
	if err := m.db.Where("user_id = ? AND waj_id = ? AND welcome_dm_enabled = ?",
		sess.UserID, groupJID, true).First(&cg).Error; err != nil {
		return // tidak ada setting welcome DM untuk grup ini
	}
	template := strings.TrimSpace(cg.WelcomeDMTemplate)
	if template == "" {
		return
	}

	var selfUser string
	if sess.Client.Store.ID != nil {
		selfUser = sess.Client.Store.ID.User
	}

	leaveSet := make(map[string]bool, len(evt.Leave))
	for _, j := range evt.Leave {
		leaveSet[j.User+"@"+j.Server] = true
	}

	for _, j := range evt.Join {
		if shouldSkipWelcomeDM(j, selfUser, leaveSet) {
			continue
		}
		phone := j.User
		if !m.claimWelcomeDM(sess.UserID, sess.DeviceID, groupJID, phone) {
			continue // sudah dikirimi dalam 24 jam terakhir
		}
		name := m.resolveMemberName(sess, j, phone)
		m.enqueueWelcomeDM(welcomeDMJob{
			userID:   sess.UserID,
			deviceID: sess.DeviceID,
			to:       j.String(), // DM ke JID pribadi (boleh @lid)
			text:     renderWelcomeDM(template, name, cg.Name),
			groupJID: groupJID,
			phone:    phone,
		})
	}
}
