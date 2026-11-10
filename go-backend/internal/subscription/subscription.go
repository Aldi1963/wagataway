// Package subscription — Fitur 5 (Grace Period 3 Hari).
//
// Satu-satunya tempat terpusat untuk menentukan status langganan user:
// active | grace | expired.
//
// Aturan:
//   - endDate belum lewat                  → active
//   - expired KURANG dari 3 hari           → grace  (boleh kirim, dibatasi
//                                            20 pesan/hari kalender)
//   - expired >= 3 hari                    → expired (blokir total)
//   - Trial yang expired mengikuti aturan yang sama.
//   - User yang TIDAK PERNAH punya langganan → active (diperlakukan sebagai
//     paket Free seperti sebelum fitur ini; tidak ada false positive blokir).
//
// Package quota memakai Check di sini sebagai bagian dari gate terpusatnya
// (quota.CheckN), sehingga semua jalur kirim (HTTP, WAMP, worker, backstop
// whatsapp.Manager) mendapat gate yang sama. Jalur sistem yang dikecualikan
// (balasan bot PPOB via SendMessageNoQuota, subscription reminder, admin
// broadcast — QuotaBypass=true) TIDAK tersentuh gate ini.
package subscription

import (
	"errors"
	"math"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"gorm.io/gorm"
)

// GracePeriod: masa tenggang setelah langganan berakhir.
const GracePeriod = 72 * time.Hour // 3 hari

// GraceDailyLimit: maksimal pesan per hari kalender selama masa tenggang.
const GraceDailyLimit = 20

// State adalah status langganan terpusat.
type State string

const (
	// StateActive: langganan masih berlaku (atau user tanpa langganan = Free).
	StateActive State = "active"
	// StateGrace: expired < 3 hari — boleh kirim, dibatasi 20 pesan/hari.
	StateGrace State = "grace"
	// StateExpired: expired >= 3 hari — blokir total seperti expired biasa.
	StateExpired State = "expired"
)

// Status adalah hasil pemeriksaan langganan satu user.
type Status struct {
	State           State     // active | grace | expired
	HasSubscription bool      // false bila user tidak pernah berlangganan
	EndDate         time.Time // akhir periode langganan terakhir (nol bila tidak ada)
	// DaysSinceExpiry: hari penuh sejak expired (0 bila belum expired).
	DaysSinceExpiry int
	// GraceDaysLeft: sisa hari tenggang (hanya bermakna saat State == grace).
	GraceDaysLeft int
	// GraceLimit: 20 (batas harian selama grace); GraceUsed: pemakaian hari ini.
	GraceLimit int
	GraceUsed  int64
	IsTrial    bool   // langganan terakhir adalah trial
	PlanName   string // nama paket langganan terakhir
}

// GraceRemaining mengembalikan sisa pesan yang boleh dikirim hari ini
// selama masa tenggang (0 bila sudah habis / bukan grace).
func (s *Status) GraceRemaining() int64 {
	if s == nil || s.State != StateGrace {
		return 0
	}
	rem := int64(s.GraceLimit) - s.GraceUsed
	if rem < 0 {
		rem = 0
	}
	return rem
}

// Check menentukan status langganan user dari langganan TERAKHIR-nya
// (berdasarkan end_date, status active/expired/cancelled).
func Check(db *gorm.DB, userID uint) (*Status, error) {
	var sub models.Subscription
	err := db.Where("user_id = ? AND status IN ?", userID, []string{"active", "expired", "cancelled"}).
		Preload("Plan").
		Order("end_date DESC").
		First(&sub).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		// Tidak pernah berlangganan: perlakukan sebagai active (paket Free),
		// konsisten dengan perilaku kuota sebelum fitur grace period.
		return &Status{State: StateActive, HasSubscription: false}, nil
	}
	if err != nil {
		return nil, err
	}

	st := &Status{
		State:           StateActive,
		HasSubscription: true,
		EndDate:         sub.EndDate,
		IsTrial:         sub.IsTrial,
		PlanName:        sub.Plan.Name,
		GraceLimit:      GraceDailyLimit,
	}

	now := time.Now()
	if now.Before(sub.EndDate) {
		return st, nil // belum expired
	}
	elapsed := now.Sub(sub.EndDate)
	st.DaysSinceExpiry = int(elapsed.Hours() / 24)
	if elapsed >= GracePeriod {
		st.State = StateExpired
		return st, nil
	}
	// Masa tenggang.
	st.State = StateGrace
	remaining := GracePeriod - elapsed
	st.GraceDaysLeft = int(math.Ceil(remaining.Hours() / 24))
	if st.GraceDaysLeft < 1 {
		st.GraceDaysLeft = 1
	}
	used, err := dailyUsage(db, userID)
	if err != nil {
		return nil, err
	}
	st.GraceUsed = used
	return st, nil
}

// dailyUsage menghitung pesan outgoing milik user pada hari kalender
// berjalan (waktu lokal server) berstatus sent/delivered/read.
// Definisi pesan yang dihitung SAMA dengan kuota bulanan (paket quota):
// pesan 'failed'/'pending' tidak dihitung.
func dailyUsage(db *gorm.DB, userID uint) (int64, error) {
	now := time.Now()
	startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var used int64
	err := db.Model(&models.Message{}).
		Where("user_id = ? AND direction = ? AND created_at >= ? AND status IN ?",
			userID, "outgoing", startOfDay, []string{"sent", "delivered", "read"}).
		Count(&used).Error
	return used, err
}
