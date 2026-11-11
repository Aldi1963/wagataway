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
	TransactionID  *uint     `gorm:"uniqueIndex;index" json:"transactionId,omitempty"`
	Amount         float64   `gorm:"default:0" json:"amount"`
	Status         string    `gorm:"size:20;index;default:pending" json:"status"` // pending, paid
	CreatedAt      time.Time `json:"createdAt"`

	Affiliate Affiliate `gorm:"foreignKey:AffiliateID" json:"-"`
}

// Konstanta voucher hadiah referral (Item 9): pengajak mendapat voucher
// trial saat teman yang diajak menyelesaikan aktivasi berbayar PERTAMA.
const (
	// ReferralRewardDurationDays: masa trial yang diberikan voucher hadiah.
	ReferralRewardDurationDays = 7
	// ReferralRewardExpiryDays: voucher hadiah kedaluwarsa bila tidak
	// dipakai dalam jangka ini sejak diterbitkan.
	ReferralRewardExpiryDays = 90
	// ReferralRewardVoucherPrefix: awalan kode agar hadiah referral mudah
	// dikenali di daftar voucher admin maupun halaman afiliasi.
	ReferralRewardVoucherPrefix = "REF-"
)

// ReferralReward mencatat voucher hadiah yang diterbitkan otomatis untuk
// pengajak saat satu referral berhasil. Satu teman yang diajak hanya
// menerbitkan SATU hadiah (uniqueIndex referred_user_id) — webhook yang
// terulang atau pembayaran berikutnya dari teman yang sama tidak membuat
// hadiah ganda. TransactionID menyimpan pemicu (transaksi berbayar pertama
// teman yang diajak) untuk audit.
type ReferralReward struct {
	ID             uint      `gorm:"primaryKey" json:"id"`
	AffiliateID    uint      `gorm:"index;not null" json:"-"`
	ReferrerUserID uint      `gorm:"index;not null" json:"-"`
	ReferredUserID uint      `gorm:"uniqueIndex;not null" json:"referredUserId"`
	TransactionID  *uint     `gorm:"uniqueIndex" json:"transactionId,omitempty"`
	VoucherID      uint      `gorm:"not null" json:"voucherId"`
	CreatedAt      time.Time `json:"createdAt"`

	Voucher Voucher `gorm:"foreignKey:VoucherID" json:"voucher,omitempty"`
}
