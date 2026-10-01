package models

import (
	"time"

	"gorm.io/gorm"
)

// MenuBot adalah chatbot menu bertingkat per device. Pengirim mengetik keyword
// pemicu untuk memulai sesi, lalu memilih opsi bernomor; tiap opsi membalas
// teks atau melompat ke sub-menu (MenuBot lain). Default NONAKTIF agar tidak
// mengganggu integrasi lain (mis. bot PPOB via webhook).
type MenuBot struct {
	ID             uint           `gorm:"primaryKey" json:"id"`
	UserID         uint           `gorm:"index;not null" json:"userId"`
	DeviceID       *uint          `gorm:"index" json:"deviceId"` // nil = semua device
	Name           string         `gorm:"size:255;not null" json:"name"`
	TriggerKeyword string         `gorm:"size:100;not null" json:"triggerKeyword"`
	IntroText      string         `gorm:"type:text" json:"introText"` // teks pembuka menu utama
	AlwaysActive   bool           `gorm:"default:false" json:"alwaysActive"` // true = setiap pesan masuk memulai menu (tanpa keyword)
	IsActive       bool           `gorm:"default:false" json:"isActive"`
	CreatedAt      time.Time      `json:"createdAt"`
	UpdatedAt      time.Time      `json:"updatedAt"`
	DeletedAt      gorm.DeletedAt `gorm:"index" json:"-"`

	Items []MenuBotItem `gorm:"foreignKey:MenuBotID" json:"items,omitempty"`

	User   User    `gorm:"foreignKey:UserID" json:"-"`
	Device *Device `gorm:"foreignKey:DeviceID" json:"-"`
}

// MenuBotItem adalah satu opsi bernomor di dalam sebuah MenuBot.
// ActionType: "reply" (balas teks) atau "submenu" (lompat ke MenuBot lain).
type MenuBotItem struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	MenuBotID  uint      `gorm:"index;not null" json:"menuBotId"`
	Position   int       `gorm:"default:0" json:"position"` // urutan tampil (1, 2, 3, ...)
	Label      string    `gorm:"size:255;not null" json:"label"`
	ActionType string    `gorm:"size:20;default:reply" json:"actionType"` // reply | submenu
	ReplyText  string    `gorm:"type:text" json:"replyText"`
	SubMenuID  *uint     `gorm:"index" json:"subMenuId"` // MenuBot tujuan bila actionType=submenu
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`

	MenuBot MenuBot  `gorm:"foreignKey:MenuBotID" json:"-"`
	SubMenu *MenuBot `gorm:"foreignKey:SubMenuID" json:"subMenu,omitempty"`
}

// MenuBotSession menyimpan state percakapan per (device, nomor pengirim).
// History adalah tumpukan ID menu induk (dipisah koma, mis. "3,7") agar
// perintah "0"/"kembali" bisa naik satu level. Sesi kedaluwarsa setelah
// menuBotSessionTimeout idle (lazy cleanup saat pesan berikutnya tiba).
type MenuBotSession struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	UserID        uint      `gorm:"index;not null" json:"-"`
	DeviceID      uint      `gorm:"index;not null;uniqueIndex:idx_mbs_device_phone" json:"-"`
	Phone         string    `gorm:"size:20;not null;uniqueIndex:idx_mbs_device_phone" json:"phone"`
	RootMenuID    uint      `gorm:"not null" json:"rootMenuId"`
	CurrentMenuID uint      `gorm:"not null" json:"currentMenuId"`
	History       string    `gorm:"size:500;default:''" json:"-"`
	LastActiveAt  time.Time `gorm:"not null;index" json:"lastActiveAt"`
	CreatedAt     time.Time `json:"createdAt"`
	UpdatedAt     time.Time `json:"updatedAt"`

	RootMenu    MenuBot `gorm:"foreignKey:RootMenuID" json:"rootMenu,omitempty"`
	CurrentMenu MenuBot `gorm:"foreignKey:CurrentMenuID" json:"currentMenu,omitempty"`
}
