package models

import (
	"time"

	"gorm.io/gorm"
)

type Message struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	UserID     uint           `gorm:"index;not null" json:"userId"`
	DeviceID   uint           `gorm:"index;not null" json:"deviceId"`
	BulkJobID  *uint          `gorm:"index" json:"bulkJobId"`
	To         string         `gorm:"size:20;not null;index" json:"to"`
	Type       string         `gorm:"size:20;default:text" json:"type"` // text, image, video, document, audio, sticker
	Content    string         `gorm:"type:text" json:"content"`
	MediaURL   string         `gorm:"size:500" json:"mediaUrl"`
	Caption    string         `gorm:"type:text" json:"caption"`
	Status     string         `gorm:"size:20;default:pending;index" json:"status"` // pending, sent, delivered, read, failed
	ErrorMsg   string         `gorm:"type:text" json:"errorMsg"`
	MessageID  string         `gorm:"size:100;index" json:"messageId"` // WA message ID
	Direction  string         `gorm:"size:10;default:outgoing" json:"direction"` // outgoing, incoming
	RetryCount int            `gorm:"default:0" json:"retryCount"`
	SentAt     *time.Time     `json:"sentAt"`
	CreatedAt  time.Time      `json:"createdAt"`
	UpdatedAt  time.Time      `json:"updatedAt"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	User    User    `gorm:"foreignKey:UserID" json:"-"`
	Device  Device  `gorm:"foreignKey:DeviceID" json:"-"`
	BulkJob *BulkJob `gorm:"foreignKey:BulkJobID" json:"-"`
}
