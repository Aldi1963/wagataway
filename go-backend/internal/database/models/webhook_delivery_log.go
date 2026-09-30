package models

import "time"

// WebhookDeliveryLog mencatat setiap pengiriman webhook per-device.
// (Berbeda dari models.WebhookDelivery yang terikat ke tabel webhooks lama.)
type WebhookDeliveryLog struct {
	ID         uint      `gorm:"primaryKey" json:"id"`
	UserID     uint      `gorm:"index;not null" json:"userId"`
	DeviceID   uint      `gorm:"index" json:"deviceId"`
	URL        string    `gorm:"size:500;not null" json:"url"`
	Event      string    `gorm:"size:50;not null" json:"event"`
	Payload    string    `gorm:"type:text" json:"payload"`
	StatusCode int       `json:"statusCode"`
	Success    bool      `gorm:"index" json:"success"`
	ErrorMsg   string    `gorm:"type:text" json:"errorMsg"`
	RetryCount int       `gorm:"default:0" json:"retryCount"`
	CreatedAt  time.Time `json:"createdAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
