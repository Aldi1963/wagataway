package models

import (
	"time"
)

// PasswordResetToken menyimpan token reset password sekali pakai.
// Hanya hash token yang disimpan; token mentah dikirim lewat email.
type PasswordResetToken struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"not null;index" json:"userId"`
	TokenHash string    `gorm:"size:64;not null;uniqueIndex" json:"-"`
	ExpiresAt time.Time `gorm:"not null" json:"expiresAt"`
	UsedAt    *time.Time `json:"usedAt"`
	CreatedAt time.Time `json:"createdAt"`
}
