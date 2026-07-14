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
	return db.AutoMigrate(
		&models.User{},
		&models.Device{},
		&models.Message{},
		&models.BulkJob{},
		&models.BulkJobRecipient{},
		&models.Contact{},
		&models.ContactGroup{},
		&models.ContactGroupMember{},
		&models.AutoReply{},
		&models.ApiKey{},
		&models.Plan{},
		&models.Subscription{},
		&models.Transaction{},
		&models.ScheduledMessage{},
		&models.Webhook{},
		&models.Plugin{},
		&models.CsBot{},
		&models.CsBotFaq{},
		&models.CsBotKnowledge{},
		&models.Setting{},
		&models.Voucher{},
		&models.Notification{},
		&models.ChatInbox{},
		&models.ChatConversation{},
		&models.MessageTemplate{},
		&models.EmailOtp{},
		&models.WalletTransaction{},
		&models.PaymentWebhookLog{},
		&models.CannedResponse{},
		&models.DripCampaign{},
		&models.DripStep{},
		&models.DripEnrollment{},
		&models.ResellerSubUser{},
		&models.Blacklist{},
		&models.ShortLink{},
		&models.BotProduct{},
		&models.BotOrder{},
		&models.AdminWaBot{},
	)
}
