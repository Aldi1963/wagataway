package models

import "time"

// TeamMember adalah sub-akun di bawah pemilik akun (OwnerID).
type TeamMember struct {
	ID       uint   `gorm:"primaryKey" json:"id"`
	OwnerID  uint   `gorm:"index;not null" json:"ownerId"`
	Email    string `gorm:"size:255;uniqueIndex;not null" json:"email"`
	Name     string `gorm:"size:255;not null" json:"name"`
	Role     string `gorm:"size:20;default:member" json:"role"` // admin, member, viewer
	IsActive bool   `gorm:"default:true" json:"isActive"`
	Password string `gorm:"size:255" json:"-"`
	// Proteksi brute-force team-login (cermin kolom yang sama di User):
	// 5x gagal beruntun -> kunci 15 menit.
	FailedAttempts int        `gorm:"default:0" json:"-"`
	LockedUntil    *time.Time `json:"-"`
	CreatedAt      time.Time  `json:"createdAt"`
	UpdatedAt      time.Time  `json:"updatedAt"`

	Owner User `gorm:"foreignKey:OwnerID" json:"-"`
}
