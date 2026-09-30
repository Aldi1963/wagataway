package models

import "time"

// Affiliate menyimpan kode referral + komisi per user.
type Affiliate struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	UserID         uint      `gorm:"uniqueIndex;not null" json:"userId"`
	Code           string    `gorm:"size:20;uniqueIndex;not null" json:"code"`
	CommissionRate float64   `gorm:"default:0.2" json:"commissionRate"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// AffiliateEarning mencatat komisi dari user yang mendaftar via kode referral.
type AffiliateEarning struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	AffiliateID    uint      `gorm:"index;not null" json:"affiliateId"`
	ReferredUserID uint      `gorm:"index" json:"referredUserId"`
	Amount         float64   `gorm:"default:0" json:"amount"`
	Status         string    `gorm:"size:20;index;default:pending" json:"status"` // pending, paid
	CreatedAt      time.Time `json:"createdAt"`

	Affiliate Affiliate `gorm:"foreignKey:AffiliateID" json:"-"`
}
