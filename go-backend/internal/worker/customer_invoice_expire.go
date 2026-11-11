// Kedaluwarsa otomatis tagihan pelanggan (Item 3).
//
// Tagihan pelanggan yang jatuh temponya sudah lewat ditandai 'expired' oleh
// job per jam ini. Handler list/detail juga melakukan lazy-expiry yang sama
// saat dibaca, jadi job ini hanya merapikan status di DB (tampilan & filter
// tetap benar walau scheduler sempat tertinggal).
package worker

import (
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// expireOverdueCustomerInvoices menandai invoice pending yang jatuh temponya
// sudah lewat menjadi expired. Idempoten; mengembalikan jumlah baris berubah.
func expireOverdueCustomerInvoices(db *gorm.DB, now time.Time) (int64, error) {
	res := db.Model(&models.CustomerInvoice{}).
		Where("status = ? AND due_date IS NOT NULL AND due_date < ?", "pending", now).
		Update("status", "expired")
	if res.Error != nil {
		return 0, res.Error
	}
	return res.RowsAffected, nil
}

func (s *Scheduler) processExpiredCustomerInvoices() {
	n, err := expireOverdueCustomerInvoices(s.db, time.Now())
	if err != nil {
		log.Error().Err(err).Msg("Expire tagihan pelanggan gagal")
		return
	}
	if n > 0 {
		log.Info().Int64("expired", n).Msg("Tagihan pelanggan kedaluwarsa otomatis")
	}
}
