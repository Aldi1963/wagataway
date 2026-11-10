package worker

import (
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
)

// Pengingat expired langganan otomatis (Fitur 1).
// Dijalankan tiap jam via cron di Scheduler.Start().
//
// Untuk setiap subscription berstatus "active" yang berakhir dalam 72 jam ke depan:
//   - H-1 (sisa <= 24 jam): kirim bila reminded_h1_at masih NULL
//   - H-3 (sisa > 24 jam dan <= 72 jam): kirim bila reminded_h3_at masih NULL
//
// Reminder dikirim via WA ke "Nomor notifikasi WA" milik user, menggunakan device
// connected milik user yang sama (prioritas default lalu id terkecil).
// Bila nomor notifikasi kosong atau user tidak punya device connected, subscription
// dilewati diam-diam (hanya dicatat di log) — bukan error.
//
// Keputusan trial: reminder berlaku untuk SEMUA subscription aktif termasuk trial.
// Masa trial yang hampir habis justru momen konversi ke paket berbayar.
// Setiap pembayaran sukses membuat baris subscription BARU (clipkupay webhook),
// jadi kolom reminded_* tidak perlu di-reset.

var bulanID = []string{
	"", "Jan", "Feb", "Mar", "Apr", "Mei", "Jun",
	"Jul", "Agu", "Sep", "Okt", "Nov", "Des",
}

// formatTanggalID memformat tanggal ala id-ID: "4 Okt 2026".
func formatTanggalID(t time.Time) string {
	if loc, err := time.LoadLocation("Asia/Jakarta"); err == nil {
		t = t.In(loc)
	}
	return fmt.Sprintf("%d %s %d", t.Day(), bulanID[int(t.Month())], t.Year())
}

// reminderKind menentukan jenis reminder untuk sebuah endDate.
// Mengembalikan ("h1"|"h3", daysLeft) atau ("", 0) bila tidak perlu diingatkan.
// Prioritas: bila sisa <= 24 jam, yang berlaku H-1 (bukan H-3).
func reminderKind(endDate, now time.Time) (kind string, daysLeft int) {
	hoursLeft := endDate.Sub(now).Hours()
	if hoursLeft <= 0 {
		return "", 0 // sudah lewat — biarkan mekanisme expiry yang menangani
	}
	if hoursLeft <= 24 {
		return "h1", 1
	}
	if hoursLeft <= 72 {
		return "h3", int(math.Ceil(hoursLeft / 24))
	}
	return "", 0
}

// buildReminderMessage menyusun teks pengingat WA.
func buildReminderMessage(planName string, endDate time.Time, daysLeft int) string {
	hari := "hari lagi"
	if daysLeft <= 1 {
		hari = "1 hari lagi"
	} else {
		hari = fmt.Sprintf("%d hari lagi", daysLeft)
	}
	return fmt.Sprintf(
		"Halo! Paket %s Anda berakhir pada %s (%s). Perpanjang di https://wa.clipku.com/billing agar layanan tidak terputus.",
		planName, formatTanggalID(endDate), hari,
	)
}

// reminderAlreadySent memeriksa guard anti-duplikat dari kolom reminded_*.
func reminderAlreadySent(sub *models.Subscription, kind string) bool {
	switch kind {
	case "h3":
		return sub.RemindedH3At != nil
	case "h1":
		return sub.RemindedH1At != nil
	}
	return true
}

func reminderColumn(kind string) string {
	if kind == "h1" {
		return "reminded_h1_at"
	}
	return "reminded_h3_at"
}

// processSubscriptionReminders mengirim pengingat expired H-3/H-1 via WA.
// Query ringan (maks 200 baris, indeks status+end_date) dan berjalan di background.
func (s *Scheduler) processSubscriptionReminders() {
	now := time.Now()
	var subs []models.Subscription
	if err := s.db.
		Where("status = ? AND end_date > ? AND end_date <= ?", "active", now, now.Add(72*time.Hour)).
		Preload("Plan").Preload("User").
		Limit(200).
		Find(&subs).Error; err != nil {
		log.Error().Err(err).Msg("Reminder langganan: gagal query subscription")
		return
	}

	sent := 0
	for i := range subs {
		sub := &subs[i]
		kind, daysLeft := reminderKind(sub.EndDate, now)
		if kind == "" || reminderAlreadySent(sub, kind) {
			continue
		}

		notifyWA := strings.TrimSpace(sub.User.NotifyWA)
		if notifyWA == "" {
			log.Debug().Uint("subID", sub.ID).Uint("userID", sub.UserID).
				Msg("Reminder langganan dilewati: nomor notifikasi WA kosong")
			continue
		}

		// Device connected milik user yang sama: prioritas default, lalu id terkecil.
		var dev models.Device
		if err := s.db.Where("user_id = ? AND status = ?", sub.UserID, "connected").
			Order("is_default DESC, id ASC").First(&dev).Error; err != nil {
			log.Info().Uint("subID", sub.ID).Uint("userID", sub.UserID).
				Msg("Reminder langganan dilewati: user tidak punya device connected")
			continue
		}

		msg := buildReminderMessage(sub.Plan.Name, sub.EndDate, daysLeft)
		// DIKECUALIKAN dari kuota pesan (Fitur 3): reminder langganan adalah
		// pesan sistem, tidak menghabiskan & tidak diblokir kuota user.
		if err := s.waManager.SendMessageNoQuota(dev.ID, notifyWA, "text", msg, ""); err != nil {
			// Jangan tandai sebagai terkirim — coba lagi pada jadwal berikutnya.
			log.Error().Err(err).Uint("subID", sub.ID).Uint("deviceID", dev.ID).
				Msg("Reminder langganan gagal dikirim")
			continue
		}

		// Tandai terkirim secara atomik dengan guard NULL agar tidak double-kirim.
		col := reminderColumn(kind)
		res := s.db.Model(&models.Subscription{}).
			Where("id = ? AND "+col+" IS NULL", sub.ID).
			Update(col, now)
		if res.Error != nil {
			log.Error().Err(res.Error).Uint("subID", sub.ID).Msg("Reminder langganan: gagal menandai terkirim")
			continue
		}
		if res.RowsAffected == 0 {
			continue // sudah ditandai proses lain — anggap terkirim
		}
		sent++
		log.Info().Uint("subID", sub.ID).Uint("userID", sub.UserID).Str("kind", kind).
			Str("to", notifyWA).Msg("Reminder langganan terkirim via WA")
	}

	if sent > 0 {
		log.Info().Int("count", sent).Msg("Reminder langganan: selesai")
	}
}
