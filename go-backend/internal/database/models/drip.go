package models

import (
	"time"

	"gorm.io/gorm"
)

type DripCampaign struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"userId"`
	DeviceID    uint           `gorm:"index;not null" json:"deviceId"`
	Name        string         `gorm:"size:255;not null" json:"name"`
	Description string         `gorm:"type:text" json:"description"`
	TriggerType string         `gorm:"size:30;not null" json:"triggerType"` // keyword, manual, webhook
	TriggerVal  string         `gorm:"size:255" json:"triggerVal"`
	IsActive    bool           `gorm:"default:true" json:"isActive"`
	Enrolled    int            `gorm:"default:0" json:"enrolled"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	User   User       `gorm:"foreignKey:UserID" json:"-"`
	Device Device     `gorm:"foreignKey:DeviceID" json:"-"`
	Steps  []DripStep `gorm:"foreignKey:CampaignID" json:"steps,omitempty"`
}

type DripStep struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	CampaignID uint      `gorm:"index;not null" json:"campaignId"`
	StepOrder  int       `gorm:"not null" json:"stepOrder"`
	DelayHours int       `gorm:"default:24" json:"delayHours"`
	Type       string    `gorm:"size:20;default:text" json:"type"`
	Content    string    `gorm:"type:text;not null" json:"content"`
	MediaURL   string    `gorm:"size:500" json:"mediaUrl"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`

	Campaign DripCampaign `gorm:"foreignKey:CampaignID" json:"-"`
}

type DripEnrollment struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	CampaignID uint       `gorm:"index;not null" json:"campaignId"`
	Phone      string     `gorm:"size:20;not null;index" json:"phone"`
	CurrentStep int       `gorm:"default:0" json:"currentStep"`
	Status     string     `gorm:"size:20;default:active" json:"status"` // active, completed, cancelled
	NextSendAt *time.Time `gorm:"index" json:"nextSendAt"`
	EnrolledAt time.Time  `json:"enrolledAt"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`

	Campaign DripCampaign `gorm:"foreignKey:CampaignID" json:"-"`
}
