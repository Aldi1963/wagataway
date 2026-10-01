package whatsapp

// Aturan grup otomatis: welcome message anggota baru, anti-link, dan
// anti-spam untuk pesan grup masuk.
//
// Dipanggil via goroutine dari handleIncomingMessage (checkGroupRules) dan
// handleEvent (handleGroupParticipantChange) — non-blocking dan gagal
// diam-diam (hanya log), sehingga tidak mengganggu alur pesan yang sudah ada.

import (
	"fmt"
	"regexp"
	"sync"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

// linkPattern mendeteksi URL di teks pesan.
var linkPattern = regexp.MustCompile(`(?i)(https?://|www\.)\S+`)

// spamTracker melacak timestamp pesan per (deviceID, groupJID, sender)
// untuk deteksi spam. In-memory saja; hilang saat restart (acceptable).
type spamBucket struct {
	mu         sync.Mutex
	timestamps map[string][]time.Time // key: "deviceID:groupJID:sender"
	lastWarn   map[string]time.Time   // key: "deviceID:groupJID:sender" → peringatan terakhir
}

var spamTracker = &spamBucket{
	timestamps: make(map[string][]time.Time),
	lastWarn:   make(map[string]time.Time),
}

const (
	spamThreshold = 5               // >5 pesan...
	spamWindow    = 10 * time.Second // ...dalam 10 detik = spam
	spamWarnCooldown = 1 * time.Minute // peringatan maksimal 1x per menit per sender
)

// buildWelcomeText menyusun teks sambutan: WelcomeMsg + mention teks polos
// (@nomor, dipisah spasi) untuk tiap anggota baru. Anggota tanpa User
// dan device sendiri dilewati. Mengembalikan "" bila tidak ada yang
// perlu disambut. Fungsi murni — bisa di-unit-test tanpa DB/klien WA.
func buildWelcomeText(welcomeMsg string, join []types.JID, selfUser string) string {
	mentions := ""
	for _, j := range join {
		if j.User == "" || j.User == selfUser {
			continue
		}
		mentions += "@" + j.User + " "
	}
	if mentions == "" {
		return ""
	}
	return welcomeMsg + "\n" + mentions
}

// handleGroupParticipantChange menangani event *events.GroupInfo.
// Bila ada anggota baru yang join (evt.Join), cari GroupRule aktif untuk
// device+grup ini dan kirim WelcomeMsg dengan mention teks polos
// (@nomor, gaya yang sama dengan peringatan anti-link).
func (m *Manager) handleGroupParticipantChange(sess *SessionState, evt *events.GroupInfo) {
	if len(evt.Join) == 0 {
		return
	}
	groupJID := evt.JID.String()
	if !isGroupJID(groupJID) {
		return
	}

	var rule models.GroupRule
	if err := m.db.Where("user_id = ? AND device_id = ? AND group_jid = ? AND is_active = ? AND welcome_msg <> ''",
		sess.UserID, sess.DeviceID, groupJID, true).
		First(&rule).Error; err != nil {
		return // tidak ada welcome message aktif untuk grup ini
	}

	// Nomor device sendiri — jangan sambut diri sendiri bila device yang join.
	var selfUser string
	if sess.Client != nil && sess.Client.Store.ID != nil {
		selfUser = sess.Client.Store.ID.User
	}

	text := buildWelcomeText(rule.WelcomeMsg, evt.Join, selfUser)
	if text == "" {
		return
	}

	if err := m.SendMessage(sess.DeviceID, groupJID, "text", text, ""); err != nil {
		log.Error().Err(err).
			Uint("deviceID", sess.DeviceID).
			Str("group", groupJID).
			Msg("Group rule welcome message failed")
	} else {
		log.Info().
			Uint("deviceID", sess.DeviceID).
			Str("group", groupJID).
			Str("text", text).
			Msg("Group rule welcome message sent")
	}
}

// checkGroupRules memeriksa aturan grup yang aktif untuk device+grup ini
// dan menegakkannya (anti-link, anti-spam).
func (m *Manager) checkGroupRules(sess *SessionState, sender, text, groupJID string) {
	if !isGroupJID(groupJID) || sender == "" {
		return
	}

	var rule models.GroupRule
	if err := m.db.Where("user_id = ? AND device_id = ? AND group_jid = ? AND is_active = ?",
		sess.UserID, sess.DeviceID, groupJID, true).
		First(&rule).Error; err != nil {
		return // tidak ada aturan aktif untuk grup ini
	}

	// Anti-link: kirim peringatan (tidak ada fungsi revoke di codebase).
	if rule.AntiLink && linkPattern.MatchString(text) {
		warn := "@" + sender + " dilarang mengirim link di grup ini"
		if err := m.SendMessage(sess.DeviceID, groupJID, "text", warn, ""); err != nil {
			log.Error().Err(err).
				Uint("deviceID", sess.DeviceID).
				Str("group", groupJID).
				Msg("Group rule anti-link warning failed")
		} else {
			log.Info().
				Uint("deviceID", sess.DeviceID).
				Str("group", groupJID).
				Str("sender", sender).
				Msg("Group rule anti-link warning sent")
		}
	}

	// Anti-spam: >5 pesan dalam 10 detik dari sender yang sama.
	if rule.AntiSpam {
		if isSpamming(sess.DeviceID, groupJID, sender) {
			warn := "@" + sender + " mohon jangan spam di grup ini"
			if err := m.SendMessage(sess.DeviceID, groupJID, "text", warn, ""); err != nil {
				log.Error().Err(err).
					Uint("deviceID", sess.DeviceID).
					Str("group", groupJID).
					Msg("Group rule anti-spam warning failed")
			} else {
				log.Info().
					Uint("deviceID", sess.DeviceID).
					Str("group", groupJID).
					Str("sender", sender).
					Msg("Group rule anti-spam warning sent")
			}
		}
	}
}

// isSpamming mencatat timestamp pesan dan mengembalikan true bila sender
// melebihi ambang spam DAN cooldown peringatan sudah lewat.
func isSpamming(deviceID uint, groupJID, sender string) bool {
	key := fmt.Sprintf("%d:%s:%s", deviceID, groupJID, sender)
	now := time.Now()

	spamTracker.mu.Lock()
	defer spamTracker.mu.Unlock()

	// Buang timestamp yang sudah di luar window.
	cutoff := now.Add(-spamWindow)
	valid := spamTracker.timestamps[key][:0]
	for _, t := range spamTracker.timestamps[key] {
		if t.After(cutoff) {
			valid = append(valid, t)
		}
	}
	valid = append(valid, now)
	spamTracker.timestamps[key] = valid

	if len(valid) <= spamThreshold {
		return false
	}

	// Cooldown peringatan: maksimal 1x per menit.
	if last, ok := spamTracker.lastWarn[key]; ok && now.Sub(last) < spamWarnCooldown {
		return false
	}
	spamTracker.lastWarn[key] = now
	return true
}

// isGroupJID memeriksa apakah JID adalah grup (berakhiran @g.us).
func isGroupJID(jid string) bool {
	if len(jid) < 5 {
		return false
	}
	return jid[len(jid)-5:] == "@g.us"
}
