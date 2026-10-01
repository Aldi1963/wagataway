package models

import (
	"time"
)

type Plan struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	Name         string    `gorm:"size:100;not null" json:"name"`
	Slug         string    `gorm:"size:100;uniqueIndex;not null" json:"slug"`
	Description  string    `gorm:"type:text" json:"description"`
	Price        int64     `gorm:"not null" json:"price"`      // in smallest currency unit
	Duration     int       `gorm:"default:30" json:"duration"` // days
	MaxDevices   int       `gorm:"default:1" json:"maxDevices"`
	MaxMessages  int       `gorm:"default:1000" json:"maxMessages"` // per day
	// Kuota pesan bulanan (Fitur 3): jumlah pesan outgoing yang boleh dikirim
	// user dalam satu bulan kalender. 0 = unlimited.
	MonthlyMessageLimit int       `gorm:"default:0" json:"monthlyMessageLimit"`
	MaxContacts  int       `gorm:"default:500" json:"maxContacts"`
	MaxAutoReply int       `gorm:"default:5" json:"maxAutoReply"`
	MaxBulk      int       `gorm:"default:100" json:"maxBulk"` // recipients per bulk
	Features     string    `gorm:"type:text" json:"features"`  // JSON array
	IsActive     bool      `gorm:"default:true" json:"isActive"`
	SortOrder    int       `gorm:"default:0" json:"sortOrder"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type Subscription struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    uint      `gorm:"index;not null" json:"userId"`
	PlanID    uint      `gorm:"index;not null" json:"planId"`
	Status    string    `gorm:"size:20;default:active" json:"status"` // active, expired, cancelled
	StartDate time.Time `gorm:"not null" json:"startDate"`
	EndDate   time.Time `gorm:"not null" json:"endDate"`
	// Pengingat expired otomatis (Fitur 1): timestamp kapan reminder H-3 / H-1
	// dikirim via WA. NULL = belum dikirim untuk periode ini — dipakai sebagai
	// guard anti-duplikat oleh worker subscription reminder.
	RemindedH3At *time.Time `json:"remindedH3At,omitempty"`
	RemindedH1At *time.Time `json:"remindedH1At,omitempty"`
	// Trial (Fitur 3): true bila langganan ini adalah masa trial. Kuota pesan
	// memakai TrialMonthlyLimit (paket/quota), bukan limit paket acuan.
	IsTrial      bool      `gorm:"default:false" json:"isTrial"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
	Plan Plan `gorm:"foreignKey:PlanID" json:"Plan,omitempty"`
}

type Transaction struct {
	ID            uint       `gorm:"primaryKey" json:"id"`
	UserID        uint       `gorm:"index;not null" json:"userId"`
	PlanID        *uint      `gorm:"index" json:"planId"`
	Amount        int64      `gorm:"not null" json:"amount"`
	Status        string     `gorm:"size:20;default:pending" json:"status"` // pending, paid, failed, expired, refunded
	PaymentMethod string     `gorm:"size:50" json:"paymentMethod"`
	PaymentRef    string     `gorm:"size:255;index" json:"paymentRef"`
	ExternalID    string     `gorm:"size:255;index" json:"externalId"`
	ExpiredAt     *time.Time `json:"expiredAt"`
	PaidAt        *time.Time `json:"paidAt"`
	Metadata      string     `gorm:"type:text" json:"metadata"` // JSON
	CreatedAt     time.Time  `json:"createdAt"`
	UpdatedAt     time.Time  `json:"updatedAt"`

	// InvoiceNumber dihitung deterministik dari ID transaksi (TIDAK disimpan di
	// DB, tanpa perubahan skema): format INV/<tahun>/<bulan romawi>/<id 6 digit>,
	// mis. INV/2026/X/000123. Tahun & bulan diambil dari CreatedAt sehingga
	// stabil dan tidak berubah antar request. Diisi oleh handler billing.
	InvoiceNumber string `gorm:"-" json:"invoiceNumber"`

	User User  `gorm:"foreignKey:UserID" json:"-"`
	Plan *Plan `gorm:"foreignKey:PlanID" json:"Plan,omitempty"`
}

type Voucher struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	Code      string     `gorm:"size:50;uniqueIndex;not null" json:"code"`
	Type      string     `gorm:"size:20;not null" json:"type"` // trial, discount, plan
	PlanID    *uint      `json:"planId"`
	Duration  int        `gorm:"default:7" json:"duration"` // days
	Discount  int        `gorm:"default:0" json:"discount"` // percentage
	MaxUses   int        `gorm:"default:1" json:"maxUses"`
	UsedCount int        `gorm:"default:0" json:"usedCount"`
	IsActive  bool       `gorm:"default:true" json:"isActive"`
	ExpiresAt *time.Time `json:"expiresAt"`
	CreatedAt time.Time  `json:"createdAt"`
	UpdatedAt time.Time  `json:"updatedAt"`
}

// VoucherRedemption mencatat siapa saja yang sudah memakai sebuah voucher,
// sehingga satu user tidak bisa redeem voucher yang sama berulang kali.
type VoucherRedemption struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	VoucherID uint      `gorm:"uniqueIndex:idx_voucher_user,not null" json:"voucherId"`
	UserID    uint      `gorm:"uniqueIndex:idx_voucher_user,not null" json:"userId"`
	CreatedAt time.Time `json:"createdAt"`

	Voucher Voucher `gorm:"foreignKey:VoucherID" json:"-"`
	User    User    `gorm:"foreignKey:UserID" json:"-"`
}

type WalletTransaction struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UserID      uint      `gorm:"index;not null" json:"userId"`
	Amount      int64     `gorm:"not null" json:"amount"`       // positive = credit, negative = debit
	Balance     int64     `gorm:"not null" json:"balance"`      // balance after transaction
	Type        string    `gorm:"size:30;not null" json:"type"` // topup, usage, refund, bonus
	Description string    `gorm:"size:500" json:"description"`
	RefID       string    `gorm:"size:255" json:"refId"`
	CreatedAt   time.Time `json:"createdAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}

type PaymentWebhookLog struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	Provider  string    `gorm:"size:50;not null" json:"provider"`
	EventType string    `gorm:"size:100" json:"eventType"`
	Payload   string    `gorm:"type:text" json:"payload"` // raw JSON
	Status    string    `gorm:"size:20;default:received" json:"status"`
	CreatedAt time.Time `json:"createdAt"`
}
