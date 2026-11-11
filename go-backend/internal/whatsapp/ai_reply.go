package whatsapp

// checkAIReply memeriksa config AI auto-reply yang aktif untuk device pengirim
// dan membalas pesan via chatbot AI bila cocok.
//
// Dipanggil via goroutine dari handleIncomingMessage — non-blocking dan gagal
// diam-diam (hanya log), sehingga tidak mengganggu alur pesan yang sudah ada.
//
// Alur chatbot (paket Pro/Master, lihat service.ChatbotAllowed):
//  1. Retrieval FAQ — bila ada entri FAQ/katalog yang cocok, jawab dari entri itu.
//  2. StrictFAQ — bila mode ketat aktif dan tak ada entri cocok, tolak sopan tanpa LLM.
//  3. Fallback LLM — teruskan ke koneksi AI milik user (atau backend global)
//     dengan N pesan terakhir sebagai konteks percakapan.
//  4. Guardrail — jawaban dipotong ke MaxReplyLength.
// Paket lain (Free/Lite/Regular) memakai jalur LLM lama tanpa FAQ/konteks.
// Setiap balasan dicatat ke AIChatbotLog agar bisa diaudit.

import (
	"strings"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/service"
	"github.com/rs/zerolog/log"
)

// logChatbotReply mencatat satu balasan chatbot (best-effort, abaikan error).
func (m *Manager) logChatbotReply(userID, deviceID uint, phone, question, answer, source string, faqID *uint) {
	if strings.TrimSpace(question) == "" {
		return
	}
	m.db.Create(&models.AIChatbotLog{
		UserID:   userID,
		DeviceID: deviceID,
		Phone:    phone,
		Question: question,
		Answer:   answer,
		Source:   source,
		FAQID:    faqID,
	})
}

// sendChatbotReply mengirim balasan + mencatat log-nya. Mengembalikan true
// bila pesan terkirim.
func (m *Manager) sendChatbotReply(sess *SessionState, senderJID, senderPhone, question, reply, source string, faqID *uint) bool {
	if err := m.SendMessage(sess.DeviceID, senderJID, "text", reply, ""); err != nil {
		log.Error().Err(err).
			Uint("deviceID", sess.DeviceID).
			Str("to", senderJID).
			Str("source", source).
			Msg("AI reply send failed")
		return false
	}
	m.logChatbotReply(sess.UserID, sess.DeviceID, senderPhone, question, reply, source, faqID)
	log.Info().
		Uint("deviceID", sess.DeviceID).
		Str("to", senderJID).
		Str("source", source).
		Msg("AI reply sent")
	return true
}

func (m *Manager) checkAIReply(sess *SessionState, senderJID, senderPhone, text string, isGroup bool) {
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
			m.sendChatbotReply(sess, senderJID, senderPhone, text,
				service.InjectionRefusalMessage, "blocked", nil)
			return
		}

		// Jalur chatbot (Pro/Master): FAQ → StrictFAQ → LLM + konteks.
		if allowed, _ := service.ChatbotAllowed(m.db, sess.UserID); allowed {
			m.replyChatbot(sess, senderJID, senderPhone, text, &cfg)
			return
		}

		// Jalur lama (paket lain): LLM langsung tanpa FAQ/konteks.
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
		m.sendChatbotReply(sess, senderJID, senderPhone, text,
			service.TruncateReply(reply, service.EffectiveMaxReplyLength(&cfg)), "llm", nil)
		return // hanya config pertama yang cocok yang membalas
	}
}

// replyChatbot menjalankan pipeline chatbot untuk satu config:
// retrieval FAQ, lalu (bila perlu) fallback LLM dengan konteks percakapan.
func (m *Manager) replyChatbot(sess *SessionState, senderJID, senderPhone, text string, cfg *models.AIReplyConfig) {
	maxLen := service.EffectiveMaxReplyLength(cfg)

	// 1. Retrieval FAQ.
	if cfg.UseFAQ {
		faqs := service.LoadFAQs(m.db, sess.UserID, sess.DeviceID)
		if best, _ := service.FindBestFAQ(faqs, text); best != nil {
			answer := service.TruncateReply(best.Answer, maxLen)
			faqID := best.ID
			m.sendChatbotReply(sess, senderJID, senderPhone, text, answer, "faq", &faqID)
			return
		}
		// 2. Mode ketat: tolak topik di luar FAQ tanpa memanggil LLM.
		if cfg.StrictFAQ {
			m.sendChatbotReply(sess, senderJID, senderPhone, text,
				service.OutOfScopeRefusalMessage, "refused", nil)
			return
		}
	}

	// 3. Fallback LLM dengan konteks N pesan terakhir percakapan ini.
	history := service.RecentContext(m.db, sess.UserID, sess.DeviceID, senderPhone,
		service.EffectiveContextMessages(cfg))
	reply, err := m.askAIWithHistory(sess.UserID, cfg, history, text)
	if err != nil {
		log.Error().Err(err).
			Uint("deviceID", sess.DeviceID).
			Uint("configID", cfg.ID).
			Msg("AI reply failed")
		return
	}
	if strings.TrimSpace(reply) == "" {
		return
	}
	m.sendChatbotReply(sess, senderJID, senderPhone, text,
		service.TruncateReply(reply, maxLen), "llm", nil)
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
	return m.askAIWithHistory(userID, cfg, nil, userMessage)
}

// askAIWithHistory sama dengan askAIForUser, ditambah riwayat percakapan
// (terurut kronologis, tanpa system prompt) sebagai konteks sebelum pesan
// terbaru. Riwayat dinormalkan (gabung role berurutan, buang assistant di
// ujung) agar diterima semua provider.
func (m *Manager) askAIWithHistory(userID uint, cfg *models.AIReplyConfig, history []service.ChatMessage, userMessage string) (string, error) {
	systemPrompt, guardedMsg := cfg.SystemPrompt, userMessage
	if cfg.InjectionGuard {
		systemPrompt = service.GuardedSystemPrompt(systemPrompt)
		guardedMsg = service.GuardedUserMessage(userMessage)
	}
	messages := []service.ChatMessage{{Role: "system", Content: systemPrompt}}
	messages = append(messages, service.NormalizeChatHistory(history)...)
	messages = append(messages, service.ChatMessage{Role: "user", Content: guardedMsg})

	if conn := service.ConnectionForUser(m.db, userID); conn != nil {
		if svc := service.ServiceForConnection(conn); svc != nil {
			resp, err := svc.Complete(service.ChatRequest{
				Provider:    service.AIProvider(conn.Provider),
				Model:       service.EffectiveModel(conn, ""),
				Messages:    messages,
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
	// Fallback global (legacy AskAI) tidak mendukung riwayat multi-turn:
	// kirim hanya system prompt + pesan terbaru.
	return AskAI(m.db, systemPrompt, guardedMsg)
}
