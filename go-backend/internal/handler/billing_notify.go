package handler

import (
	"fmt"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// ── Fitur 6: Notifikasi WA pembayaran berhasil ───────────────────────────────
// Dikirim TEPAT di momen transisi status transaksi → paid (activateSubscription
// mengembalikan activated=true), yaitu dari tiga titik yang sama:
//   - webhook Clipku Pay (clipkuPayWebhook),
//   - sinkronisasi status GET /api/billing/transactions/:id,
//   - aktivasi prorata bayar-0 (createSubscription).
//
// Pesan dikirim ke "Nomor notifikasi WA" (User.notify_wa, Fitur 1) via device
// connected milik user yang sama (prioritas default lalu id terkecil).
// Bila nomor kosong atau user tidak punya device connected → dilewati
// diam-diam (hanya log), bukan error.
// DIKECUALIKAN dari kuota pesan (seperti reminder langganan): notifikasi
// pembayaran adalah pesan sistem.

// waSender adalah interface minimal untuk pengiriman WA —
// *whatsapp.Manager memenuhinya; memudahkan unit test dengan fake.
type waSender interface {
	SendMessageNoQuota(deviceID uint, to, msgType, content, mediaURL string) error
}

// formatRupiahID memformat nominal ala id-ID: "Rp25.000".
func formatRupiahID(n int64) string {
	s := fmt.Sprintf("%d", n)
	neg := ""
	if strings.HasPrefix(s, "-") {
		neg, s = "-", s[1:]
	}
	var out []byte
	for i := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, s[i])
	}
	return "Rp" + neg + string(out)
}

// tglIDSingkat memformat tanggal ala id-ID: "30 Okt 2026" (Asia/Jakarta).
// Memakai idMonths yang sama dengan invoice PDF agar konsisten.
func tglIDSingkat(t time.Time) string {
	if loc, err := time.LoadLocation("Asia/Jakarta"); err == nil {
		t = t.In(loc)
	}
	return fmt.Sprintf("%d %s %d", t.Day(), idMonths[int(t.Month())-1], t.Year())
}

// buildPaymentSuccessMessage menyusun teks notifikasi WA pembayaran, mis.:
// "Pembayaran Rp25.000 diterima, paket Lite aktif sampai 30 Okt 2026."
func buildPaymentSuccessMessage(amount int64, planName string, endDate time.Time) string {
	return fmt.Sprintf("Pembayaran %s diterima, paket %s aktif sampai %s.",
		formatRupiahID(amount), planName, tglIDSingkat(endDate))
}

// notifyPaymentSuccess mengirim notifikasi WA pembayaran ke nomor notifikasi
// user. Idempoten lewat dua lapis:
//  1. Pemanggil hanya memanggil ini bila activateSubscription melaporkan
//     transisi status → paid yang baru terjadi (bukan pemanggilan ulang).
//  2. Klaim atomik kolom transactions.notify_wa_sent_at
//     (UPDATE ... WHERE notify_wa_sent_at IS NULL) memastikan hanya satu
//     pengirim yang lolos bila dua jalur berlomba (webhook + sinkronisasi).
//
// Mengembalikan nil bila dilewati (transaksi belum paid / nomor kosong / tanpa
// device connected) — bukan error. Kegagalan kirim WA tidak boleh menggagalkan
// aktivasi: pemanggil mengabaikan error ini (sudah dicatat di log).
func notifyPaymentSuccess(db *gorm.DB, wm waSender, txID uint) error {
	var tx models.Transaction
	if err := db.Preload("User").Preload("Plan").First(&tx, txID).Error; err != nil {
		return err
	}
	if tx.Status != "paid" {
		return nil
	}

	notifyWA := strings.TrimSpace(tx.User.NotifyWA)
	if notifyWA == "" {
		log.Debug().Uint("txID", tx.ID).Uint("userID", tx.UserID).
			Msg("Notifikasi pembayaran dilewati: nomor notifikasi WA kosong")
		return nil
	}

	// Device connected milik user yang sama: prioritas default, lalu id terkecil.
	var dev models.Device
	if err := db.Where("user_id = ? AND status = ?", tx.UserID, "connected").
		Order("is_default DESC, id ASC").First(&dev).Error; err != nil {
		log.Info().Uint("txID", tx.ID).Uint("userID", tx.UserID).
			Msg("Notifikasi pembayaran dilewati: user tidak punya device connected")
		return nil
	}

	planName := ""
	if tx.Plan != nil {
		planName = tx.Plan.Name
	}
	// Tanggal akhir dari langganan aktif terbaru (dibuat saat aktivasi).
	endDate := time.Now()
	var sub models.Subscription
	if err := db.Where("user_id = ? AND status = ?", tx.UserID, "active").
		Order("id DESC").First(&sub).Error; err == nil {
		endDate = sub.EndDate
	}
	msg := buildPaymentSuccessMessage(tx.Amount, planName, endDate)

	// Klaim atomik anti-duplikat: hanya satu pemanggil yang lolos.
	now := time.Now()
	res := db.Model(&models.Transaction{}).
		Where("id = ? AND notify_wa_sent_at IS NULL", tx.ID).
		Update("notify_wa_sent_at", now)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected == 0 {
		log.Debug().Uint("txID", tx.ID).
			Msg("Notifikasi pembayaran sudah pernah dikirim — dilewati")
		return nil
	}

	if err := wm.SendMessageNoQuota(dev.ID, notifyWA, "text", msg, ""); err != nil {
		// Gagal kirim: lepas klaim agar bisa dicoba lagi di kesempatan
		// berikut, tapi jangan menggagalkan aktivasi yang sudah terjadi.
		db.Model(&models.Transaction{}).Where("id = ?", tx.ID).
			Update("notify_wa_sent_at", nil)
		log.Error().Err(err).Uint("txID", tx.ID).Uint("deviceID", dev.ID).
			Msg("Notifikasi pembayaran gagal dikirim")
		return err
	}
	log.Info().Uint("txID", tx.ID).Uint("userID", tx.UserID).Str("to", notifyWA).
		Msg("Notifikasi pembayaran terkirim via WA")
	return nil
}
