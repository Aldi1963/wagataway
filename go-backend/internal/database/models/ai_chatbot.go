package models

import (
	"time"

	"gorm.io/gorm"
)

// AIChatbotFAQ adalah satu entri knowledge base (FAQ/katalog) chatbot AI.
// Dipakai per user; DeviceID nil = berlaku untuk semua device milik user,
// sonst hanya device tersebut. Retrieval mencocokkan pertanyaan masuk
// dengan Question + Keywords (lihat service.FindBestFAQ).
type AIChatbotFAQ struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"index;not null" json:"userId"`
	DeviceID  *uint          `gorm:"index" json:"deviceId"`
	Question  string         `gorm:"type:text;not null" json:"question"`
	Answer    string         `gorm:"type:text;not null" json:"answer"`
	Keywords  string         `gorm:"size:500" json:"keywords"` // koma-dipisah, kata kunci tambahan
	IsActive  bool           `gorm:"default:true" json:"isActive"`
	Priority  int            `gorm:"default:0" json:"priority"` // makin besar makin didahulukan saat skor seri
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	User   User    `gorm:"foreignKey:UserID" json:"-"`
	Device *Device `gorm:"foreignKey:DeviceID" json:"-"`
}

// AIChatbotLog mencatat tiap balasan chatbot agar bisa diaudit:
// pertanyaan masuk, jawaban yang dikirim, dan sumbernya (faq/llm/refused/blocked).
type AIChatbotLog struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"userId"`
	DeviceID  uint      `gorm:"index;not null" json:"deviceId"`
	Phone     string    `gorm:"size:20;index" json:"phone"`    // nomor pengirim (PN)
	Question  string    `gorm:"type:text;not null" json:"question"`
	Answer    string    `gorm:"type:text;not null" json:"answer"`
	Source    string    `gorm:"size:20;not null;index" json:"source"` // faq | llm | refused | blocked
	FAQID     *uint     `gorm:"index" json:"faqId"`
	CreatedAt time.Time `json:"createdAt"`

	User User            `gorm:"foreignKey:UserID" json:"-"`
	FAQ  *AIChatbotFAQ  `gorm:"foreignKey:FAQID" json:"-"`
}
