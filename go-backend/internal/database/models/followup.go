package models

import "time"

// Followup adalah pesan tindak lanjut otomatis yang dikirim sekian jam
// setelah interaksi terakhir ke nomor target.
type Followup struct {
	ID               uint       `gorm:"primaryKey" json:"id"`
	UserID           uint       `gorm:"index;not null" json:"userId"`
	Name             string     `gorm:"size:255;not null" json:"name"`
	DeviceID         uint       `gorm:"index" json:"deviceId"`
	TargetPhone      string     `gorm:"size:30;not null" json:"targetPhone"`
	Message          string     `gorm:"type:text;not null" json:"message"`
	TriggerAfterHours int       `gorm:"default:24" json:"triggerAfterHours"`
	IsActive         bool       `gorm:"default:true" json:"isActive"`
	LastSentAt       *time.Time `json:"lastSentAt"`
	CreatedAt        time.Time  `json:"createdAt"`
	UpdatedAt        time.Time  `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
