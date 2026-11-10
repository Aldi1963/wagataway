package models

import "time"

// File adalah file media yang diupload user lewat File Manager.
// Disimpan di disk dengan nama acak; bisa dipakai ulang saat kirim
// pesan (tipe image/document) tanpa upload ulang.
type File struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	UserID       uint      `gorm:"index;not null" json:"userId"`
	FileName     string    `gorm:"size:64;not null" json:"fileName"` // nama acak di disk (bukan nama asli user)
	OriginalName string    `gorm:"size:255;not null" json:"originalName"`
	Mime         string    `gorm:"size:100;not null" json:"mime"`
	Size         int64     `gorm:"not null" json:"size"`
	CreatedAt    time.Time `json:"createdAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
