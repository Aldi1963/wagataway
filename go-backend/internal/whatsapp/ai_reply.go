package whatsapp

// checkAIReply memeriksa config AI auto-reply yang aktif untuk device pengirim
// dan membalas pesan via backend AI bila cocok.
//
// Dipanggil via goroutine dari handleIncomingMessage — non-blocking dan gagal
// diam-diam (hanya log), sehingga tidak mengganggu alur pesan yang sudah ada.

import (
	"strings"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
)

func (m *Manager) checkAIReply(sess *SessionState, senderJID, text string, isGroup bool) {
	if strings.TrimSpace(text) == "" {
		return
	}

	var cfgs []models.AIReplyConfig
	m.db.Where("user_id = ? AND device_id = ? AND is_enabled = ?",
		sess.UserID, sess.DeviceID, true).
		Order("id ASC").
		Find(&cfgs)

	for _, cfg := range cfgs {
		if isGroup && cfg.IgnoreGroups {
			continue
		}
		if !matchTriggerKeywords(text, cfg.TriggerKeywords) {
			continue
		}

		reply, err := AskAI(m.db, cfg.SystemPrompt, text)
		if err != nil {
			log.Error().Err(err).
				Uint("deviceID", sess.DeviceID).
				Uint("configID", cfg.ID).
				Msg("AI reply failed")
			continue
		}
		if strings.TrimSpace(reply) == "" {
			continue
		}

		if err := m.SendMessage(sess.DeviceID, senderJID, "text", reply, ""); err != nil {
			log.Error().Err(err).
				Uint("deviceID", sess.DeviceID).
				Str("to", senderJID).
				Msg("AI reply send failed")
		} else {
			log.Info().
				Uint("deviceID", sess.DeviceID).
				Uint("configID", cfg.ID).
				Str("to", senderJID).
				Msg("AI reply sent")
		}
		return // hanya config pertama yang cocok yang membalas
	}
}

// matchTriggerKeywords: keywords kosong = cocok untuk semua pesan,
// selain itu cocok bila salah satu keyword muncul di teks (case-insensitive).
func matchTriggerKeywords(text, keywords string) bool {
	if strings.TrimSpace(keywords) == "" {
		return true
	}
	return matchKeyword(text, keywords, "contains")
}
