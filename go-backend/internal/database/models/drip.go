package models

import (
	"time"

	"gorm.io/gorm"
)

// Jenis pemicu drip campaign.
//   - manual, keyword, webhook: jenis lama (jadwal/manual) — dipertahankan.
//   - new_contact: pesan pertama dari kontak yang belum pernah chat.
//   - order_created: order (BotOrder) baru dibuat.
//   - order_paid: order berubah status menjadi lunas/dikonfirmasi.
//   - tag_added: label/tag ditempel ke kontak (TriggerVal = nama label, kosong = semua label).
//   - days_since_purchase: X hari sejak pembelian terakhir (TriggerVal = jumlah hari,
//     dievaluasi berkala oleh worker, bukan event instan).
//   - event: event generik (TriggerVal = nama event) yang bisa dipicu dari kode
//     lain via drip.FireEvent atau POST /api/drip/events.
type DripCampaign struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	UserID      uint   `gorm:"index;not null" json:"userId"`
	DeviceID    uint   `gorm:"index;not null" json:"deviceId"`
	Name        string `gorm:"size:255;not null" json:"name"`
	Description string `gorm:"type:text" json:"description"`
	TriggerType string `gorm:"size:30;not null" json:"triggerType"` // keyword, manual, webhook, new_contact, order_created, order_paid, tag_added, days_since_purchase, event
	TriggerVal  string `gorm:"size:255" json:"triggerVal"`
	IsActive    bool   `gorm:"default:true" json:"isActive"`
	Enrolled    int    `gorm:"default:0" json:"enrolled"`
	// CancelOnReply: hentikan sequence bila kontak membalas (default true
	// untuk campaign baru; STOP selalu menghentikan apa pun nilainya).
	CancelOnReply bool `gorm:"default:true" json:"cancelOnReply"`
	// OptOutKeyword: kata yang bila dibalas kontak akan menghentikan
	// sequence-nya (default "STOP", perbandingan case-insensitive).
	OptOutKeyword string `gorm:"size:20;default:STOP" json:"optOutKeyword"`
	CreatedAt     time.Time
	UpdatedAt     time.Time
	DeletedAt     gorm.DeletedAt `gorm:"index" json:"-"`

	User   User       `gorm:"foreignKey:UserID" json:"-"`
	Device Device     `gorm:"foreignKey:DeviceID" json:"-"`
	Steps  []DripStep `gorm:"foreignKey:CampaignID" json:"steps,omitempty"`
}

type DripStep struct {
	ID         uint `gorm:"primaryKey" json:"id"`
	CampaignID uint `gorm:"index;not null" json:"campaignId"`
	StepOrder  int  `gorm:"not null" json:"stepOrder"`
	DelayHours int  `gorm:"default:24" json:"delayHours"`
	// DelayMinutes: jeda efektif dalam menit. Bila > 0 dipakai sebagai pengganti
	// DelayHours (mendukung jeda menit/hari lewat UI); bila 0, pakai DelayHours.
	DelayMinutes int    `gorm:"default:0" json:"delayMinutes"`
	Type         string `gorm:"size:20;default:text" json:"type"`
	Content      string `gorm:"type:text;not null" json:"content"`
	MediaURL     string `gorm:"size:500" json:"mediaUrl"`
	// SkipIfReplied: kirim langkah ini hanya bila kontak BELUM membalas sejak
	// langkah sebelumnya terkirim. Bila sudah membalas, langkah dilewati
	// (sequence lanjut ke langkah berikutnya).
	SkipIfReplied bool `gorm:"default:false" json:"skipIfReplied"`
	// RequireOrderStatus: kirim langkah ini hanya bila order terakhir kontak
	// berstatus ini (mis. "pending", "paid"). Kosong = tanpa syarat.
	RequireOrderStatus string    `gorm:"size:20;default:" json:"requireOrderStatus"`
	CreatedAt          time.Time `json:"createdAt"`
	UpdatedAt          time.Time `json:"updatedAt"`

	Campaign DripCampaign `gorm:"foreignKey:CampaignID" json:"-"`
}

type DripEnrollment struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	CampaignID  uint       `gorm:"index;not null" json:"campaignId"`
	Phone       string     `gorm:"size:20;not null;index" json:"phone"`
	CurrentStep int        `gorm:"default:0" json:"currentStep"`
	Status      string     `gorm:"size:20;default:active" json:"status"` // active, paused, completed, cancelled
	NextSendAt  *time.Time `gorm:"index" json:"nextSendAt"`
	EnrolledAt  time.Time  `json:"enrolledAt"`
	// LastSentAt: waktu langkah terakhir berhasil terkirim (dipakai kondisi
	// SkipIfReplied — balasan setelah waktu ini berarti kontak sudah merespons).
	LastSentAt *time.Time `json:"lastSentAt"`
	// LastReplyAt: waktu balasan terakhir kontak sejak enroll.
	LastReplyAt *time.Time `json:"lastReplyAt"`
	// TriggerEvent / TriggerRef: pemicu yang mendaftarkan kontak ini
	// (mis. "order_paid" + "order:123"). Dipakai dedupe: satu order hanya
	// mendaftarkan kontak sekali per campaign.
	TriggerEvent string `gorm:"size:30" json:"triggerEvent"`
	TriggerRef   string `gorm:"size:64;index" json:"triggerRef"`
	// ProcessingAt: klaim worker — diisi saat satu worker mulai memproses
	// enrollment ini; klaim basi (>10 menit) boleh diambil alih worker lain.
	ProcessingAt *time.Time `gorm:"index" json:"-"`
	// CancelReason: alasan pembatalan (mis. "stop_keyword", "replied", "manual").
	CancelReason string    `gorm:"size:255" json:"cancelReason,omitempty"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`

	Campaign DripCampaign `gorm:"foreignKey:CampaignID" json:"-"`
}
