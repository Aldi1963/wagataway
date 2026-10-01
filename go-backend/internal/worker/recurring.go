package worker

// Worker untuk Jadwal Berulang (RecurringSchedule) & Follow-up Otomatis.
// Dijalankan via cron di Scheduler.Start().

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/quota"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/rs/zerolog/log"
)

// wibLoc mengembalikan zona Asia/Jakarta (fallback ke Local bila gagal).
func wibLoc() *time.Location {
	if loc, err := time.LoadLocation("Asia/Jakarta"); err == nil {
		return loc
	}
	return time.Local
}

// nextRun menghitung jadwal berikutnya dari frequency + time + day.
// frequency: daily | weekly | monthly. timeStr: "HH:MM" (WIB).
// dayOfWeek: 0-6 (Minggu=0) untuk weekly. dayOfMonth: 1-31 untuk monthly.
func nextRun(frequency, timeStr string, dayOfWeek, dayOfMonth *int, from time.Time) time.Time {
	loc := wibLoc()
	from = from.In(loc)

	hour, minute := parseHM(timeStr)

	switch strings.ToLower(frequency) {
	case "weekly":
		dow := 1 // default Senin
		if dayOfWeek != nil {
			dow = *dayOfWeek % 7
		}
		// Cari hari yang diminta minggu ini/depan.
		daysAhead := (dow - int(from.Weekday()) + 7) % 7
		candidate := time.Date(from.Year(), from.Month(), from.Day()+daysAhead, hour, minute, 0, 0, loc)
		if !candidate.After(from) {
			candidate = candidate.AddDate(0, 0, 7)
		}
		return candidate

	case "monthly":
		dom := 1
		if dayOfMonth != nil && *dayOfMonth >= 1 && *dayOfMonth <= 31 {
			dom = *dayOfMonth
		}
		candidate := time.Date(from.Year(), from.Month(), min(dom, daysIn(from.Year(), from.Month(), loc)), hour, minute, 0, 0, loc)
		if !candidate.After(from) {
			nm := candidate.AddDate(0, 1, 0)
			candidate = time.Date(nm.Year(), nm.Month(), min(dom, daysIn(nm.Year(), nm.Month(), loc)), hour, minute, 0, 0, loc)
		}
		return candidate

	default: // daily
		candidate := time.Date(from.Year(), from.Month(), from.Day(), hour, minute, 0, 0, loc)
		if !candidate.After(from) {
			candidate = candidate.AddDate(0, 0, 1)
		}
		return candidate
	}
}

func parseHM(s string) (int, int) {
	parts := strings.Split(strings.TrimSpace(s), ":")
	if len(parts) != 2 {
		return 9, 0
	}
	h, err1 := strconv.Atoi(parts[0])
	m, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || h < 0 || h > 23 || m < 0 || m > 59 {
		return 9, 0
	}
	return h, m
}

func daysIn(year int, month time.Month, loc *time.Location) int {
	return time.Date(year, month+1, 0, 0, 0, 0, 0, loc).Day()
}

// deviceBelongsToUser memastikan device milik user yang benar.
func (s *Scheduler) deviceBelongsToUser(deviceID, userID uint) bool {
	var dev models.Device
	if err := s.db.Select("id", "user_id").Where("id = ? AND user_id = ?", deviceID, userID).First(&dev).Error; err != nil {
		return false
	}
	return true
}

// recordReport mencatat hasil pengiriman ke MessageReport.
func (s *Scheduler) recordReport(userID, deviceID uint, campaignID, phone, messageID, status, errMsg string) {
	s.db.Create(&models.MessageReport{
		UserID:     userID,
		DeviceID:   deviceID,
		CampaignID: campaignID,
		Phone:      phone,
		MessageID:  messageID,
		Status:     status,
		ErrorMsg:   errMsg,
		SentAt:     time.Now(),
	})
}

// processRecurringSchedules mengeksekusi jadwal berulang yang sudah waktunya.
func (s *Scheduler) processRecurringSchedules() {
	var schedules []models.RecurringSchedule
	now := time.Now()

	s.db.Where("is_active = ? AND next_run_at <= ?", true, now).
		Limit(50).
		Find(&schedules)

	for _, sch := range schedules {
		// Validasi kepemilikan device.
		if !s.deviceBelongsToUser(sch.DeviceID, sch.UserID) {
			log.Warn().Uint("scheduleID", sch.ID).Msg("Recurring: device bukan milik user, dilewati")
			continue
		}

		msgType := "text"
		if sch.MediaURL != "" {
			msgType = "image"
		}
		campaignID := fmt.Sprintf("recurring-%d", sch.ID)

		// Kuota pesan (Fitur 3): bila habis, lewati jadwal kali ini (lanjut ke
		// jadwal berikutnya) dan catat di report agar user tahu alasannya.
		if qr, qerr := quota.Check(s.db, sch.UserID); qerr == nil && !qr.Allowed {
			s.recordReport(sch.UserID, sch.DeviceID, campaignID, sch.Target, "", "failed", quota.ExceededMessage(qr))
			next := nextRun(sch.Frequency, sch.Time, sch.DayOfWeek, sch.DayOfMonth, now)
			s.db.Model(&sch).Updates(map[string]interface{}{
				"last_run_at": &now,
				"next_run_at": &next,
			})
			log.Warn().Uint("scheduleID", sch.ID).Msg("Recurring dilewati: kuota pesan habis")
			continue
		}

		waMsgID, err := s.waManager.SendMessageWithOptions(sch.DeviceID, sch.Target, whatsapp.SendOptions{
			Type:     msgType,
			Content:  sch.Message,
			MediaURL: sch.MediaURL,
		})
		if err != nil {
			// Gagal (mis. device tidak connected): retry 10 menit lagi.
			retryAt := now.Add(10 * time.Minute)
			s.db.Model(&sch).Update("next_run_at", &retryAt)
			s.recordReport(sch.UserID, sch.DeviceID, campaignID, sch.Target, "", "failed", err.Error())
			log.Error().Err(err).Uint("scheduleID", sch.ID).Msg("Recurring: gagal kirim, retry 10 menit lagi")
			continue
		}

		next := nextRun(sch.Frequency, sch.Time, sch.DayOfWeek, sch.DayOfMonth, now)
		s.db.Model(&sch).Updates(map[string]interface{}{
			"last_run_at": &now,
			"next_run_at": &next,
		})
		s.recordReport(sch.UserID, sch.DeviceID, campaignID, sch.Target, waMsgID, "sent", "")
		log.Info().Uint("scheduleID", sch.ID).Time("nextRun", next).Msg("Recurring: terkirim")
	}

	if len(schedules) > 0 {
		log.Info().Int("count", len(schedules)).Msg("Processed recurring schedules")
	}
}

// processFollowups mengeksekusi follow-up otomatis yang sudah waktunya.
func (s *Scheduler) processFollowups() {
	var items []models.Followup
	now := time.Now()

	s.db.Where("is_active = ?", true).Limit(50).Find(&items)

	sent := 0
	for _, fu := range items {
		// Kirim jika belum pernah ATAU sudah lewat TriggerAfterHours sejak kirim terakhir.
		if fu.LastSentAt != nil {
			nextAllowed := fu.LastSentAt.Add(time.Duration(fu.TriggerAfterHours) * time.Hour)
			if now.Before(nextAllowed) {
				continue
			}
		}

		if !s.deviceBelongsToUser(fu.DeviceID, fu.UserID) {
			log.Warn().Uint("followupID", fu.ID).Msg("Followup: device bukan milik user, dilewati")
			continue
		}

		campaignID := fmt.Sprintf("followup-%d", fu.ID)

		// Kuota pesan (Fitur 3): bila habis, tunda ke siklus berikutnya
		// (update last_sent_at) agar tidak spam tiap 5 menit.
		if qr, qerr := quota.Check(s.db, fu.UserID); qerr == nil && !qr.Allowed {
			s.recordReport(fu.UserID, fu.DeviceID, campaignID, fu.TargetPhone, "", "failed", quota.ExceededMessage(qr))
			s.db.Model(&fu).Update("last_sent_at", &now)
			log.Warn().Uint("followupID", fu.ID).Msg("Followup ditunda: kuota pesan habis")
			continue
		}

		waMsgID, err := s.waManager.SendMessageWithOptions(fu.DeviceID, fu.TargetPhone, whatsapp.SendOptions{
			Type:    "text",
			Content: fu.Message,
		})
		if err != nil {
			s.recordReport(fu.UserID, fu.DeviceID, campaignID, fu.TargetPhone, "", "failed", err.Error())
			log.Error().Err(err).Uint("followupID", fu.ID).Msg("Followup: gagal kirim")
			continue
		}

		s.db.Model(&fu).Update("last_sent_at", &now)
		s.recordReport(fu.UserID, fu.DeviceID, campaignID, fu.TargetPhone, waMsgID, "sent", "")
		sent++
		log.Info().Uint("followupID", fu.ID).Msg("Followup: terkirim")
	}

	if sent > 0 {
		log.Info().Int("count", sent).Msg("Processed followups")
	}
}
