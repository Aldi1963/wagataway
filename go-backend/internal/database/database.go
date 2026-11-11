package database

import (
	"errors"
	"strings"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/quota"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/security"
	"github.com/rs/zerolog/log"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

func Connect(dsn string) (*gorm.DB, error) {
	// NOTE: the pgx-rls driver (registered by internal/rls) wraps pgx and
	// enforces Row Level Security per physical connection. Never open the
	// DB with the plain "pgx" driver: rls.Register at startup fails
	// closed if the wrapper is missing.
	db, err := gorm.Open(postgres.New(postgres.Config{
		DriverName: rls.DriverName,
		DSN:        dsn,
	}), &gorm.Config{
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
		&models.WelcomeDMSent{},
		&models.ContactGroupMember{},
		&models.AutoReply{},
		&models.AIReplyConfig{},
		&models.AIConnection{},
		&models.AIChatbotFAQ{},
		&models.AIChatbotLog{},
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
		&models.MessageTemplateApproval{},
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
		&models.ReferralReward{},
		&models.MenuBot{},
		&models.MenuBotItem{},
		&models.MenuBotSession{},
		&models.WaOtpCode{},
		&models.Poll{},
		&models.PollVote{},
		&models.Integration{},
		&models.IntegrationLog{},
		&models.SheetsConnection{},
		&models.SheetsSync{},
		&models.InboundWebhook{},
		&models.InboundWebhookLog{},
		&models.Session{},
		&models.LoginHistory{},
		&models.ChatReminder{},
		&models.ChatBackup{},
	); err != nil {
		return err
	}
	if err := migrateDeviceWebhookSecrets(db); err != nil {
		return err
	}
	if err := migrateDeviceWebhookEnabled(db); err != nil {
		return err
	}
	if err := migratePlanQuotaDefaults(db); err != nil {
		return err
	}
	if err := migrateMessageIdempotencyUniqueIndex(db); err != nil {
		return err
	}
	if err := migrateTransactionExternalIDUniqueIndex(db); err != nil {
		return err
	}
	if err := migrateAPIKeyHashes(db); err != nil {
		return err
	}
	return migrateMessageTemplateGrandfather(db)
}

// migrateMessageIdempotencyUniqueIndex membuat unique index parsial untuk
// kunci idempotency /messages/send: (user_id, device_id, idempotency_key)
// hanya untuk baris yang kuncinya tidak kosong. Parsial karena sebagian
// besar pesan tidak memakai kunci (string kosong) — unique index penuh
// akan menolak pesan kedua tanpa kunci dari user+device yang sama.
// Idempoten (IF NOT EXISTS); aman dipanggil ulang. Prasyarat: tidak ada
// duplikat kunci non-kosong di tabel (dicek di DB live sebelum deploy;
// 0 duplikat per 2026-11-11).
func migrateMessageIdempotencyUniqueIndex(db *gorm.DB) error {
	if err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_idem_unique
		ON messages (user_id, device_id, idempotency_key)
		WHERE idempotency_key <> ''`).Error; err != nil {
		return err
	}
	log.Info().Msg("Ensured partial unique index idx_messages_idem_unique")
	return nil
}

// migrateTransactionExternalIDUniqueIndex menjadikan transactions.external_id
// unik (tag uniqueIndex di model). AutoMigrate saja tidak cukup: ia melihat
// nama index sudah ada (versi non-unik lama) lalu melewatinya, sehingga
// perubahan tag tidak berpengaruh pada DB yang sudah jalan. Fungsi ini
// menghapus index lama yang non-unik, lalu membuat ulang versi uniknya.
// Idempoten; bila index sudah unik, tidak melakukan apa-apa. Prasyarat:
// tidak ada duplikat ExternalID non-kosong (dicek di DB live sebelum
// deploy; 0 duplikat per 2026-11-11).
func migrateTransactionExternalIDUniqueIndex(db *gorm.DB) error {
	const idxName = "idx_transactions_external_id"
	var indexdef string
	err := db.Raw(`SELECT indexdef FROM pg_indexes WHERE indexname = ?`, idxName).
		Scan(&indexdef).Error
	switch {
	case err == nil:
		if strings.Contains(indexdef, "UNIQUE") {
			return nil
		}
		if err := db.Migrator().DropIndex(&models.Transaction{}, idxName); err != nil {
			return err
		}
		log.Info().Msg("Dropped legacy non-unique index idx_transactions_external_id")
	case errors.Is(err, gorm.ErrRecordNotFound):
		// Belum ada index — dibuat di bawah.
	default:
		return err
	}
	if !db.Migrator().HasIndex(&models.Transaction{}, idxName) {
		if err := db.Migrator().CreateIndex(&models.Transaction{}, "ExternalID"); err != nil {
			return err
		}
		log.Info().Msg("Created unique index idx_transactions_external_id")
	}
	return nil
}

// migrateDeviceWebhookEnabled mengaktifkan webhook untuk device lama yang
// sudah punya webhook_url (kolom baru default-nya hanya berlaku untuk baris
// baru; tanpa ini device lama tiba-tiba nonaktif). Idempoten.
func migrateDeviceWebhookEnabled(db *gorm.DB) error {
	res := db.Model(&models.Device{}).
		Where("webhook_url <> ? AND webhook_enabled = ?", "", false).
		Update("webhook_enabled", true)
	if res.Error != nil {
		return res.Error
	}
	if res.RowsAffected > 0 {
		log.Info().Int64("count", res.RowsAffected).Msg("Backfilled device webhook_enabled=true")
	}
	return nil
}

// migrateDeviceWebhookSecrets mengisi webhook_secret untuk device yang sudah
// punya webhook_url tapi secret-nya masih kosong (device lama). Idempoten.
func migrateDeviceWebhookSecrets(db *gorm.DB) error {
	var ids []uint
	if err := db.Model(&models.Device{}).
		Where("webhook_url <> ? AND (webhook_secret = ? OR webhook_secret IS NULL)", "", "").
		Pluck("id", &ids).Error; err != nil {
		return err
	}
	for _, id := range ids {
		secret, err := security.GenerateWebhookSecret()
		if err != nil {
			return err
		}
		if err := db.Model(&models.Device{}).Where("id = ?", id).Update("webhook_secret", secret).Error; err != nil {
			return err
		}
	}
	if len(ids) > 0 {
		log.Info().Int("count", len(ids)).Msg("Backfilled device webhook secrets")
	}
	return nil
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

// migrateMessageTemplateGrandfather menganggap template yang sudah ada
// sebelum alur persetujuan (kolom status baru, semua baris lama = draft)
// sebagai sudah disetujui, agar TemplatePicker / Live Chat / kirim pesan
// yang sudah memakainya tidak tiba-tiba rusak. Satu baris riwayat
// "approved" ditulis per template. Idempoten via kunci di tabel settings:
// hanya berjalan sekali, pada boot pertama sesudah deploy — template draft
// yang dibuat sesudah itu TIDAK ikut di-approve otomatis.
func migrateMessageTemplateGrandfather(db *gorm.DB) error {
	const flagKey = "templates_approval_grandfathered_v1"
	var flag models.Setting
	if err := db.Where("key = ?", flagKey).First(&flag).Error; err == nil {
		return nil
	}
	var templates []models.MessageTemplate
	if err := db.Where("status = ?", "draft").Find(&templates).Error; err != nil {
		return err
	}
	if len(templates) == 0 {
		return db.Where("key = ?", flagKey).Assign(models.Setting{Key: flagKey, Value: "1"}).
			FirstOrCreate(&models.Setting{}).Error
	}
	var users []models.User
	if err := db.Select("id", "name").Find(&users).Error; err != nil {
		return err
	}
	names := map[uint]string{}
	for _, u := range users {
		names[u.ID] = u.Name
	}
	for _, tpl := range templates {
		actor := names[tpl.UserID]
		if actor == "" {
			actor = "Sistem"
		}
		if err := db.Model(&models.MessageTemplate{}).Where("id = ?", tpl.ID).
			Update("status", "approved").Error; err != nil {
			return err
		}
		if err := db.Create(&models.MessageTemplateApproval{
			TemplateID: tpl.ID, UserID: tpl.UserID, ActorName: actor,
			Action: "approved", FromStatus: "draft", ToStatus: "approved",
			Reason: "Template lama: dianggap sudah disetujui (migrasi ke alur persetujuan).",
		}).Error; err != nil {
			return err
		}
	}
	log.Info().Int("count", len(templates)).Msg("Grandfathered legacy message templates to approved")
	return db.Where("key = ?", flagKey).Assign(models.Setting{Key: flagKey, Value: "1"}).
		FirstOrCreate(&models.Setting{}).Error
}

// migratePlanQuotaDefaults mengisi monthly_message_limit (Fitur 3) dan
// batas kontak/bulk/auto-reply (Item 7) untuk paket bawaan.
// Idempoten; tidak menimpa nilai kustom. Master memang 0 (= unlimited)
// untuk kuota pesan.
func migratePlanQuotaDefaults(db *gorm.DB) error {
	if err := quota.BackfillDefaults(db); err != nil {
		return err
	}
	if err := quota.BackfillPlanLimits(db); err != nil {
		return err
	}
	log.Info().Msg("Plan monthly message limits backfilled")
	return nil
}
