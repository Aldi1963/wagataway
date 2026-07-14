package worker

import (
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
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

	// Process drip campaign steps every minute
	s.cron.AddFunc("0 * * * * *", s.processDripSteps)

	// Cleanup expired sessions every hour
	s.cron.AddFunc("0 0 * * * *", s.cleanupExpiredSessions)

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

	log.Debug().Msg("Cleanup: expired OTPs removed")
}
