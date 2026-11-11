package models

import (
	"time"

	"gorm.io/gorm"
)

// ── Google Sheets + webhook dua arah (Item 8) ────────────────────────────────
// Fondasi yang sudah ada (audit sebelum membangun):
//   - Outbound: models.Webhook (URL + secret + events JSON + filter device)
//     dikirim async oleh whatsapp.Manager.fireWebhooks dengan HMAC-SHA256
//     (X-Wagataway-Signature) + log di webhook_deliveries; event yang sudah
//     dipicu: message.received / message.sent / message.failed.
//   - Inbound: Integration Hub (models.Integration, token acak di URL,
//     template {{path.ke.field}} -> kirim pesan WA).
//   - Kredensial: AIConnection.APIKeyEnc (AES-256-GCM via security.Encrypt,
//     tidak pernah diserialisasi; hanya KeyHint 4 karakter terakhir).
// Yang dibangun di sini mengikuti pola yang sama: service-account Google
// disimpan terenkripsi (AES-GCM), secret webhook masuk disimpan terenkripsi
// dan hanya ditampilkan penuh sekali saat dibuat/diregenerasi.

// SheetsConnection adalah konektor Google Sheets milik user: satu koneksi
// aktif per user (spreadsheet + service account). Tanpa ini, semua operasi
// Sheets gagal fail-closed dengan SHEETS_NOT_CONFIGURED — kredensial tidak
// pernah di-hardcode dan tidak pernah dikirim ke frontend.
type SheetsConnection struct {
	ID            uint   `gorm:"primaryKey" json:"id"`
	UserID        uint   `gorm:"uniqueIndex;not null" json:"userId"`
	SpreadsheetID string `gorm:"size:255;not null" json:"spreadsheetId"`
	// ServiceAccountEnc adalah JSON service account utuh (client_email +
	// private_key) terenkripsi AES-256-GCM; json:"-" agar tidak bocor ke API.
	ServiceAccountEnc string `gorm:"type:text;not null" json:"-"`
	// ServiceAccountEmail adalah client_email service account — hint untuk
	// ditampilkan di UI (dipakai juga sebagai petunjuk akun mana yang harus
	// diberi akses Editor ke spreadsheet).
	ServiceAccountEmail string    `gorm:"size:255" json:"serviceAccountEmail"`
	IsActive            bool      `gorm:"default:true" json:"isActive"`
	CreatedAt           time.Time `json:"createdAt"`
	UpdatedAt           time.Time `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// SheetsSync mencatat satu kali sinkronisasi Sheets (ekspor/impor) beserta
// hasilnya — riwayat yang ditampilkan di UI admin.
type SheetsSync struct {
	ID            uint      `gorm:"primaryKey" json:"id"`
	UserID        uint      `gorm:"index;not null" json:"userId"`
	Kind          string    `gorm:"size:20;not null;index" json:"kind"` // contacts | orders
	Direction     string    `gorm:"size:20;not null" json:"direction"`  // export | import
	SpreadsheetID string    `gorm:"size:255" json:"spreadsheetId"`
	SheetName     string    `gorm:"size:100" json:"sheetName"`
	Status        string    `gorm:"size:20;default:pending;index" json:"status"` // pending | running | success | failed
	RowsTotal     int       `json:"rowsTotal"`
	RowsOK        int       `json:"rowsOk"`
	RowsFailed    int       `json:"rowsFailed"`
	ErrorMsg      string    `gorm:"type:text" json:"errorMsg,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

// InboundWebhook adalah endpoint webhook MASUK milik user: platform luar
// POST ke /api/inbound-webhooks/:id/hook dengan HMAC-SHA256
// (X-Wagataway-Signature, format "sha256=<hex>") atau header
// X-Webhook-Secret, lalu payload dipetakan ke aksi kirim pesan WA
// (field "to" + "message", atau template bila "message" kosong).
// Secret disimpan terenkripsi (AES-GCM) seperti API key AI; hanya hint
// 4 karakter terakhir yang tampil di daftar.
type InboundWebhook struct {
	ID         uint           `gorm:"primaryKey" json:"id"`
	UserID     uint           `gorm:"index;not null" json:"userId"`
	Name       string         `gorm:"size:255;not null" json:"name"`
	SecretEnc  string         `gorm:"type:text;not null" json:"-"`
	SecretHint string         `gorm:"size:12" json:"secretHint"`
	DeviceID   uint           `gorm:"index;not null" json:"deviceId"` // pengirim default (milik user)
	Template   string         `gorm:"type:text" json:"template"`      // template pesan, variabel {{path.ke.field}}
	IsActive   bool           `gorm:"default:true" json:"isActive"`
	CreatedAt  time.Time      `json:"createdAt"`
	UpdatedAt  time.Time      `json:"updatedAt"`
	DeletedAt  gorm.DeletedAt `gorm:"index" json:"-"`

	Device Device `gorm:"foreignKey:DeviceID" json:"-"`
}

// InboundWebhookLog mencatat setiap event yang masuk ke sebuah inbound webhook.
type InboundWebhookLog struct {
	ID               uint      `gorm:"primaryKey" json:"id"`
	InboundWebhookID uint      `gorm:"index;not null" json:"inboundWebhookId"`
	Status           string    `gorm:"size:20;not null;index" json:"status"` // sent | failed
	To               string    `gorm:"size:40" json:"to"`
	PayloadSummary   string    `gorm:"type:text" json:"payloadSummary"`
	ErrorMsg         string    `gorm:"size:500" json:"errorMsg,omitempty"`
	CreatedAt        time.Time `json:"createdAt"`

	InboundWebhook InboundWebhook `gorm:"foreignKey:InboundWebhookID" json:"-"`
}

func (SheetsConnection) TableName() string  { return "sheets_connections" }
func (SheetsSync) TableName() string        { return "sheets_syncs" }
func (InboundWebhook) TableName() string    { return "inbound_webhooks" }
func (InboundWebhookLog) TableName() string { return "inbound_webhook_logs" }
