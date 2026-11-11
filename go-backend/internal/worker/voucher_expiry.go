// Peringatan stok & penonaktifan otomatis voucher kedaluwarsa (Item 8).
//
// Voucher punya ExpiresAt (nil = tanpa batas waktu) dan kuota pemakaian
// (UsedCount/MaxUses). Dua pengaman, mengikuti pola subscription_activation:
//  1. Job per jam (scheduler, menit ke-30) menonaktifkan voucher aktif yang
//     sudah lewat ExpiresAt — satu UPDATE idempoten, tanpa baca-tulis per baris.
//  2. Lazy-expiry: adminListVouchers memanggil DeactivateExpiredVouchers
//     sebelum membaca daftar, jadi daftar admin selalu segar walau scheduler
//     sempat tertinggal (server mati / job terlewat). Redeem sendiri sudah
//     menolak voucher kedaluwarsa dengan 410 walau IsActive masih true,
//     jadi jalur penukaran tidak bergantung pada job ini.
//
// Peringatan pemakaian (UsedCount/MaxUses >= 90%) tidak butuh kolom baru:
// dihitung di tempat pemakaian — helper di bawah dipakai test + dokumentasi
// ambang, sementara badge & ringkasan dirender di tab Voucher admin dari
// data daftar yang sama.
package worker

import (
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// voucherUsageAlertThreshold: pemakaian >= 90% dari MaxUses dianggap hampir habis.
const voucherUsageAlertThreshold = 0.9

// VoucherUsageRatio mengembalikan porsi kuota voucher yang sudah terpakai
// (0 bila MaxUses <= 0, yaitu voucher tanpa batas kuota).
func VoucherUsageRatio(v models.Voucher) float64 {
	if v.MaxUses <= 0 {
		return 0
	}
	return float64(v.UsedCount) / float64(v.MaxUses)
}

// IsVoucherNearlyExhausted: pemakaian sudah >= 90% tapi kuota belum habis.
func IsVoucherNearlyExhausted(v models.Voucher) bool {
	r := VoucherUsageRatio(v)
	return r >= voucherUsageAlertThreshold && r < 1
}

// IsVoucherExhausted: seluruh kuota sudah terpakai (redeem menolak 409).
func IsVoucherExhausted(v models.Voucher) bool {
	return VoucherUsageRatio(v) >= 1
}

// IsVoucherExpired: ExpiresAt sudah lewat ATAU jendela berlaku sudah
// berakhir (EndsAt lewat). Nil di kedua sisi = tanpa batas waktu.
func IsVoucherExpired(v models.Voucher, now time.Time) bool {
	if v.ExpiresAt != nil && !v.ExpiresAt.After(now) {
		return true
	}
	return v.EndsAt != nil && !v.EndsAt.After(now)
}

// deactivateExpiredVouchers menonaktifkan voucher aktif yang ExpiresAt-nya
// sudah lewat ATAU jendela berlakunya (EndsAt) sudah berakhir.
// Mengembalikan jumlah baris yang dinonaktifkan. Idempoten:
// pemanggilan ulang tanpa voucher kedaluwarsa baru mengembalikan 0.
func deactivateExpiredVouchers(db *gorm.DB, now time.Time) (int64, error) {
	res := db.Model(&models.Voucher{}).
		Where("is_active = ? AND ((expires_at IS NOT NULL AND expires_at <= ?) OR (ends_at IS NOT NULL AND ends_at <= ?))", true, now, now).
		Update("is_active", false)
	if res.Error != nil {
		return 0, res.Error
	}
	return res.RowsAffected, nil
}

// DeactivateExpiredVouchers adalah wrapper ekspor dari
// deactivateExpiredVouchers untuk lazy-expiry dari handler admin
// (dipanggil sebelum daftar voucher dibaca).
func DeactivateExpiredVouchers(db *gorm.DB, now time.Time) (int64, error) {
	return deactivateExpiredVouchers(db, now)
}

// processExpiredVouchers adalah job cron per jam yang menonaktifkan
// voucher kedaluwarsa.
func (s *Scheduler) processExpiredVouchers() {
	n, err := deactivateExpiredVouchers(s.db, time.Now())
	if err != nil {
		log.Error().Err(err).Msg("Penonaktifan voucher kedaluwarsa gagal")
		return
	}
	if n > 0 {
		log.Info().Int64("count", n).Msg("Voucher kedaluwarsa dinonaktifkan")
	}
}
