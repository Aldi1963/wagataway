package models

import (
	"time"
)

type CsBot struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      uint      `gorm:"index;not null" json:"userId"`
	DeviceID    *uint     `gorm:"index" json:"deviceId"`
	Name        string    `gorm:"size:255;not null" json:"name"`
	Prompt      string    `gorm:"type:text" json:"prompt"` // system prompt
	Model       string    `gorm:"size:50;default:gpt-4o-mini" json:"model"`
	Provider    string    `gorm:"size:20;default:openai" json:"provider"` // openai, anthropic
	MaxTokens   int       `gorm:"default:500" json:"maxTokens"`
	Temperature float64   `gorm:"default:0.7" json:"temperature"`
	IsActive    bool      `gorm:"default:true" json:"isActive"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

type CsBotFaq struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	BotID     uint      `gorm:"index;not null" json:"botId"`
	Question  string    `gorm:"type:text;not null" json:"question"`
	Answer    string    `gorm:"type:text;not null" json:"answer"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	Bot CsBot `gorm:"foreignKey:BotID" json:"-"`
}

type CsBotKnowledge struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	BotID     uint      `gorm:"index;not null" json:"botId"`
	Title     string    `gorm:"size:255;not null" json:"title"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	Source    string    `gorm:"size:500" json:"source"` // file name or URL
	CreatedAt time.Time `json:"createdAt"`

	Bot CsBot `gorm:"foreignKey:BotID" json:"-"`
}
