package models

import (
	"time"

	"gorm.io/gorm"
)

type Contact struct {
	ID        uint           `gorm:"primaryKey" json:"id"`
	UserID    uint           `gorm:"index;not null" json:"userId"`
	Name      string         `gorm:"size:255;not null" json:"name"`
	Phone     string         `gorm:"size:20;not null" json:"phone"`
	Email     string         `gorm:"size:255" json:"email"`
	Notes     string         `gorm:"type:text" json:"notes"`
	Tags      string         `gorm:"type:text" json:"tags"` // JSON array
	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

type ContactGroup struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"userId"`
	Name        string         `gorm:"size:255;not null" json:"name"`
	Description string         `gorm:"type:text" json:"description"`
	Color       string         `gorm:"size:20" json:"color"`
	MemberCount int            `gorm:"default:0" json:"memberCount"`
	// WAJID: JID grup WhatsApp sumber sync (unik per user). Kosong untuk grup manual.
	WAJID       string         `gorm:"size:64;index" json:"waJid"`
	// WelcomeDM: kirim DM pribadi otomatis ke anggota baru yang join grup WA
	// ini. Hanya berlaku untuk grup hasil sync (WAJID terisi).
	WelcomeDMEnabled  bool   `gorm:"default:false" json:"welcomeDmEnabled"`
	WelcomeDMTemplate string `gorm:"type:text" json:"welcomeDmTemplate"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	User    User                 `gorm:"foreignKey:UserID" json:"-"`
	Members []ContactGroupMember `gorm:"foreignKey:GroupID" json:"-"`
}

type ContactGroupMember struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	GroupID   uint      `gorm:"index;not null" json:"groupId"`
	ContactID uint      `gorm:"index;not null" json:"contactId"`
	CreatedAt time.Time `json:"createdAt"`

	Group   ContactGroup `gorm:"foreignKey:GroupID" json:"-"`
	Contact Contact      `gorm:"foreignKey:ContactID" json:"-"`
}
