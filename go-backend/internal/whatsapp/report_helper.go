package whatsapp

// recordMessageReport mencatat status pengiriman per nomor ke tabel
// message_reports. Versi package whatsapp (dipakai ProcessBulkJob) —
// package handler punya versinya sendiri di report_recorder.go karena
// whatsapp tidak boleh mengimpor handler (circular import).
//
// Gagal diam-diam (log saja) agar tidak mengganggu pipeline pengiriman.

import (
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

func recordMessageReport(db *gorm.DB, userID, deviceID uint, campaignID, phone, messageID, status, errMsg string, sentAt time.Time) {
	if db == nil {
		return
	}
	report := models.MessageReport{
		UserID:     userID,
		DeviceID:   deviceID,
		CampaignID: campaignID,
		Phone:      phone,
		MessageID:  messageID,
		Status:     status,
		ErrorMsg:   errMsg,
		SentAt:     sentAt,
	}
	if err := db.Create(&report).Error; err != nil {
		log.Error().Err(err).
			Uint("userID", userID).
			Str("campaignID", campaignID).
			Str("phone", phone).
			Msg("recordMessageReport failed")
	}
}
