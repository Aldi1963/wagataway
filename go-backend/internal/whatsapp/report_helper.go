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

func recordMessageReport(db *gorm.DB, userID uint, campaignID, phone, status, errMsg string, sentAt time.Time) {
	if db == nil {
		return
	}
	report := models.MessageReport{
		UserID:     userID,
		CampaignID: campaignID,
		Phone:      phone,
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
