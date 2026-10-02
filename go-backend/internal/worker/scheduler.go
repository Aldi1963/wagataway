package worker

import (
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/quota"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/robfig/cron/v3"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

type Scheduler struct {
	cron      *cron.Cron
	db        *gorm.DB
	waManager *whatsapp.Manager
}

func NewScheduler(db *gorm.DB, waManager *whatsapp.Manager) *Scheduler {
	return &Scheduler{
		cron:      cron.New(cron.WithSeconds()),
		db:        db,
		waManager: waManager,
	}
}

func (s *Scheduler) Start() {
	// Process scheduled messages every 30 seconds
	s.cron.AddFunc("*/30 * * * * *", s.processScheduledMessages)

	// Process scheduled bulk jobs (blast terjadwal) every 30 seconds
	s.cron.AddFunc("*/30 * * * * *", s.processScheduledBulkJobs)

	// Fire chat reminders (pengingat follow-up) every minute
	s.cron.AddFunc("0 * * * * *", s.processChatReminders)

	// Process drip campaign steps every minute
	s.cron.AddFunc("0 * * * * *", s.processDripSteps)

	// Process recurring schedules every minute
	s.cron.AddFunc("0 * * * * *", s.processRecurringSchedules)

	// Process automatic follow-ups every 5 minutes
	s.cron.AddFunc("0 */5 * * * *", s.processFollowups)

	// Cleanup expired sessions every hour
	s.cron.AddFunc("0 0 * * * *", s.cleanupExpiredSessions)

	// Kirim pengingat expired langganan (H-3 / H-1) setiap jam, di menit ke-15
	// agar tidak bertabrakan dengan job menit-0 lainnya.
	s.cron.AddFunc("0 15 * * * *", s.processSubscriptionReminders)

	s.cron.Start()
	log.Info().Msg("Background scheduler started")
}

func (s *Scheduler) Stop() {
	ctx := s.cron.Stop()
	<-ctx.Done()
	log.Info().Msg("Background scheduler stopped")
}

func (s *Scheduler) processScheduledMessages() {
	var messages []models.ScheduledMessage
	now := time.Now()

	s.db.Where("status = ? AND send_at <= ?", "pending", now).
		Limit(50).
		Find(&messages)

	for _, msg := range messages {
		err := s.waManager.SendMessage(msg.DeviceID, msg.To, msg.Type, msg.Content, msg.MediaURL)

		sentAt := time.Now()
		if err != nil {
			s.db.Model(&msg).Updates(map[string]interface{}{
				"status":    "failed",
				"error_msg": err.Error(),
			})
		} else {
			s.db.Model(&msg).Updates(map[string]interface{}{
				"status":  "sent",
				"sent_at": &sentAt,
			})
		}
	}

	if len(messages) > 0 {
		log.Info().Int("count", len(messages)).Msg("Processed scheduled messages")
	}
}

// processScheduledBulkJobs menjalankan blast yang dijadwalkan (status
// "scheduled" dan scheduled_at sudah lewat). Job diklaim atomik via status
// agar tidak diproses ganda.
func (s *Scheduler) processScheduledBulkJobs() {
	var jobs []models.BulkJob
	now := time.Now()
	s.db.Where("status = ? AND scheduled_at IS NOT NULL AND scheduled_at <= ?", "scheduled", now).
		Limit(20).
		Find(&jobs)

	for _, job := range jobs {
		// Klaim: hanya satu worker yang boleh memproses.
		res := s.db.Model(&models.BulkJob{}).
			Where("id = ? AND status = ?", job.ID, "scheduled").
			Update("status", "pending")
		if res.RowsAffected == 0 {
			continue
		}
		log.Info().Uint("jobID", job.ID).Msg("Menjalankan blast terjadwal")
		go s.waManager.ProcessBulkJob(job.ID, s.db)
	}
}

// processChatReminders memicu pengingat follow-up yang sudah waktunya:
// buat notifikasi in-app lalu tandai selesai. Idempoten via klaim atomik.
func (s *Scheduler) processChatReminders() {
	var items []models.ChatReminder
	now := time.Now()
	s.db.Where("is_done = ? AND remind_at <= ?", false, now).
		Limit(50).
		Find(&items)

	for _, rem := range items {
		res := s.db.Model(&models.ChatReminder{}).
			Where("id = ? AND is_done = ?", rem.ID, false).
			Update("is_done", true)
		if res.RowsAffected == 0 {
			continue
		}
		// Nama kontak untuk pesan notifikasi yang ramah.
		name := rem.Phone
		var conv models.ChatConversation
		if err := s.db.Where("user_id = ? AND device_id = ? AND phone = ?",
			rem.UserID, rem.DeviceID, rem.Phone).Order("updated_at DESC").First(&conv).Error; err == nil {
			if conv.ContactName != "" {
				name = conv.ContactName
			}
		}
		title := "Pengingat follow-up: " + name
		msg := "Waktunya menindaklanjuti chat dengan " + name + " (" + rem.Phone + ")."
		if rem.Note != "" {
			msg += " Catatan: " + rem.Note
		}
		uid := rem.UserID
		s.db.Create(&models.Notification{
			UserID:  &uid,
			Type:    "chat_reminder",
			Title:   title,
			Message: msg,
			Link:    "/live-chat",
		})
		log.Info().Uint("reminderID", rem.ID).Msg("Pengingat follow-up dipicu")
	}
}

func (s *Scheduler) processDripSteps() {
	var enrollments []models.DripEnrollment
	now := time.Now()

	s.db.Where("status = ? AND next_send_at <= ?", "active", now).
		Limit(30).
		Find(&enrollments)

	for _, enrollment := range enrollments {
		// Get the campaign and current step
		var step models.DripStep
		err := s.db.Where("campaign_id = ? AND step_order = ?", enrollment.CampaignID, enrollment.CurrentStep+1).
			First(&step).Error

		if err != nil {
			// No more steps — mark completed
			s.db.Model(&enrollment).Update("status", "completed")
			continue
		}

		// Get campaign to find device
		var campaign models.DripCampaign
		s.db.First(&campaign, enrollment.CampaignID)

		// Send the step message
		sendErr := s.waManager.SendMessage(campaign.DeviceID, enrollment.Phone, step.Type, step.Content, step.MediaURL)
		if sendErr != nil {
			// Kuota habis (Fitur 3): tunda 6 jam agar tidak spam log tiap menit;
			// enrollment tetap aktif dan lanjut otomatis setelah user upgrade.
			if quota.IsExceeded(sendErr) {
				nextRetry := time.Now().Add(6 * time.Hour)
				s.db.Model(&enrollment).Update("next_send_at", &nextRetry)
				log.Warn().Uint("enrollmentID", enrollment.ID).Msg("Drip ditunda 6 jam: kuota pesan habis")
				continue
			}
			log.Error().Err(sendErr).Uint("enrollmentID", enrollment.ID).Msg("Failed to send drip step")
			continue
		}

		// Advance to next step
		nextStep := enrollment.CurrentStep + 1
		nextSend := time.Now().Add(time.Duration(step.DelayHours) * time.Hour)

		s.db.Model(&enrollment).Updates(map[string]interface{}{
			"current_step": nextStep,
			"next_send_at": &nextSend,
		})
	}
}

func (s *Scheduler) cleanupExpiredSessions() {
	// Clean up OTP codes older than 1 hour
	s.db.Where("expires_at < ? AND used = ?", time.Now(), false).Delete(&models.EmailOtp{})

	// Hapus kode OTP WA yang sudah lama (expired > 24 jam) agar tabel tidak membengkak.
	// Kode aktif/yang masih dalam masa berlaku tidak disentuh.
	s.db.Where("expires_at < ?", time.Now().Add(-24*time.Hour)).Delete(&models.WaOtpCode{})

	log.Debug().Msg("Cleanup: expired OTPs removed")
}
