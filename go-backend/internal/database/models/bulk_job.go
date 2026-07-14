package models

import (
	"time"

	"gorm.io/gorm"
)

type BulkJob struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"userId"`
	DeviceID    uint           `gorm:"index;not null" json:"deviceId"`
	Name        string         `gorm:"size:255" json:"name"`
	Type        string         `gorm:"size:20;default:text" json:"type"`
	Content     string         `gorm:"type:text" json:"content"`
	MediaURL    string         `gorm:"size:500" json:"mediaUrl"`
	Caption     string         `gorm:"type:text" json:"caption"`
	Status      string         `gorm:"size:20;default:pending" json:"status"` // pending, processing, completed, failed, cancelled
	TotalCount  int            `gorm:"default:0" json:"totalCount"`
	SentCount   int            `gorm:"default:0" json:"sentCount"`
	FailedCount int            `gorm:"default:0" json:"failedCount"`
	MinDelay    int            `gorm:"default:3" json:"minDelay"` // seconds between messages
	MaxDelay    int            `gorm:"default:8" json:"maxDelay"`
	StartedAt   *time.Time     `json:"startedAt"`
	CompletedAt *time.Time     `json:"completedAt"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	User       User               `gorm:"foreignKey:UserID" json:"-"`
	Device     Device             `gorm:"foreignKey:DeviceID" json:"-"`
	Recipients []BulkJobRecipient `gorm:"foreignKey:BulkJobID" json:"-"`
}

type BulkJobRecipient struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	BulkJobID uint       `gorm:"index;not null" json:"bulkJobId"`
	Phone     string     `gorm:"size:20;not null" json:"phone"`
	Name      string     `gorm:"size:255" json:"name"`
	Status    string     `gorm:"size:20;default:pending" json:"status"` // pending, sent, failed
	ErrorMsg  string     `gorm:"type:text" json:"errorMsg"`
	SentAt    *time.Time `json:"sentAt"`
	CreatedAt time.Time  `json:"createdAt"`
}
