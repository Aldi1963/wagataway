package models

import "time"

// ── WhatsApp OTP (Fitur 3) ──────────────────────────────────────────────────
// Kode OTP numerik yang dikirim via WA. KODE PLAINTEXT TIDAK PERNAH DISIMPAN —
// hanya SHA256 hex digest-nya (CodeHash) yang disimpan. Sekali pakai, ada
// batas kedaluwarsa, dan hangus setelah 5x percobaan salah.
type WaOtpCode struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"userId"`
	Phone     string    `gorm:"size:20;not null;index" json:"phone"`        // ternormalisasi: 62xxxxxxxxxx
	CodeHash  string    `gorm:"size:128;not null" json:"-"`                 // SHA256 hex, TIDAK PERNAH diekspos
	Length    int       `gorm:"default:6" json:"length"`                    // panjang digit kode (4–8)
	ExpiresAt time.Time `gorm:"not null;index" json:"expiresAt"`
	Status    string    `gorm:"size:20;default:active;index" json:"status"` // active | used | invalidated
	Attempts  int       `gorm:"default:0" json:"attempts"`                   // jumlah tebakan salah
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// MaskedStatus adalah representasi status yang aman untuk UI publik.
func (o *WaOtpCode) IsActive() bool {
	return o.Status == "active" && time.Now().Before(o.ExpiresAt)
}
