package models

import "time"

// ChatLabel adalah label yang bisa ditempel ke chat (mis. prospek, komplain, closing).
type ChatLabel struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"userId"`
	Name      string    `gorm:"size:100;not null" json:"name"`
	Color     string    `gorm:"size:20;default:#243370" json:"color"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// ChatAssignment menautkan chat (JID) ke label + penugasan CS.
type ChatAssignment struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	UserID     uint      `gorm:"index;not null" json:"userId"`
	ChatJID    string    `gorm:"size:100;index;not null" json:"chatJid"`
	LabelID    *uint     `gorm:"index" json:"labelId"`
	AssignedTo string    `gorm:"size:255" json:"assignedTo"` // nama CS
	Note       string    `gorm:"type:text" json:"note"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`

	User  User       `gorm:"foreignKey:UserID" json:"-"`
	Label *ChatLabel `gorm:"foreignKey:LabelID" json:"label,omitempty"`
}
