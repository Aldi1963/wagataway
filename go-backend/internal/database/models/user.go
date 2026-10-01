package models

import (
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

type User struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UUID      string         `gorm:"type:uuid;uniqueIndex;not null" json:"uuid"`
	Name      string         `gorm:"size:255;not null" json:"name"`
	Email     string         `gorm:"size:255;uniqueIndex;not null" json:"email"`
	Phone     string         `gorm:"size:20" json:"phone"`
	Password  string         `gorm:"size:255" json:"-"`
	Avatar    string         `gorm:"size:500" json:"avatar"`
	Role      string         `gorm:"size:20;default:user" json:"role"` // admin, user
	Plan      string         `gorm:"size:50;default:free" json:"plan"`
	Status    string         `gorm:"size:20;default:active" json:"status"` // active, suspended, banned
	GoogleID  string         `gorm:"size:255" json:"-"`
	GithubID  string         `gorm:"size:255" json:"-"`
	// Nomor notifikasi WA milik user — tujuan pengiriman pengingat expired
	// langganan otomatis (Fitur 1). Format: 628xxxxxxxxxx. Kosong = tidak dikirimi.
	NotifyWA  string         `gorm:"size:20" json:"notifyWa"`
	TwoFASecret string      `gorm:"size:255" json:"-"`
	TwoFAEnabled bool        `gorm:"default:false" json:"twoFaEnabled"`
	// Kode cadangan 2FA: array JSON berisi hash bcrypt, plaintext hanya
	// ditampilkan sekali saat dibuat.
	TwoFABackupCodes string `gorm:"type:text" json:"-"`
	// Proteksi brute-force: dikunci sementara setelah 5x salah password.
	FailedAttempts int        `gorm:"default:0" json:"-"`
	LockedUntil    *time.Time `json:"-"`
	Timezone  string         `gorm:"size:50;default:Asia/Jakarta" json:"timezone"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	Devices       []Device       `gorm:"foreignKey:UserID" json:"-"`
	Subscriptions []Subscription `gorm:"foreignKey:UserID" json:"-"`
	ApiKeys       []ApiKey       `gorm:"foreignKey:UserID" json:"-"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.UUID == "" {
		u.UUID = uuid.New().String()
	}
	return nil
}
