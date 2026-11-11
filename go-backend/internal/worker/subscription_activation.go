// Aktivasi langganan voucher yang mengantre (status 'scheduled').
//
// Voucher yang ditukar saat user masih punya langganan aktif TIDAK langsung
// menggantikannya: langganan baru dibuat berstatus 'scheduled' dengan
// jendela di masa depan (lihat grantVoucherSubscription). Job ini, yang
// berjalan tiap menit dari scheduler, membalik baris yang jendelanya sudah
// mulai menjadi 'active' dan menyinkronkan users.plan ke paket yang
// berlaku — tepat waktu, tanpa menunggu ada request dari user.
//
// Pengaman bila scheduler tertinggal (server mati / job terlewat):
// pembaca kuota & status (quota.effectiveLimit, subscription.Check,
// getSubscription) menentukan langganan aktif dari JENDELA WAKTU, bukan
// dari status semata, sehingga baris 'scheduled' yang jendelanya sudah
// mulai tetap terbaca sebagai langganan berjalan walau job ini belum
// membaliknya. Job ini yang merapikan status & users.plan (tampilan plan
// di login / anggota tim membaca kolom users.plan).
package worker

import (
	"errors"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// activateDueScheduledSubscriptions mengaktifkan semua langganan
// 'scheduled' yang start_date-nya sudah lewat. Mengembalikan jumlah baris
// yang dibalik menjadi 'active'. Baris yang jendelanya sudah lewat seluruhnya
// (mis. server mati lama) langsung ditandai 'expired', bukan 'active'.
func activateDueScheduledSubscriptions(db *gorm.DB, now time.Time) (int, error) {
	var due []models.Subscription
	if err := db.Where("status = ? AND start_date <= ?", "scheduled", now).
		Order("start_date ASC").Find(&due).Error; err != nil {
		return 0, err
	}
	byUser := map[uint][]models.Subscription{}
	var userIDs []uint
	for _, s := range due {
		if _, ok := byUser[s.UserID]; !ok {
			userIDs = append(userIDs, s.UserID)
		}
		byUser[s.UserID] = append(byUser[s.UserID], s)
	}
	activated := 0
	for _, uid := range userIDs {
		n, err := activateDueScheduledForUser(db, uid, byUser[uid], now)
		if err != nil {
			log.Error().Err(err).Uint("userID", uid).
				Msg("Aktivasi langganan terjadwal gagal untuk user")
			continue
		}
		activated += n
	}
	return activated, nil
}

// activateDueScheduledForUser mengaktifkan antrean satu user dalam satu
// transaksi: klaim tiap baris (guard status='scheduled' agar dua proses
// tidak memproses ganda), balik yang masih berlaku ke 'active' (yang sudah
// lewat ke 'expired'), tandai 'expired' baris 'active' lama yang jendelanya
// sudah lewat, lalu sinkronkan users.plan ke langganan yang jendelanya
// mengandung sekarang (start terbaru menang — menutup kasus tumpang tindih
// dengan langganan berbayar yang dibeli saat ada antrean voucher).
func activateDueScheduledForUser(db *gorm.DB, userID uint, due []models.Subscription, now time.Time) (int, error) {
	activated := 0
	err := db.Transaction(func(tx *gorm.DB) error {
		for _, s := range due {
			target := "active"
			if !s.EndDate.After(now) {
				target = "expired"
			}
			res := tx.Model(&models.Subscription{}).
				Where("id = ? AND status = ?", s.ID, "scheduled").
				Update("status", target)
			if res.Error != nil {
				return res.Error
			}
			if res.RowsAffected == 0 {
				continue // sudah diklaim/diproses proses lain
			}
			if target == "active" {
				activated++
			}
		}

		// Housekeeping: baris 'active' yang jendelanya sudah lewat.
		if err := tx.Model(&models.Subscription{}).
			Where("user_id = ? AND status = ? AND end_date <= ?", userID, "active", now).
			Update("status", "expired").Error; err != nil {
			return err
		}

		// Langganan efektif saat ini (jendela mengandung now, start terbaru).
		var eff models.Subscription
		if err := tx.Where("user_id = ? AND status IN ? AND start_date <= ? AND end_date > ?",
			userID, []string{"active", "scheduled"}, now, now).
			Preload("Plan").Order("start_date DESC").First(&eff).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return nil // tidak ada yang berlaku — biarkan users.plan apa adanya
			}
			return err
		}
		slug := eff.Plan.Slug
		if eff.IsTrial {
			slug = "trial"
		}
		return tx.Model(&models.User{}).Where("id = ?", userID).
			Update("plan", slug).Error
	})
	return activated, err
}

// processScheduledSubscriptions adalah job cron tiap menit yang memanggil
// activateDueScheduledSubscriptions.
func (s *Scheduler) processScheduledSubscriptions() {
	n, err := activateDueScheduledSubscriptions(s.db, time.Now())
	if err != nil {
		log.Error().Err(err).Msg("Aktivasi langganan terjadwal gagal")
		return
	}
	if n > 0 {
		log.Info().Int("count", n).Msg("Langganan terjadwal diaktifkan")
	}
}
