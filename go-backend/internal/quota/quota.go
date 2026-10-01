// Package quota — Fitur 3 (Kuota Pesan per Paket).
//
// Satu-satunya tempat terpusat untuk mengecek kuota pesan bulanan user.
// Semua jalur kirim (web, API, WAMP, bulk, integrations inbox, livechat,
// automation, worker) WAJIB memakai Check/CheckN di package ini.
//
// Definisi "pesan yang dihitung":
//   - baris di tabel messages dengan direction = 'outgoing'
//   - created_at >= tanggal 1 bulan kalender berjalan 00:00 (waktu lokal server)
//   - status IN ('sent', 'delivered', 'read') — pesan 'failed'/'pending'
//     TIDAK dihitung (gagal kirim tidak menghabiskan kuota)
//
// Catatan: automation yang tidak mencatat baris ke tabel messages
// (mis. balasan menu-bot, AI reply, welcome DM — dikirim langsung via
// whatsapp.Manager) tidak menambah angka pemakaian, tetapi tetap DIBLOKIR
// saat kuota habis lewat pemeriksaan di Manager.SendMessageWithOptions.
//
// Keputusan desain (didokumentasikan eksplisit):
//   - IKUT KUOTA (dihitung + diblokir saat habis): kirim yang dipicu user/API
//     — /api/messages/send, bulk (per pesan), message_extra (poll/interaktif/
//     stiker/voicenote/lokasi), /send-message & /send-media (WAMP/PPOB),
//     integrations inbox, livechat (manual & AI), jadwal/drip/recurring/
//     followup, menu-bot, auto-reply, AI reply, welcome DM, group rules.
//   - DIKECUALIKAN DARI BLOKIR (tetap jalan walau kuota habis):
//     a) Balasan bot PPOB (webhook /whatsapp/bot -> JSON {"text"}): JANGAN
//        sampai bot PPOB user mati karena kuota. Tidak dicatat ke messages,
//        jadi juga tidak dihitung.
//     b) Subscription reminder (worker): pesan sistem tentang langganan itu
//        sendiri; tidak menghabiskan & tidak diblokir kuota user.
//     c) Admin broadcast WA: pengumuman sistem oleh admin.
//   - Trial (subscription.is_trial = true, dari fitur trial): limit khusus
//     TrialMonthlyLimit (disamakan dengan paket Lite).
//   - User tanpa langganan aktif: diperlakukan sebagai paket Free.
package quota

import (
	"errors"
	"fmt"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"gorm.io/gorm"
)

// Batas pemakaian wajar per bulan (default untuk paket bawaan).
// Master = 0 (unlimited). Nilai ini juga dipakai sebagai backfill untuk
// paket yang sudah ada di DB saat kolom monthly_message_limit ditambahkan.
var DefaultMonthlyLimits = map[string]int{
	"free":     3000,
	"lite":     15000,
	"regular":  100000,
	"pro":      300000,
	"master":   0, // unlimited
}

// TrialMonthlyLimit: kuota trial disamakan dengan paket Lite.
const TrialMonthlyLimit = 15000

// FallbackFreeLimit dipakai bila paket 'free' tidak ditemukan di DB.
const FallbackFreeLimit = 3000

// WarnThreshold: tampilkan peringatan saat pemakaian >= 80%.
const WarnThreshold = 0.8

// ErrExceeded adalah sentinel untuk pemblokiran kuota.
var ErrExceeded = errors.New("message quota exceeded")

// ExceededError membawa pesan user-facing + info kuota agar caller
// (HTTP handler / worker) bisa merespons dengan tepat.
type ExceededError struct {
	Info *Result
}

func (e *ExceededError) Error() string { return ExceededMessage(e.Info) }
func (e *ExceededError) Unwrap() error { return ErrExceeded }

// IsExceeded melaporkan apakah err disebabkan kuota habis.
func IsExceeded(err error) bool { return errors.Is(err, ErrExceeded) }

// Result adalah hasil pemeriksaan kuota satu user.
type Result struct {
	Allowed   bool   // false bila kuota habis
	Used      int64  // pesan terhitung bulan berjalan
	Limit     int    // 0 = unlimited
	PlanName  string // nama paket efektif
	IsTrial   bool   // langganan trial
	Unlimited bool   // Limit == 0
	Warning   bool   // pemakaian >= 80% (dan bukan unlimited)
}

// Percent mengembalikan 0-100 (0 bila unlimited).
func (r *Result) Percent() int {
	if r == nil || r.Unlimited || r.Limit <= 0 {
		return 0
	}
	p := float64(r.Used) / float64(r.Limit) * 100
	if p > 100 {
		p = 100
	}
	return int(p)
}

// Remaining mengembalikan sisa kuota (-1 bila unlimited).
func (r *Result) Remaining() int64 {
	if r == nil || r.Unlimited {
		return -1
	}
	rem := int64(r.Limit) - r.Used
	if rem < 0 {
		rem = 0
	}
	return rem
}

// ExceededMessage: pesan penolakan standar saat kuota habis.
func ExceededMessage(r *Result) string {
	if r == nil {
		return "Kuota pesan habis. Perpanjang/upgrade paket untuk menambah kuota."
	}
	return fmt.Sprintf("Kuota pesan paket %s habis (%d/%d). Perpanjang/upgrade paket untuk menambah kuota.",
		r.PlanName, r.Used, r.Limit)
}

// Check memeriksa apakah user masih boleh mengirim 1 pesan.
func Check(db *gorm.DB, userID uint) (*Result, error) {
	return CheckN(db, userID, 1)
}

// CheckN memeriksa apakah user masih boleh mengirim n pesan
// (dipakai bulk: hitung per pesan di muka).
func CheckN(db *gorm.DB, userID uint, n int64) (*Result, error) {
	limit, planName, isTrial, err := effectiveLimit(db, userID)
	if err != nil {
		return nil, err
	}
	used, err := monthlyUsage(db, userID)
	if err != nil {
		return nil, err
	}
	r := &Result{
		Used:      used,
		Limit:     limit,
		PlanName:  planName,
		IsTrial:   isTrial,
		Unlimited: limit == 0,
	}
	if r.Unlimited {
		r.Allowed = true
		return r, nil
	}
	r.Allowed = used+n <= int64(limit)
	r.Warning = float64(used)/float64(limit) >= WarnThreshold
	return r, nil
}

// Usage menghitung pemakaian bulan berjalan (tanpa memeriksa limit).
func Usage(db *gorm.DB, userID uint) (used int64, err error) {
	return monthlyUsage(db, userID)
}

// effectiveLimit menentukan limit & nama paket efektif untuk user:
// langganan aktif (trial -> TrialMonthlyLimit) > paket free > fallback.
func effectiveLimit(db *gorm.DB, userID uint) (limit int, planName string, isTrial bool, err error) {
	var sub models.Subscription
	if err := db.Where("user_id = ? AND status = ?", userID, "active").
		Preload("Plan").First(&sub).Error; err == nil {
		planName = sub.Plan.Name
		if sub.IsTrial {
			return TrialMonthlyLimit, planName, true, nil
		}
		return sub.Plan.MonthlyMessageLimit, planName, false, nil
	} else if !errors.Is(err, gorm.ErrRecordNotFound) {
		return 0, "", false, err
	}

	var free models.Plan
	if err := db.Where("slug = ?", "free").First(&free).Error; err == nil {
		return free.MonthlyMessageLimit, free.Name, false, nil
	}
	return FallbackFreeLimit, "Free", false, nil
}

// monthlyUsage menghitung pesan outgoing milik user di bulan kalender
// berjalan dengan status sent/delivered/read. failed & pending tidak dihitung.
func monthlyUsage(db *gorm.DB, userID uint) (int64, error) {
	now := time.Now()
	startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
	var used int64
	err := db.Model(&models.Message{}).
		Where("user_id = ? AND direction = ? AND created_at >= ? AND status IN ?",
			userID, "outgoing", startOfMonth, []string{"sent", "delivered", "read"}).
		Count(&used).Error
	return used, err
}

// BackfillDefaults mengisi monthly_message_limit untuk paket bawaan yang
// masih 0 (kolom baru dari AutoMigrate) — KECUALI master yang memang 0
// (unlimited). Tidak menimpa nilai yang sudah diisi (kustom admin aman).
func BackfillDefaults(db *gorm.DB) error {
	for slug, limit := range DefaultMonthlyLimits {
		if limit == 0 {
			continue // master: 0 = unlimited, biarkan
		}
		if err := db.Model(&models.Plan{}).
			Where("slug = ? AND monthly_message_limit = 0", slug).
			Update("monthly_message_limit", limit).Error; err != nil {
			return err
		}
	}
	return nil
}
