package models

import (
	"time"

	"gorm.io/gorm"
)

// AIConnection adalah koneksi AI milik user: provider + API key (terenkripsi)
// + model pilihan. Satu user punya satu koneksi aktif; dipakai oleh semua
// fitur AI (auto-reply per device, tombol "Hasilkan Balasan AI" di Live Chat,
// CS bot) milik user tersebut.
type AIConnection struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"uniqueIndex;not null" json:"userId"`
	Provider  string         `gorm:"size:20;not null;default:openai" json:"provider"` // openai, gemini, anthropic, custom
	Model     string         `gorm:"size:100;not null" json:"model"`
	BaseURL   string         `gorm:"size:255" json:"baseUrl"`      // hanya untuk provider=custom (OpenAI-compatible)
	APIKeyEnc string         `gorm:"type:text;not null" json:"-"`  // terenkripsi AES-GCM, tidak pernah dikirim ke frontend
	KeyHint   string         `gorm:"size:12" json:"keyHint"`        // 4 karakter terakhir key, untuk ditampilkan di UI
	IsActive  bool           `gorm:"default:true" json:"isActive"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
