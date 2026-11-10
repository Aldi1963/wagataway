package models

import "time"

// GroupRule adalah aturan otomatis untuk grup WhatsApp per device.
type GroupRule struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	UserID     uint      `gorm:"index;not null" json:"userId"`
	DeviceID   uint      `gorm:"index;not null" json:"deviceId"`
	GroupJID   string    `gorm:"size:100;index;not null" json:"groupJid"`
	WelcomeMsg string    `gorm:"type:text" json:"welcomeMsg"`
	AntiLink   bool      `gorm:"default:false" json:"antiLink"`
	AntiSpam   bool      `gorm:"default:false" json:"antiSpam"`
	IsActive   bool      `gorm:"default:true" json:"isActive"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
