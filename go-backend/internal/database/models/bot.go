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
	Category    string    `gorm:"size:100;default:''" json:"category"`
	ImageURL    string    `gorm:"size:500" json:"imageUrl"`
	IsActive    bool      `gorm:"default:true" json:"isActive"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// BotOrder adalah satu pesanan pelanggan. Order multi-item: rincian ada di
// Items; kolom ProductID/Quantity dipertahankan sebagai ringkasan item pertama
// demi kompatibilitas dengan baris lama (sebelum ada BotOrderItem).
type BotOrder struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      uint      `gorm:"index;not null" json:"userId"`
	OrderNumber string    `gorm:"size:30;not null;uniqueIndex:idx_bot_order_number" json:"orderNumber"`
	ProductID   uint      `gorm:"index" json:"productId"`
	BuyerPhone  string    `gorm:"size:20;not null" json:"buyerPhone"`
	BuyerName   string    `gorm:"size:255" json:"buyerName"`
	Quantity    int       `gorm:"default:1" json:"quantity"`
	Total       int64     `gorm:"not null" json:"total"`
	Status      string    `gorm:"size:20;default:pending;index" json:"status"`
	Notes       string    `gorm:"type:text" json:"notes"`
	CreatedAt   time.Time `json:"createdAt"`
	UpdatedAt   time.Time `json:"updatedAt"`

	User    User           `gorm:"foreignKey:UserID" json:"-"`
	Product BotProduct     `gorm:"foreignKey:ProductID" json:"-"`
	Items   []BotOrderItem `gorm:"foreignKey:OrderID" json:"items,omitempty"`
}

// BotOrderItem adalah satu baris dalam sebuah BotOrder. Nama & harga
// di-snapshot saat checkout agar perubahan katalog tidak mengubah order lama.
type BotOrderItem struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	OrderID     uint   `gorm:"index;not null" json:"orderId"`
	ProductID   uint   `gorm:"index;not null" json:"productId"`
	ProductName string `gorm:"size:255;not null" json:"productName"`
	Price       int64  `gorm:"not null" json:"price"`
	Quantity    int    `gorm:"not null" json:"quantity"`
	Subtotal    int64  `gorm:"not null" json:"subtotal"`

	Order   BotOrder   `gorm:"foreignKey:OrderID" json:"-"`
	Product BotProduct `gorm:"foreignKey:ProductID" json:"-"`
}

// BotCartSession menyimpan keranjang belanja pelanggan selama sesi katalog
// di chat WA. ItemsJSON berisi array {"productId": N, "qty": M}.
// Sesi kedaluwarsa setelah catalogSessionTimeout idle (lazy cleanup).
type BotCartSession struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index;not null" json:"-"`
	DeviceID     uint      `gorm:"index;not null;uniqueIndex:idx_bcs_device_phone" json:"-"`
	Phone        string    `gorm:"size:20;not null;uniqueIndex:idx_bcs_device_phone" json:"phone"`
	ItemsJSON    string    `gorm:"type:text;default:'[]'" json:"-"`
	LastActiveAt time.Time `gorm:"not null;index" json:"lastActiveAt"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
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
