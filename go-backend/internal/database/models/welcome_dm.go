package models

import "time"

// WelcomeDMSent mencatat DM sambutan yang sudah dikirim ke anggota grup,
// untuk mencegah duplikat bila anggota yang sama keluar-masuk grup.
// Kebijakan: tidak kirim ulang ke (groupJID, phone) yang sama dalam 24 jam.
type WelcomeDMSent struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"userId"`
	DeviceID  uint      `gorm:"index;not null" json:"deviceId"`
	GroupJID  string    `gorm:"size:64;index;not null" json:"groupJid"`
	Phone     string    `gorm:"size:32;index;not null" json:"phone"`
	CreatedAt time.Time `json:"createdAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
