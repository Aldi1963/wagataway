package database

import (
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Connect(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}

	// Connection pool settings
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)

	log.Info().Msg("Database connection pool configured")

	return db, nil
}

func AutoMigrate(db *gorm.DB) error {
	if err := db.AutoMigrate(
		&models.User{},
		&models.Device{},
		&models.Message{},
		&models.BulkJob{},
		&models.BulkJobRecipient{},
		&models.Contact{},
		&models.ContactGroup{},
		&models.ContactGroupMember{},
		&models.AutoReply{},
		&models.AIReplyConfig{},
		&models.ApiKey{},
		&models.Plan{},
		&models.Subscription{},
		&models.Transaction{},
		&models.ScheduledMessage{},
		&models.Webhook{},
		&models.WebhookDelivery{},
		&models.Plugin{},
		&models.CsBot{},
		&models.CsBotFaq{},
		&models.CsBotKnowledge{},
		&models.Setting{},
		&models.Voucher{},
		&models.VoucherRedemption{},
		&models.Notification{},
		&models.ChatInbox{},
		&models.ChatConversation{},
		&models.MessageTemplate{},
		&models.EmailOtp{},
		&models.PasswordResetToken{},
		&models.WalletTransaction{},
		&models.PaymentWebhookLog{},
		&models.CannedResponse{},
		&models.DripCampaign{},
		&models.DripStep{},
		&models.DripEnrollment{},
		&models.Blacklist{},
		&models.ShortLink{},
		&models.BotProduct{},
		&models.BotOrder{},
		&models.AdminWaBot{},
		&models.AdminActivityLog{},
		&models.File{},
		&models.ChatLabel{},
		&models.ChatAssignment{},
		&models.MessageReport{},
		&models.RecurringSchedule{},
		&models.GroupRule{},
		&models.Followup{},
		&models.WebhookDeliveryLog{},
		&models.TeamMember{},
		&models.Affiliate{},
		&models.AffiliateEarning{},
	); err != nil {
		return err
	}
	return migrateAPIKeyHashes(db)
}

// migrateAPIKeyHashes memindahkan API key plaintext lama ke kolom KeyHash.
// Idempoten: hanya memproses baris yang KeyHash-nya masih kosong.
func migrateAPIKeyHashes(db *gorm.DB) error {
	// Index unik lama pada kolom key tidak lagi dibutuhkan (lookup memakai
	// key_hash) dan akan menolak beberapa baris berisi string kosong.
	if db.Migrator().HasIndex(&models.ApiKey{}, "idx_api_keys_key") {
		if err := db.Migrator().DropIndex(&models.ApiKey{}, "idx_api_keys_key"); err != nil {
			return err
		}
		log.Info().Msg("Dropped legacy unique index idx_api_keys_key")
	}

	var keys []models.ApiKey
	if err := db.Where("key_hash = ? AND key <> ?", "", "").Find(&keys).Error; err != nil {
		return err
	}
	for _, k := range keys {
		hash := models.HashAPIKey(k.Key)
		if err := db.Model(&models.ApiKey{}).Where("id = ?", k.ID).Updates(map[string]interface{}{
			"key_hash": hash,
			"key":      "",
		}).Error; err != nil {
			return err
		}
	}
	if len(keys) > 0 {
		log.Info().Int("count", len(keys)).Msg("Migrated plaintext API keys to key_hash")
	}
	return nil
}
