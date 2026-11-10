package models

import (
	"time"
)

type BotProduct struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      uint      `gorm:"index;not null" json:"userId"`
	Name        string    `gorm:"size:255;not null" json:"name"`
	Description string    `gorm:"type:text" json:"description"`
	Price       int64     `gorm:"not null" json:"price"`
	Stock       int       `gorm:"default:0" json:"stock"`
	ImageURL    string    `gorm:"size:500" json:"imageUrl"`
	IsActive    bool      `gorm:"default:true" json:"isActive"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

type BotOrder struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	UserID     uint      `gorm:"index;not null" json:"userId"`
	ProductID  uint      `gorm:"index;not null" json:"productId"`
	BuyerPhone string    `gorm:"size:20;not null" json:"buyerPhone"`
	BuyerName  string    `gorm:"size:255" json:"buyerName"`
	Quantity   int       `gorm:"default:1" json:"quantity"`
	Total      int64     `gorm:"not null" json:"total"`
	Status     string    `gorm:"size:20;default:pending" json:"status"`
	Notes      string    `gorm:"type:text" json:"notes"`
	CreatedAt  time.Time `json:"createdAt"`
	UpdatedAt  time.Time `json:"updatedAt"`

	User    User       `gorm:"foreignKey:UserID" json:"-"`
	Product BotProduct `gorm:"foreignKey:ProductID" json:"-"`
}

type AdminWaBot struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	DeviceID  *uint     `gorm:"index" json:"deviceId"`
	Name      string    `gorm:"size:255" json:"name"`
	Prompt    string    `gorm:"type:text" json:"prompt"`
	IsActive  bool      `gorm:"default:false" json:"isActive"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
