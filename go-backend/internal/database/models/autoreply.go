package models

import (
	"time"

	"gorm.io/gorm"
)

type AutoReply struct {
	ID           uint           `gorm:"primaryKey" json:"id"`
	UserID       uint           `gorm:"index;not null" json:"userId"`
	DeviceID     *uint          `gorm:"index" json:"deviceId"` // nil = all devices
	Name         string         `gorm:"size:255;not null" json:"name"`
	Keyword      string         `gorm:"size:500;not null" json:"keyword"` // comma-separated
	MatchType    string         `gorm:"size:20;default:contains" json:"matchType"` // exact, contains, startsWith
	ReplyType    string         `gorm:"size:20;default:text" json:"replyType"`
	ReplyContent string         `gorm:"type:text;not null" json:"replyContent"`
	MediaURL     string         `gorm:"size:500" json:"mediaUrl"`
	IsActive     bool           `gorm:"default:true" json:"isActive"`
	Priority     int            `gorm:"default:0" json:"priority"`
	ScheduleFrom string         `gorm:"size:5" json:"scheduleFrom"` // HH:MM
	ScheduleTo   string         `gorm:"size:5" json:"scheduleTo"`
	CreatedAt    time.Time      `json:"createdAt"`
	UpdatedAt    time.Time      `json:"updatedAt"`
	DeletedAt    gorm.DeletedAt `gorm:"index" json:"-"`

	User   User    `gorm:"foreignKey:UserID" json:"-"`
	Device *Device `gorm:"foreignKey:DeviceID" json:"-"`
}
