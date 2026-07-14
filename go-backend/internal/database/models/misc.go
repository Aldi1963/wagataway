package models

import (
	"time"

	"gorm.io/gorm"
)

// ── API Keys ──────────────────────────────────────────────────────────────────

type ApiKey struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"index;not null" json:"userId"`
	Name      string         `gorm:"size:100;not null" json:"name"`
	Key       string         `gorm:"size:64;uniqueIndex;not null" json:"key"`
	IsActive  bool           `gorm:"default:true" json:"isActive"`
	LastUsed  *time.Time     `json:"lastUsed"`
	ExpiresAt *time.Time     `json:"expiresAt"`
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// ── Scheduled Messages ────────────────────────────────────────────────────────

type ScheduledMessage struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	UserID    uint       `gorm:"index;not null" json:"userId"`
	DeviceID  uint       `gorm:"index;not null" json:"deviceId"`
	To        string     `gorm:"size:20;not null" json:"to"`
	Type      string     `gorm:"size:20;default:text" json:"type"`
	Content   string     `gorm:"type:text;not null" json:"content"`
	MediaURL  string     `gorm:"size:500" json:"mediaUrl"`
	Status    string     `gorm:"size:20;default:pending" json:"status"` // pending, sent, failed, cancelled
	SendAt    time.Time  `gorm:"not null;index" json:"sendAt"`
	SentAt    *time.Time `json:"sentAt"`
	ErrorMsg  string     `gorm:"type:text" json:"errorMsg"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`

	User   User   `gorm:"foreignKey:UserID" json:"-"`
	Device Device `gorm:"foreignKey:DeviceID" json:"-"`
}

// ── Webhooks ──────────────────────────────────────────────────────────────────

type Webhook struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	UserID        uint       `gorm:"index;not null" json:"userId"`
	DeviceID      *uint      `gorm:"index" json:"deviceId"`
	URL           string     `gorm:"size:500;not null" json:"url"`
	Secret        string     `gorm:"size:255" json:"secret"`
	Events        string     `gorm:"type:text" json:"events"` // JSON array
	IsActive      bool       `gorm:"default:true" json:"isActive"`
	TriggerCount  int        `gorm:"default:0" json:"triggerCount"`
	LastTriggered *time.Time `json:"lastTriggered"`
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// ── Plugins ───────────────────────────────────────────────────────────────────

type Plugin struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"userId"`
	Name      string    `gorm:"size:100;not null" json:"name"`
	Type      string    `gorm:"size:50;not null" json:"type"`
	Config    string    `gorm:"type:text" json:"config"` // JSON
	IsActive  bool      `gorm:"default:true" json:"isActive"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// ── Settings ──────────────────────────────────────────────────────────────────

type Setting struct {
	ID    uint   `gorm:"primaryKey" json:"id"`
	Key   string `gorm:"size:100;uniqueIndex;not null" json:"key"`
	Value string `gorm:"type:text" json:"value"`
	Type  string `gorm:"size:20;default:string" json:"type"` // string, json, number, boolean
}

// ── Notifications ─────────────────────────────────────────────────────────────

type Notification struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    *uint     `gorm:"index" json:"userId"` // nil = broadcast
	Type      string    `gorm:"size:30;not null" json:"type"`
	Title     string    `gorm:"size:255;not null" json:"title"`
	Message   string    `gorm:"type:text;not null" json:"message"`
	Link      string    `gorm:"size:500" json:"link"`
	IsRead    bool      `gorm:"default:false" json:"isRead"`
	CreatedAt time.Time `json:"createdAt"`
}

// ── Chat Inbox ────────────────────────────────────────────────────────────────

type ChatInbox struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"userId"`
	DeviceID  uint      `gorm:"index;not null" json:"deviceId"`
	Phone     string    `gorm:"size:20;not null;index" json:"phone"`
	Name      string    `gorm:"size:255" json:"name"`
	Content   string    `gorm:"type:text" json:"content"`
	Type      string    `gorm:"size:20;default:text" json:"type"`
	Direction string    `gorm:"size:10;not null" json:"direction"` // in, out
	MediaURL  string    `gorm:"size:500" json:"mediaUrl"`
	IsRead    bool      `gorm:"default:false" json:"isRead"`
	CreatedAt time.Time `json:"createdAt"`

	User   User   `gorm:"foreignKey:UserID" json:"-"`
	Device Device `gorm:"foreignKey:DeviceID" json:"-"`
}

type ChatConversation struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index;not null" json:"userId"`
	DeviceID     uint      `gorm:"index;not null" json:"deviceId"`
	Phone        string    `gorm:"size:20;not null" json:"phone"`
	ContactName  string    `gorm:"size:255" json:"contactName"`
	LastMessage  string    `gorm:"type:text" json:"lastMessage"`
	UnreadCount  int       `gorm:"default:0" json:"unreadCount"`
	LastActivity time.Time `json:"lastActivity"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

// ── Templates ─────────────────────────────────────────────────────────────────

type MessageTemplate struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"userId"`
	Name      string    `gorm:"size:255;not null" json:"name"`
	Category  string    `gorm:"size:50" json:"category"`
	Content   string    `gorm:"type:text;not null" json:"content"`
	Variables string    `gorm:"type:text" json:"variables"` // JSON array
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// ── Email OTP ─────────────────────────────────────────────────────────────────

type EmailOtp struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Email     string    `gorm:"size:255;not null;index" json:"email"`
	Code      string    `gorm:"size:10;not null" json:"code"`
	ExpiresAt time.Time `gorm:"not null" json:"expiresAt"`
	Used      bool      `gorm:"default:false" json:"used"`
	CreatedAt time.Time `json:"createdAt"`
}

// ── Canned Responses ──────────────────────────────────────────────────────────

type CannedResponse struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"userId"`
	Title     string    `gorm:"size:255;not null" json:"title"`
	Shortcut  string    `gorm:"size:50" json:"shortcut"` // e.g. /thanks
	Content   string    `gorm:"type:text;not null" json:"content"`
	Category  string    `gorm:"size:50" json:"category"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// ── Short Links ───────────────────────────────────────────────────────────────

type ShortLink struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      uint      `gorm:"index;not null" json:"userId"`
	Code        string    `gorm:"size:20;uniqueIndex;not null" json:"code"`
	TargetURL   string    `gorm:"size:2000;not null" json:"targetUrl"`
	Title       string    `gorm:"size:255" json:"title"`
	ClickCount  int       `gorm:"default:0" json:"clickCount"`
	IsActive    bool      `gorm:"default:true" json:"isActive"`
	ExpiresAt   *time.Time `json:"expiresAt"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// ── Blacklist ─────────────────────────────────────────────────────────────────

type Blacklist struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"userId"`
	Phone     string    `gorm:"size:20;not null" json:"phone"`
	Reason    string    `gorm:"size:500" json:"reason"`
	CreatedAt time.Time `json:"createdAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
