package models

import (
	"time"

	"gorm.io/gorm"
)

// Integration adalah "konektor" webhook-inbox untuk satu platform luar
// (Google Forms, WooCommerce, WordPress, Zapier, dll).
// Fitur 7: Integration Hub — user non-teknis menghubungkan platform tanpa coding.
type Integration struct {
	ID       uint   `gorm:"primaryKey" json:"id"`
	UserID   uint   `gorm:"index;not null" json:"userId"`
	Name     string `gorm:"size:255;not null" json:"name"`
	Platform string `gorm:"size:100;not null;index" json:"platform"` // slug: google_forms, woocommerce, ...

	// Token acak 32 byte (hex 64 char) untuk auth endpoint inbox publik.
	// Tidak pernah diserialisasi ke JSON list — hanya penuh saat dibuat /
	// regenerate / diambil eksplisit oleh pemilik.
	Token string `gorm:"size:128;uniqueIndex;not null" json:"-"`

	DeviceID uint   `gorm:"index;not null" json:"deviceId"` // pengirim default (milik user)
	Template string `gorm:"type:text" json:"template"`      // template pesan, variabel {{path.ke.field}}
	IsActive bool   `gorm:"default:true" json:"isActive"`

	CreatedAt time.Time      `json:"createdAt"`
	UpdatedAt time.Time      `json:"updatedAt"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`

	Device Device `gorm:"foreignKey:DeviceID" json:"-"`
}

// IntegrationLog mencatat setiap event yang masuk ke inbox sebuah integrasi.
type IntegrationLog struct {
	ID            uint   `gorm:"primaryKey" json:"id"`
	IntegrationID uint   `gorm:"index;not null" json:"integrationId"`
	Status        string `gorm:"size:20;not null;index" json:"status"` // sent | failed
	To            string `gorm:"size:40" json:"to"`
	// PayloadJSON adalah ringkasan payload yang sudah disensor (tanpa data sensitif).
	PayloadJSON string `gorm:"type:text" json:"payloadSummary"`
	ErrorMsg    string `gorm:"size:500" json:"errorMsg,omitempty"`

	CreatedAt time.Time `json:"createdAt"`

	Integration Integration `gorm:"foreignKey:IntegrationID" json:"-"`
}

// TableName mempertahankan nama tabel eksplisit.
func (Integration) TableName() string    { return "integrations" }
func (IntegrationLog) TableName() string { return "integration_logs" }
