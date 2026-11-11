package database

import (
	"testing"

	"github.com/Aldi1963/wagataway/internal/database/models"
)

// TestMigrateMessageTemplateGrandfather: template lama (status draft, tanpa
// riwayat) dianggap sudah disetujui sekali saat AutoMigrate pertama sesudah
// deploy, lengkap dengan satu baris riwayat. AutoMigrate kedua tidak boleh
// menambah riwayat lagi, dan template draft yang dibuat sesudah flag
// terpasang harus TETAP draft (tidak ikut di-approve otomatis).
func TestMigrateMessageTemplateGrandfather(t *testing.T) {
	db := migrateTestDB(t)
	if err := AutoMigrate(db); err != nil {
		t.Fatalf("AutoMigrate awal: %v", err)
	}
	uid := uint(91500)
	db.Where("id = ?", uid).FirstOrCreate(&models.User{
		ID: uid, UUID: "00000000-0000-0000-0000-000000091500",
		Name: "TplMig", Email: "tplmig@test.local", Password: "x",
	})
	// Bersihkan sisa run sebelumnya + reset flag agar migrasi berjalan lagi.
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.MessageTemplateApproval{})
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.MessageTemplate{})
	db.Unscoped().Where("key = ?", "templates_approval_grandfathered_v1").Delete(&models.Setting{})

	legacy := models.MessageTemplate{UserID: uid, Name: "Legacy", Category: "umum",
		Language: "id", Content: "Halo {{nama}}", Status: "draft"}
	if err := db.Create(&legacy).Error; err != nil {
		t.Fatalf("seed template lama: %v", err)
	}
	sqlDB, _ := db.DB()
	if sqlDB != nil {
		sqlDB.Close()
	}

	// Jalankan migrasi seperti saat server start (pool baru).
	db = migrateTestDB(t)
	if err := AutoMigrate(db); err != nil {
		t.Fatalf("AutoMigrate: %v", err)
	}
	var after models.MessageTemplate
	if err := db.Where("id = ?", legacy.ID).First(&after).Error; err != nil {
		t.Fatalf("baca template: %v", err)
	}
	if after.Status != "approved" {
		t.Errorf("template lama harus jadi approved, got %q", after.Status)
	}
	var count int64
	db.Model(&models.MessageTemplateApproval{}).Where("template_id = ?", legacy.ID).Count(&count)
	if count != 1 {
		t.Errorf("riwayat template lama harus 1 baris, got %d", count)
	}

	// Template draft BARU sesudah flag terpasang harus tetap draft.
	fresh := models.MessageTemplate{UserID: uid, Name: "Baru", Category: "utility",
		Language: "id", Content: "Halo", Status: "draft"}
	if err := db.Create(&fresh).Error; err != nil {
		t.Fatalf("seed template baru: %v", err)
	}
	sqlDB2, _ := db.DB()
	if sqlDB2 != nil {
		sqlDB2.Close()
	}
	db = migrateTestDB(t)
	if err := AutoMigrate(db); err != nil {
		t.Fatalf("AutoMigrate kedua: %v", err)
	}
	var afterFresh models.MessageTemplate
	if err := db.Where("id = ?", fresh.ID).First(&afterFresh).Error; err != nil {
		t.Fatalf("baca template baru: %v", err)
	}
	if afterFresh.Status != "draft" {
		t.Errorf("template draft baru harus tetap draft, got %q", afterFresh.Status)
	}
	db.Model(&models.MessageTemplateApproval{}).Where("template_id = ?", legacy.ID).Count(&count)
	if count != 1 {
		t.Errorf("riwayat template lama tetap 1 baris sesudah migrasi kedua, got %d", count)
	}
}
