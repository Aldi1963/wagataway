package models

import "time"

// ── Cadangan percakapan (Item 11) ────────────────────────────────────────────
// ChatBackup mencatat satu file cadangan percakapan (JSON) yang dibuat job
// harian otomatis atau pemicu manual. File-nya sendiri tinggal di disk
// server (data/chat-backups/<userID>/<deviceID>/), baris ini hanya metadata
// + penanda kepemilikan agar unduh selalu dicek terhadap user yang login.
// Cakupan satu backup: SEMUA percakapan + pesan milik satu user di satu
// device (ChatConversation + ChatInbox). Retensi 30 hari — job harian
// menghapus file + baris yang lebih tua.
type ChatBackup struct {
	ID                uint      `gorm:"primaryKey" json:"id"`
	UserID            uint      `gorm:"index;not null" json:"userId"`
	DeviceID          uint      `gorm:"index;not null" json:"deviceId"`
	FileName          string    `gorm:"size:255;not null" json:"fileName"`
	FilePath          string    `gorm:"size:500;not null" json:"-"` // path relatif terhadap CWD server
	Format            string    `gorm:"size:10;default:json" json:"format"`
	ConversationCount int       `json:"conversationCount"`
	MessageCount      int       `json:"messageCount"`
	SizeBytes         int64     `json:"sizeBytes"`
	Status            string    `gorm:"size:20;default:ready" json:"status"` // ready, failed
	ErrorMsg          string    `gorm:"size:500" json:"errorMsg,omitempty"`
	CreatedAt         time.Time `json:"createdAt"`

	User   User   `gorm:"foreignKey:UserID" json:"-"`
	Device Device `gorm:"foreignKey:DeviceID" json:"-"`
}
