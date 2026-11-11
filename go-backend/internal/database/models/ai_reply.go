package models

import (
	"time"

	"gorm.io/gorm"
)

// AIReplyConfig adalah konfigurasi AI auto-reply per device.
// Ketika pesan masuk cocok dengan TriggerKeywords (atau kosong = semua pesan),
// pesan diteruskan ke backend AI dan balasannya dikirim otomatis.
type AIReplyConfig struct {
	ID              uint           `gorm:"primaryKey" json:"id"`
	UserID          uint           `gorm:"index;not null" json:"userId"`
	DeviceID        uint           `gorm:"index;not null" json:"deviceId"`
	IsEnabled       bool           `gorm:"default:true" json:"isEnabled"`
	SystemPrompt    string         `gorm:"type:text" json:"systemPrompt"`
	TriggerKeywords string         `gorm:"size:500" json:"triggerKeywords"` // koma-dipisah, kosong = semua pesan
	IgnoreGroups    bool           `gorm:"default:true" json:"ignoreGroups"`
	InjectionGuard  bool           `gorm:"default:true" json:"injectionGuard"` // proteksi prompt injection
	// Chatbot AI (FAQ/katalog + fallback LLM), aktif hanya untuk paket
	// Pro/Master (lihat service.ChatbotAllowed).
	UseFAQ          bool `gorm:"default:true" json:"useFaq"`          // retrieval FAQ sebelum LLM
	StrictFAQ       bool `gorm:"default:false" json:"strictFaq"`      // true = tolak topik di luar FAQ, tanpa LLM
	MaxReplyLength  int  `gorm:"default:1000" json:"maxReplyLength"`   // batas panjang jawaban (karakter), 0 = 1000
	ContextMessages int  `gorm:"default:10" json:"contextMessages"`   // N pesan terakhir sebagai konteks LLM (0..20)
	CreatedAt       time.Time      `json:"createdAt"`
	UpdatedAt       time.Time      `json:"updatedAt"`
	DeletedAt       gorm.DeletedAt `gorm:"index" json:"-"`

	User   User   `gorm:"foreignKey:UserID" json:"-"`
	Device Device `gorm:"foreignKey:DeviceID" json:"-"`
}
