package models

import (
	"time"

	"gorm.io/gorm"
)

type Device struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"userId"`
	Name        string         `gorm:"size:255;not null" json:"name"`
	Phone       string         `gorm:"size:20" json:"phone"`
	Status      string         `gorm:"size:30;default:disconnected" json:"status"` // connected, connecting, disconnected
	IsDefault   bool           `gorm:"default:false" json:"isDefault"`
	AutoOnline  bool           `gorm:"default:false" json:"autoOnline"`
	WebhookURL  string         `gorm:"size:500" json:"webhookUrl"`
	MaxRetries  int            `gorm:"default:3" json:"maxRetries"`
	RetryDelay  int            `gorm:"default:5" json:"retryDelay"` // seconds
	LastSeen    *time.Time     `json:"lastSeen"`
	ConnectedAt *time.Time     `json:"connectedAt"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	User     User      `gorm:"foreignKey:UserID" json:"-"`
	Messages []Message `gorm:"foreignKey:DeviceID" json:"-"`
}
