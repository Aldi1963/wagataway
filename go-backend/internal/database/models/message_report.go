package models

import "time"

// MessageReport mencatat status pengiriman per nomor per campaign broadcast.
// Diisi bertahap oleh worker pengiriman (saat ini hanya API baca + model).
type MessageReport struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	UserID     uint      `gorm:"index;not null" json:"userId"`
	DeviceID   uint      `gorm:"index" json:"deviceId"`
	CampaignID string    `gorm:"size:100;index;not null" json:"campaignId"`
	Phone      string    `gorm:"size:30;not null" json:"phone"`
	MessageID  string    `gorm:"size:64;index" json:"messageId"`
	Status     string    `gorm:"size:20;index;default:sent" json:"status"` // sent, delivered, read, failed
	ErrorMsg   string    `gorm:"type:text" json:"errorMsg"`
	SentAt     time.Time `json:"sentAt"`
	CreatedAt  time.Time `json:"createdAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
