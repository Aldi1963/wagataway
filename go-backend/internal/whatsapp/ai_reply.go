package whatsapp

// checkAIReply memeriksa config AI auto-reply yang aktif untuk device pengirim
// dan membalas pesan via backend AI bila cocok.
//
// Dipanggil via goroutine dari handleIncomingMessage — non-blocking dan gagal
// diam-diam (hanya log), sehingga tidak mengganggu alur pesan yang sudah ada.

import (
	"strings"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/service"
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

		// Proteksi prompt injection: pola jailbreak ditolak langsung dengan
		// pesan sopan tanpa memanggil AI (hemat biaya & deterministik).
		if cfg.InjectionGuard && service.DetectPromptInjection(text) {
			log.Warn().
				Uint("deviceID", sess.DeviceID).
				Uint("configID", cfg.ID).
				Str("to", senderJID).
				Msg("AI reply blocked: prompt injection detected")
			if err := m.SendMessage(sess.DeviceID, senderJID, "text", service.InjectionRefusalMessage, ""); err != nil {
				log.Error().Err(err).Msg("AI injection refusal send failed")
			}
			return
		}

		reply, err := m.askAIForUser(sess.UserID, &cfg, text)
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

// askAIForUser mengirim prompt ke AI memakai koneksi milik user (provider +
// API key + model pilihannya sendiri). Bila user belum mengonfigurasi koneksi,
// fallback ke backend AI global (legacy AskAI via 9router/settings).
// Bila cfg.InjectionGuard aktif: system prompt diperkuat akhiran keamanan dan
// pesan user dibungkus sebagai data eksplisit.
func (m *Manager) askAIForUser(userID uint, cfg *models.AIReplyConfig, userMessage string) (string, error) {
	systemPrompt, guardedMsg := cfg.SystemPrompt, userMessage
	if cfg.InjectionGuard {
		systemPrompt = service.GuardedSystemPrompt(systemPrompt)
		guardedMsg = service.GuardedUserMessage(userMessage)
	}
	if conn := service.ConnectionForUser(m.db, userID); conn != nil {
		if svc := service.ServiceForConnection(conn); svc != nil {
			resp, err := svc.Complete(service.ChatRequest{
				Provider:   service.AIProvider(conn.Provider),
				Model:      service.EffectiveModel(conn, ""),
				Messages: []service.ChatMessage{
					{Role: "system", Content: systemPrompt},
					{Role: "user", Content: guardedMsg},
				},
				MaxTokens:   500,
				Temperature: 0.7,
			})
			if err != nil {
				return "", err
			}
			return resp.Content, nil
		}
		log.Warn().Uint("userID", userID).Msg("AI connection key undecryptable, falling back to global AI backend")
	}
	return AskAI(m.db, systemPrompt, guardedMsg)
}
