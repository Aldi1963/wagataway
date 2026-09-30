package handler

// recordReport mencatat status pengiriman per nomor ke tabel message_reports.
// Dipakai oleh pipeline pengiriman (tunggal & bulk). Gagal diam-diam (log saja)
// agar tidak mengganggu alur pengiriman yang sudah jalan.

import (
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// recordReport menyimpan satu baris laporan pengiriman.
// status: "sent" atau "failed". campaignID: "bulk-<jobID>" untuk bulk,
// "single-<unix>" untuk kiriman tunggal.
func recordReport(db *gorm.DB, userID uint, campaignID, phone, status, errMsg string) {
	if db == nil {
		return
	}
	report := models.MessageReport{
		UserID:     userID,
		CampaignID: campaignID,
		Phone:      phone,
		Status:     status,
		ErrorMsg:   errMsg,
		SentAt:     time.Now(),
	}
	if err := db.Create(&report).Error; err != nil {
		log.Error().Err(err).
			Uint("userID", userID).
			Str("campaignID", campaignID).
			Str("phone", phone).
			Msg("recordReport failed")
	}
}
