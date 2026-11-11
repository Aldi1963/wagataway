package models

import "time"

// ChatInternalNote adalah catatan internal tim pada sebuah percakapan.
// TIDAK PERNAH dikirim ke pelanggan — hanya terlihat di panel Live Chat tim.
type ChatInternalNote struct {
	ID       uint   `gorm:"primaryKey" json:"id"`
	UserID   uint   `gorm:"index;not null" json:"userId"`
	DeviceID uint   `gorm:"index;not null" json:"deviceId"`
	Phone    string `gorm:"size:20;index;not null" json:"phone"`
	// AuthorMemberID nil = ditulis pemilik akun; selain itu anggota tim.
	AuthorMemberID *uint     `gorm:"index" json:"authorMemberId,omitempty"`
	AuthorName     string    `gorm:"size:255;not null" json:"authorName"`
	Content        string    `gorm:"type:text;not null" json:"content"`
	CreatedAt      time.Time `json:"createdAt"`
	UpdatedAt      time.Time `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// ChatActivity adalah jejak audit ringan per percakapan: assign/unassign/
// reassign, perubahan status, tambah label, tambah catatan. Dipakai untuk
// notifikasi ringan ("percakapan ini baru di-assign ke X") di panel tim.
type ChatActivity struct {
	ID       uint   `gorm:"primaryKey" json:"id"`
	UserID   uint   `gorm:"index;not null" json:"userId"`
	DeviceID uint   `gorm:"index;not null" json:"deviceId"`
	Phone    string `gorm:"size:20;index;not null" json:"phone"`
	// ActorMemberID nil = aksi oleh pemilik akun.
	ActorMemberID *uint  `gorm:"index" json:"actorMemberId,omitempty"`
	ActorName     string `gorm:"size:255;not null" json:"actorName"`
	// Action: assigned, unassigned, reassigned, status_changed,
	// note_added, label_added, label_removed.
	Action    string    `gorm:"size:30;not null;index" json:"action"`
	Detail    string    `gorm:"size:500" json:"detail,omitempty"`
	CreatedAt time.Time `json:"createdAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
