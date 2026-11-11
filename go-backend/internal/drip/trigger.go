// Package drip berisi mesin pemicu (trigger) drip campaign berbasis aksi:
// pendaftaran kontak ke sequence dari sebuah kejadian (pesan pertama,
// order, label, dsb.), evaluasi kondisi per langkah, klaim idempotent
// untuk worker, dan pemicu berbasis waktu (X hari sejak pembelian terakhir).
//
// Drip berbasis jadwal yang lama tidak disentuh: paket ini hanya menambah
// jenis pemicu + kolom baru pada model yang sudah ada.
package drip

import (
	"strconv"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"gorm.io/gorm"
)

// Jenis pemicu berbasis aksi.
const (
	TriggerNewContact        = "new_contact"
	TriggerOrderCreated      = "order_created"
	TriggerOrderPaid         = "order_paid"
	TriggerTagAdded          = "tag_added"
	TriggerDaysSincePurchase = "days_since_purchase"
	TriggerEvent             = "event"
	TriggerKeyword           = "keyword"
)

// Status order yang dianggap "pembelian" (lunas/dikonfirmasi).
var PaidOrderStatuses = []string{"paid", "confirmed", "completed", "lunas"}

// staleProcessingAge: klaim worker yang lebih tua dari ini dianggap basi
// (proses mati di tengah kirim) dan boleh diklaim ulang.
const staleProcessingAge = 10 * time.Minute

// StepDelayMinutes mengembalikan jeda efektif sebuah step dalam menit:
// DelayMinutes bila diisi, kalau tidak DelayHours * 60 (kompatibel lama).
func StepDelayMinutes(step models.DripStep) int {
	if step.DelayMinutes > 0 {
		return step.DelayMinutes
	}
	if step.DelayHours <= 0 {
		return 24 * 60
	}
	return step.DelayHours * 60
}

// StepDelay mengembalikan jeda efektif sebuah step sebagai Duration.
func StepDelay(step models.DripStep) time.Duration {
	return time.Duration(StepDelayMinutes(step)) * time.Minute
}

// firstStepDelay mengembalikan jeda sebelum step pertama campaign.
// Bila campaign belum punya step, default 24 jam.
func firstStepDelay(db *gorm.DB, campaignID uint) time.Duration {
	var step models.DripStep
	if err := db.Where("campaign_id = ? AND step_order = ?", campaignID, 1).First(&step).Error; err != nil {
		return 24 * time.Hour
	}
	return StepDelay(step)
}

// EnrollPhone mendaftarkan satu nomor ke sebuah campaign.
// Idempoten: bila sudah ada enrollment aktif/paused untuk campaign+phone
// yang sama (atau dengan TriggerRef yang sama bila ref terisi), tidak ada
// enrollment baru yang dibuat dan created=false.
// nextSendAt dihitung dari jeda step pertama.
func EnrollPhone(db *gorm.DB, campaign models.DripCampaign, phone, triggerEvent, triggerRef string, now time.Time) (created bool, err error) {
	phone = strings.TrimSpace(phone)
	if phone == "" {
		return false, nil
	}
	var existing models.DripEnrollment
	q := db.Where("campaign_id = ? AND phone = ?", campaign.ID, phone)
	if triggerRef != "" {
		// Satu ref (mis. satu order) hanya mendaftarkan sekali, apa pun statusnya.
		q = q.Where("trigger_ref = ?", triggerRef)
	} else {
		// Tanpa ref: jangan gandakan enrollment yang masih berjalan.
		q = q.Where("status IN ?", []string{"active", "paused"})
	}
	if err := q.First(&existing).Error; err == nil {
		return false, nil
	}
	nextSend := now.Add(firstStepDelay(db, campaign.ID))
	enr := models.DripEnrollment{
		CampaignID:   campaign.ID,
		Phone:        phone,
		CurrentStep:  0,
		Status:       "active",
		NextSendAt:   &nextSend,
		EnrolledAt:   now,
		TriggerEvent: triggerEvent,
		TriggerRef:   triggerRef,
	}
	if err := db.Create(&enr).Error; err != nil {
		return false, err
	}
	db.Model(&campaign).Update("enrolled", gorm.Expr("enrolled + ?", 1))
	return true, nil
}

// FireEvent memicu semua campaign aktif milik user (pada device tertentu,
// atau semua device bila deviceID=0) yang trigger-nya cocok dengan event.
//   - new_contact / order_created / order_paid: TriggerVal kosong = semua;
//     untuk order, TriggerVal berisi product ID (bila diisi harus cocok
//     dengan data["productId"]).
//   - tag_added: TriggerVal berisi nama label (bila diisi harus cocok
//     dengan data["label"], perbandingan case-insensitive).
//   - event: TriggerVal WAJIB sama dengan nama event.
//
// Mengembalikan jumlah enrollment baru yang dibuat.
func FireEvent(db *gorm.DB, userID, deviceID uint, event, phone, ref string, data map[string]string) (int, error) {
	if phone == "" || event == "" {
		return 0, nil
	}
	var campaigns []models.DripCampaign
	q := db.Where("user_id = ? AND is_active = ? AND trigger_type = ?", userID, true, event)
	if deviceID != 0 {
		q = q.Where("device_id = ?", deviceID)
	}
	if err := q.Find(&campaigns).Error; err != nil {
		return 0, err
	}
	now := time.Now()
	enrolled := 0
	for _, c := range campaigns {
		switch event {
		case TriggerTagAdded:
			if c.TriggerVal != "" && !strings.EqualFold(strings.TrimSpace(c.TriggerVal), strings.TrimSpace(data["label"])) {
				continue
			}
		case TriggerOrderCreated, TriggerOrderPaid:
			if c.TriggerVal != "" && data["productId"] != "" && c.TriggerVal != data["productId"] {
				continue
			}
		}
		// Event generik ("event") tidak lewat sini — pakai FireNamedEvent,
		// karena nama event disimpan di TriggerVal, bukan TriggerType.
		created, err := EnrollPhone(db, c, phone, event, ref, now)
		if err != nil {
			return enrolled, err
		}
		if created {
			enrolled++
		}
	}
	return enrolled, nil
}

// FireNamedEvent memicu campaign trigger generik ("event") berdasarkan
// NAMA event yang disimpan di TriggerVal — mis. FireNamedEvent(db, uid,
// deviceID, "vip_joined", phone, "") mendaftarkan kontak ke campaign
// dengan trigger_type="event" dan trigger_val="vip_joined".
func FireNamedEvent(db *gorm.DB, userID, deviceID uint, eventName, phone, ref string) (int, error) {
	if phone == "" || eventName == "" {
		return 0, nil
	}
	var campaigns []models.DripCampaign
	q := db.Where("user_id = ? AND is_active = ? AND trigger_type = ? AND trigger_val = ?",
		userID, true, TriggerEvent, eventName)
	if deviceID != 0 {
		q = q.Where("device_id = ?", deviceID)
	}
	if err := q.Find(&campaigns).Error; err != nil {
		return 0, err
	}
	now := time.Now()
	enrolled := 0
	for _, c := range campaigns {
		created, err := EnrollPhone(db, c, phone, TriggerEvent, ref, now)
		if err != nil {
			return enrolled, err
		}
		if created {
			enrolled++
		}
	}
	return enrolled, nil
}

// HandleIncoming dipanggil untuk setiap pesan masuk (bukan grup) dari kontak:
//   - "STOP" (atau OptOutKeyword campaign) membatalkan semua enrollment aktif
//     kontak itu pada device tersebut.
//   - Balasan apa pun dicatat (LastReplyAt); bila campaign CancelOnReply,
//     enrollment dibatalkan.
//   - Pesan pertama dari kontak baru memicu campaign new_contact.
//   - Pesan yang mengandung keyword memicu campaign keyword yang cocok.
//
// Gagal diam-diam (hanya log via error return) agar tidak mengganggu
// penerimaan pesan.
func HandleIncoming(db *gorm.DB, userID, deviceID uint, phone, text string, isNewContact bool) error {
	phone = strings.TrimSpace(phone)
	if phone == "" {
		return nil
	}
	now := time.Now()
	trimmed := strings.TrimSpace(text)

	// 1. Opt-out: "STOP" (atau keyword kustom campaign) membatalkan semuanya.
	if isOptOut(db, userID, deviceID, phone, trimmed) {
		// GORM mengabaikan Joins pada Updates — pakai subquery campaign.
		db.Model(&models.DripEnrollment{}).
			Where("phone = ? AND status IN ? AND campaign_id IN (?)",
				phone, []string{"active", "paused"},
				db.Model(&models.DripCampaign{}).Select("id").
					Where("user_id = ? AND device_id = ?", userID, deviceID)).
			Updates(map[string]interface{}{"status": "cancelled", "cancel_reason": "stop_keyword"})
		return nil
	}

	// 2. Catat balasan pada enrollment yang masih berjalan; batalkan bila
	// campaign-nya CancelOnReply.
	var enrollments []models.DripEnrollment
	db.Joins("JOIN drip_campaigns ON drip_campaigns.id = drip_enrollments.campaign_id").
		Where("drip_enrollments.phone = ? AND drip_enrollments.status IN ? AND drip_campaigns.user_id = ? AND drip_campaigns.device_id = ?",
			phone, []string{"active", "paused"}, userID, deviceID).
		Find(&enrollments)
	for _, enr := range enrollments {
		var campaign models.DripCampaign
		if err := db.First(&campaign, enr.CampaignID).Error; err != nil {
			continue
		}
		updates := map[string]interface{}{"last_reply_at": &now}
		if campaign.CancelOnReply {
			updates["status"] = "cancelled"
			updates["cancel_reason"] = "replied"
		}
		db.Model(&enr).Updates(updates)
	}

	// 3. Pemicu pesan pertama & keyword.
	if isNewContact {
		if _, err := FireEvent(db, userID, deviceID, TriggerNewContact, phone, "", nil); err != nil {
			return err
		}
	}
	if trimmed != "" {
		if _, err := fireKeyword(db, userID, deviceID, phone, trimmed); err != nil {
			return err
		}
	}
	return nil
}

// isOptOut: true bila teks sama dengan "STOP"/"BERHENTI" atau sama dengan
// OptOutKeyword salah satu campaign aktif kontak itu (case-insensitive).
func isOptOut(db *gorm.DB, userID, deviceID uint, phone, text string) bool {
	if text == "" {
		return false
	}
	upper := strings.ToUpper(strings.TrimSpace(text))
	if upper == "STOP" || upper == "BERHENTI" {
		return true
	}
	var keywords []string
	db.Model(&models.DripCampaign{}).
		Joins("JOIN drip_enrollments ON drip_enrollments.campaign_id = drip_campaigns.id").
		Where("drip_enrollments.phone = ? AND drip_enrollments.status IN ? AND drip_campaigns.user_id = ? AND drip_campaigns.device_id = ? AND drip_campaigns.opt_out_keyword <> ?",
			phone, []string{"active", "paused"}, userID, deviceID, "").
		Distinct().Pluck("drip_campaigns.opt_out_keyword", &keywords)
	for _, kw := range keywords {
		if strings.ToUpper(strings.TrimSpace(kw)) == upper {
			return true
		}
	}
	return false
}

// fireKeyword mendaftarkan kontak ke campaign keyword yang triggerVal-nya
// muncul di dalam teks pesan (case-insensitive, substring).
func fireKeyword(db *gorm.DB, userID, deviceID uint, phone, text string) (int, error) {
	var campaigns []models.DripCampaign
	if err := db.Where("user_id = ? AND device_id = ? AND is_active = ? AND trigger_type = ? AND trigger_val <> ?",
		userID, deviceID, true, TriggerKeyword, "").Find(&campaigns).Error; err != nil {
		return 0, err
	}
	now := time.Now()
	lower := strings.ToLower(text)
	enrolled := 0
	for _, c := range campaigns {
		if !strings.Contains(lower, strings.ToLower(strings.TrimSpace(c.TriggerVal))) {
			continue
		}
		created, err := EnrollPhone(db, c, phone, TriggerKeyword, "", now)
		if err != nil {
			return enrolled, err
		}
		if created {
			enrolled++
		}
	}
	return enrolled, nil
}

// ClaimEnrollment mengklaim satu enrollment secara atomik untuk diproses
// worker ini: hanya satu worker yang berhasil (RowsAffected=1). Klaim basi
// (>10 menit, proses mati di tengah kirim) boleh diambil alih.
func ClaimEnrollment(db *gorm.DB, id uint, now time.Time) bool {
	res := db.Model(&models.DripEnrollment{}).
		Where("id = ? AND status = ? AND (processing_at IS NULL OR processing_at < ?)",
			id, "active", now.Add(-staleProcessingAge)).
		Update("processing_at", now)
	return res.Error == nil && res.RowsAffected == 1
}

// ReleaseClaim menghapus klaim pemrosesan (dipanggil setelah langkah
// selesai diproses — terkirim, dilewati, atau gagal non-kuota).
func ReleaseClaim(db *gorm.DB, id uint) {
	db.Model(&models.DripEnrollment{}).Where("id = ?", id).Update("processing_at", nil)
}

// ShouldSkipStep mengevaluasi kondisi sebuah langkah terhadap enrollment.
// Mengembalikan true bila langkah harus DILEWATI (tidak dikirim, sequence
// lanjut ke langkah berikutnya).
//   - SkipIfReplied: lewati bila kontak membalas setelah langkah sebelumnya
//     terkirim (LastReplyAt > LastSentAt).
//   - RequireOrderStatus: lewati bila order terakhir kontak tidak berstatus
//     tersebut (atau kontak belum pernah order).
func ShouldSkipStep(db *gorm.DB, enr models.DripEnrollment, campaign models.DripCampaign, step models.DripStep) bool {
	if step.SkipIfReplied && enr.LastReplyAt != nil && enr.LastSentAt != nil &&
		enr.LastReplyAt.After(*enr.LastSentAt) {
		return true
	}
	if step.RequireOrderStatus != "" {
		var order models.BotOrder
		err := db.Where("user_id = ? AND buyer_phone = ?", campaign.UserID, enr.Phone).
			Order("updated_at DESC").First(&order).Error
		if err != nil || !strings.EqualFold(order.Status, step.RequireOrderStatus) {
			return true
		}
	}
	return false
}

// ProcessTimeTriggers mengevaluasi pemicu berbasis waktu: campaign
// days_since_purchase (TriggerVal = jumlah hari). Untuk setiap order yang
// berstatus lunas dan berumur >= N hari, daftarkan pembeli ke campaign —
// sekali per order (TriggerRef "order:<id>"), jadi pemindaian berulang
// tidak mendaftarkan ganda. Mengembalikan jumlah enrollment baru.
func ProcessTimeTriggers(db *gorm.DB, now time.Time) (int, error) {
	var campaigns []models.DripCampaign
	if err := db.Where("is_active = ? AND trigger_type = ?", true, TriggerDaysSincePurchase).
		Find(&campaigns).Error; err != nil {
		return 0, err
	}
	enrolled := 0
	for _, c := range campaigns {
		days, err := strconv.Atoi(strings.TrimSpace(c.TriggerVal))
		if err != nil || days < 0 {
			continue
		}
		cutoff := now.Add(-time.Duration(days) * 24 * time.Hour)
		var orders []models.BotOrder
		// UpdatedAt dipakai sebagai waktu pembelian: status berubah menjadi
		// lunas belakangan tetap terhitung sejak pelunasan, bukan sejak order dibuat.
		// Jendela 48 jam ke belakang: order yang sudah jauh melewati ambang
		// (mis. dari sebelum fitur ini aktif) tidak didaftarkan sekaligus —
		// hanya order yang BARU melewati ambang N hari.
		// (BotOrder tidak punya device_id — pemicu ini per user, bukan per device.)
		if err := db.Where("user_id = ? AND status IN ? AND updated_at <= ? AND updated_at > ?",
			c.UserID, PaidOrderStatuses, cutoff, cutoff.Add(-48*time.Hour)).Find(&orders).Error; err != nil {
			return enrolled, err
		}
		for _, o := range orders {
			created, err := EnrollPhone(db, c, o.BuyerPhone, TriggerDaysSincePurchase,
				"order:"+strconv.FormatUint(uint64(o.ID), 10), now)
			if err != nil {
				return enrolled, err
			}
			if created {
				enrolled++
			}
		}
	}
	return enrolled, nil
}
