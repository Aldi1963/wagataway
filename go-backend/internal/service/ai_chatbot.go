package service

// Chatbot AI (FAQ/katalog + fallback LLM).
//
// Alur saat pesan masuk (lihat whatsapp.checkAIReply):
//  1. Retrieval FAQ: FindBestFAQ mencocokkan pesan dengan entri FAQ aktif
//     (kata kunci + skor overlap token). Bila skor >= ambang, jawab dari FAQ.
//  2. StrictFAQ: bila tidak ada entri cocok dan mode ketat aktif, tolak
//     dengan pesan sopan tanpa memanggil LLM.
//  3. Fallback LLM: kirim ke koneksi AI milik user (atau backend global)
//     dengan N pesan terakhir sebagai konteks percakapan.
//  4. Guardrail: jawaban dipotong ke MaxReplyLength.
//
// Plan gating: ChatbotAllowed — chatbot hanya aktif untuk paket Pro/Master
// dengan langganan yang masih berlaku. Paket lain tetap memakai autoreply
// keyword lama (jalur lama di checkAIReply).

import (
	"regexp"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"gorm.io/gorm"
)

// FAQMatchThreshold: skor minimum agar entri FAQ dianggap cocok.
const FAQMatchThreshold = 0.34

// ChatbotPlanSlugs: slug/nama paket yang berhak memakai chatbot AI.
var ChatbotPlanSlugs = map[string]bool{"pro": true, "master": true}

// DefaultMaxReplyLength dipakai bila config mengosongkan MaxReplyLength.
const DefaultMaxReplyLength = 1000

// MaxReplyLengthCap: batas atas MaxReplyLength yang diizinkan.
const MaxReplyLengthCap = 4000

// MaxContextMessages: batas atas ContextMessages yang diizinkan.
const MaxContextMessages = 20

// OutOfScopeRefusalMessage: balasan saat StrictFAQ menolak topik di luar FAQ.
const OutOfScopeRefusalMessage = "Maaf, saya hanya bisa membantu seputar produk dan layanan kami. Silakan tanyakan hal lain atau hubungi admin untuk bantuan lebih lanjut."

// tokenSplit memecah teks menjadi token kata (huruf/angka unicode).
var tokenSplit = regexp.MustCompile(`[^\p{L}\p{N}]+`)

// stopwords: kata umum yang tidak membedakan topik (ID + EN).
var stopwords = map[string]bool{
	"yang": true, "dan": true, "di": true, "ke": true, "dari": true,
	"untuk": true, "dengan": true, "adalah": true, "ini": true, "itu": true,
	"apa": true, "apakah": true, "bagaimana": true, "tolong": true,
	"mau": true, "kak": true, "saya": true, "aku": true, "kami": true,
	"the": true, "a": true, "an": true, "is": true, "are": true,
	"how": true, "what": true, "please": true, "i": true, "you": true,
	"berapa": true,
}

// tokenizeSet mengembalikan himpunan token bermakna dari teks.
func tokenizeSet(text string) map[string]bool {
	out := map[string]bool{}
	for _, tok := range tokenSplit.Split(strings.ToLower(text), -1) {
		if tok == "" || stopwords[tok] {
			continue
		}
		out[tok] = true
	}
	return out
}

// scoreFAQ menghitung skor kecocokan pesan terhadap satu entri FAQ:
// fraksi token pertanyaan (unik, tanpa stopword) yang muncul di
// pertanyaan + keywords entri. Frasa yang sama persis (substring) = 1.
func scoreFAQ(text string, faq *models.AIChatbotFAQ) float64 {
	if faq == nil {
		return 0
	}
	q := strings.ToLower(strings.TrimSpace(text))
	question := strings.ToLower(strings.TrimSpace(faq.Question))
	if q != "" && question != "" && (strings.Contains(q, question) || strings.Contains(question, q)) {
		return 1
	}
	queryTokens := tokenizeSet(text)
	if len(queryTokens) == 0 {
		return 0
	}
	entryTokens := tokenizeSet(faq.Question + " " + strings.ReplaceAll(faq.Keywords, ",", " "))
	matched := 0
	for tok := range queryTokens {
		if entryTokens[tok] {
			matched++
		}
	}
	return float64(matched) / float64(len(queryTokens))
}

// FindBestFAQ mengembalikan entri FAQ dengan skor tertinggi (bila >= ambang)
// beserta skornya. Seri dimenangkan prioritas tertinggi, lalu ID terkecil.
// Entri nonaktif diabaikan oleh pemanggil (atau disaring di sini bila ada).
func FindBestFAQ(faqs []models.AIChatbotFAQ, text string) (*models.AIChatbotFAQ, float64) {
	var best *models.AIChatbotFAQ
	bestScore := 0.0
	for i := range faqs {
		f := &faqs[i]
		if !f.IsActive {
			continue
		}
		s := scoreFAQ(text, f)
		if s < FAQMatchThreshold {
			continue
		}
		if best == nil || s > bestScore ||
			(s == bestScore && (f.Priority > best.Priority ||
				(f.Priority == best.Priority && f.ID < best.ID))) {
			best, bestScore = f, s
		}
	}
	return best, bestScore
}

// LoadFAQs memuat entri FAQ aktif milik user untuk device (nil = semua device).
func LoadFAQs(db *gorm.DB, userID uint, deviceID uint) []models.AIChatbotFAQ {
	var faqs []models.AIChatbotFAQ
	db.Where("user_id = ? AND is_active = ? AND (device_id IS NULL OR device_id = ?)",
		userID, true, deviceID).
		Order("priority DESC, id ASC").
		Find(&faqs)
	return faqs
}

// TruncateReply memotong jawaban ke maxLen karakter (rune-aware).
// maxLen <= 0 memakai DefaultMaxReplyLength; di atas cap dipotong ke cap.
func TruncateReply(reply string, maxLen int) string {
	if maxLen <= 0 {
		maxLen = DefaultMaxReplyLength
	}
	if maxLen > MaxReplyLengthCap {
		maxLen = MaxReplyLengthCap
	}
	r := []rune(strings.TrimSpace(reply))
	if len(r) <= maxLen {
		return string(r)
	}
	return strings.TrimSpace(string(r[:maxLen])) + "…"
}

// EffectiveMaxReplyLength menormalkan MaxReplyLength dari config.
func EffectiveMaxReplyLength(cfg *models.AIReplyConfig) int {
	if cfg == nil || cfg.MaxReplyLength <= 0 {
		return DefaultMaxReplyLength
	}
	if cfg.MaxReplyLength > MaxReplyLengthCap {
		return MaxReplyLengthCap
	}
	return cfg.MaxReplyLength
}

// EffectiveContextMessages menormalkan ContextMessages dari config (0..20).
func EffectiveContextMessages(cfg *models.AIReplyConfig) int {
	if cfg == nil {
		return 10
	}
	if cfg.ContextMessages < 0 {
		return 0
	}
	if cfg.ContextMessages > MaxContextMessages {
		return MaxContextMessages
	}
	return cfg.ContextMessages
}

// IsChatbotPlan melaporkan apakah slug/nama paket termasuk paket chatbot.
func IsChatbotPlan(slugOrName string) bool {
	return ChatbotPlanSlugs[strings.ToLower(strings.TrimSpace(slugOrName))]
}

// ChatbotAllowed memeriksa plan gating: chatbot aktif bila langganan
// TERAKHIR user masih berlaku (end_date belum lewat) dan paketnya
// Pro/Master (slug atau nama, case-insensitive). Mengembalikan
// (diizinkan, namaPaket). User tanpa langganan = Free = tidak diizinkan.
func ChatbotAllowed(db *gorm.DB, userID uint) (bool, string) {
	var sub models.Subscription
	err := db.Where("user_id = ? AND status IN ? AND start_date <= ?",
		userID, []string{"active", "scheduled", "expired", "cancelled"}, time.Now()).
		Preload("Plan").
		Order("end_date DESC").
		First(&sub).Error
	if err != nil {
		return false, ""
	}
	if time.Now().After(sub.EndDate) {
		return false, sub.Plan.Name
	}
	if IsChatbotPlan(sub.Plan.Slug) || IsChatbotPlan(sub.Plan.Name) {
		return true, sub.Plan.Name
	}
	return false, sub.Plan.Name
}

// RecentContext mengambil N pesan terakhir percakapan (user, device, phone)
// dari inbox sebagai konteks LLM, terurut kronologis (pesan lama dulu).
// Direction "in" = user, "out" = assistant. Pesan saat ini belum tersimpan
// di inbox saat dipanggil, jadi tidak ikut — pemanggil menambahkannya sendiri.
func RecentContext(db *gorm.DB, userID, deviceID uint, phone string, n int) []ChatMessage {
	if n <= 0 {
		return nil
	}
	if n > MaxContextMessages {
		n = MaxContextMessages
	}
	var rows []models.ChatInbox
	db.Where("user_id = ? AND device_id = ? AND phone = ? AND content <> ''",
		userID, deviceID, phone).
		Order("created_at DESC, id DESC").
		Limit(n).
		Find(&rows)
	msgs := make([]ChatMessage, 0, len(rows))
	for i := len(rows) - 1; i >= 0; i-- {
		role := "user"
		if rows[i].Direction == "out" {
			role = "assistant"
		}
		msgs = append(msgs, ChatMessage{Role: role, Content: rows[i].Content})
	}
	return NormalizeChatHistory(msgs)
}
