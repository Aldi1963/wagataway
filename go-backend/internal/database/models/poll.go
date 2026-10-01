package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

// Poll adalah metadata polling yang dikirim lewat API (Fitur 6: Rekap Polling Otomatis).
// WA message ID (poll ID) diisi setelah pesan benar-benar terkirim ke WhatsApp.
type Poll struct {
	ID            uint           `gorm:"primaryKey" json:"id"`
	UserID        uint           `gorm:"index;not null" json:"userId"`
	DeviceID      uint           `gorm:"index;not null" json:"deviceId"`
	MessageID     string         `gorm:"size:64;uniqueIndex" json:"messageId"` // WA message ID poll (poll ID)
	Question      string         `gorm:"type:text;not null" json:"question"`
	OptionsJSON   string         `gorm:"type:text;not null" json:"-"` // JSON []string
	To            string         `gorm:"size:100" json:"to"`          // tujuan poll (nomor / JID grup)
	IsGroup       bool           `gorm:"default:false" json:"isGroup"`
	AllowMultiple bool           `gorm:"default:false" json:"allowMultiple"`
	IsClosed      bool           `gorm:"default:false" json:"isClosed"` // rekap manual: poll ditutup user
	SentAt        *time.Time     `json:"sentAt"`
	CreatedAt     time.Time      `json:"createdAt"`
	UpdatedAt     time.Time      `json:"updatedAt"`
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`

	Votes []PollVote `gorm:"foreignKey:PollID" json:"-"`

	User   User   `gorm:"foreignKey:UserID" json:"-"`
	Device Device `gorm:"foreignKey:DeviceID" json:"-"`
}

// SetOptions menyimpan daftar opsi sebagai JSON.
func (p *Poll) SetOptions(options []string) {
	b, _ := json.Marshal(options)
	p.OptionsJSON = string(b)
}

// Options mengembalikan daftar opsi poll.
func (p *Poll) Options() []string {
	var out []string
	if err := json.Unmarshal([]byte(p.OptionsJSON), &out); err != nil {
		return nil
	}
	return out
}

// PollVote adalah satu pilihan suara dari satu pemilih pada satu opsi.
// Satu pemilih bisa punya beberapa baris bila poll mengizinkan banyak pilihan;
// vote terbaru menimpa vote lama pemilih yang sama (semantik update WhatsApp).
type PollVote struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	PollID      uint      `gorm:"index;not null;uniqueIndex:idx_poll_voter_option,priority:1" json:"pollId"`
	VoterPhone  string    `gorm:"size:32;index;not null;uniqueIndex:idx_poll_voter_option,priority:2" json:"voterPhone"`
	OptionIndex int       `gorm:"not null;uniqueIndex:idx_poll_voter_option,priority:3" json:"optionIndex"`
	VoterJID    string    `gorm:"size:128" json:"voterJid"`
	VotedAt     time.Time `json:"votedAt"`

	Poll Poll `gorm:"foreignKey:PollID" json:"-"`
}
