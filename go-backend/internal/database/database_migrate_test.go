package database

import (
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/rls"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// migrateTestDB membuka DB test wagataway_test (pola yang sama seperti test
// RLS). Skip bila tidak tersedia — tidak pernah menyentuh DB live.
func migrateTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		if b, err := os.ReadFile("/home/hatch/workspace/wagataway/.env"); err == nil {
			for _, ln := range strings.Split(string(b), "\n") {
				if strings.HasPrefix(ln, "DATABASE_URL=") {
					dsn = strings.Trim(strings.TrimPrefix(ln, "DATABASE_URL="), `"'`)
				}
			}
		}
	}
	if dsn == "" {
		t.Skip("DATABASE_URL tidak tersedia — lewati test DB")
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Skipf("DATABASE_URL tidak valid: %v", err)
	}
	u.Path = "/wagataway_test"
	db, err := gorm.Open(postgres.New(postgres.Config{
		DriverName: rls.DriverName,
		DSN:        u.String(),
	}), &gorm.Config{})
	if err != nil {
		t.Skipf("postgres test tidak terjangkau: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil || sqlDB.Ping() != nil {
		t.Skip("postgres test tidak terjangkau")
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)
	rls.Register(db)
	return db
}

func indexDef(t *testing.T, db *gorm.DB, name string) string {
	t.Helper()
	var def string
	err := db.Raw(`SELECT indexdef FROM pg_indexes WHERE indexname = ?`, name).Scan(&def).Error
	if err != nil {
		t.Fatalf("index %s tidak ditemukan: %v", name, err)
	}
	return def
}

// TestAutoMigrateUniqueIndexes: dari state LAMA (index external_id non-unik,
// tanpa index idempotency parsial), AutoMigrate harus menghasilkan index
// unik + index parsial, dan perilaku duplikatnya harus benar:
//
//   - ExternalID ganda -> ditolak.
//   - Kunci idempotency ganda (non-kosong) -> ditolak.
//   - Pesan tanpa kunci (string kosong) -> tetap boleh banyak.
func TestAutoMigrateUniqueIndexes(t *testing.T) {
	// PENTING: tiap fase memakai handle DB baru (pool baru). AutoMigrate
	// yang kedua pada pool yang sama gagal dengan "cached plan must not
	// change result type": pgx menyimpan prepared statement per koneksi,
	// dan DDL di antara dua AutoMigrate mengubah bentuk tabel. Di produksi
	// ini tidak terjadi (AutoMigrate jalan sekali per proses, pool masih
	// segar); di test, buka koneksi baru untuk tiap fase.
	db := migrateTestDB(t)

	// 1. Pastikan tabel ada, lalu kembalikan ke state LAMA.
	if err := AutoMigrate(db); err != nil {
		t.Fatalf("AutoMigrate awal: %v", err)
	}
	if err := db.Exec(`DROP INDEX IF EXISTS idx_messages_idem_unique`).Error; err != nil {
		t.Fatalf("drop index idem: %v", err)
	}
	if err := db.Exec(`DROP INDEX IF EXISTS idx_transactions_external_id`).Error; err != nil {
		t.Fatalf("drop index ext: %v", err)
	}
	if err := db.Exec(`CREATE INDEX idx_transactions_external_id ON transactions(external_id)`).Error; err != nil {
		t.Fatalf("buat index lama: %v", err)
	}
	sqlDB, _ := db.DB()
	if sqlDB != nil {
		sqlDB.Close()
	}

	// 2. Jalankan migrasi seperti saat server start (pool baru).
	db = migrateTestDB(t)
	if err := AutoMigrate(db); err != nil {
		t.Fatalf("AutoMigrate: %v", err)
	}

	// 3. Periksa definisi index.
	extDef := indexDef(t, db, "idx_transactions_external_id")
	if !strings.Contains(extDef, "UNIQUE") {
		t.Errorf("idx_transactions_external_id bukan unik: %s", extDef)
	}
	idemDef := indexDef(t, db, "idx_messages_idem_unique")
	if !strings.Contains(idemDef, "UNIQUE") || !strings.Contains(idemDef, "WHERE") {
		t.Errorf("idx_messages_idem_unique harus unik parsial: %s", idemDef)
	}
	if !strings.Contains(idemDef, "WHERE") || !strings.Contains(idemDef, "idempotency_key") ||
		!strings.Contains(idemDef, "<>") {
		t.Errorf("predikat index idem salah: %s", idemDef)
	}

	// 4. Perilaku: siapkan user+device, bersihkan sisa run sebelumnya.
	uid := uint(91400)
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.Message{})
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.Transaction{})
	db.Unscoped().Where("user_id = ? AND name = ?", uid, "Mig Device").Delete(&models.Device{})
	db.Where("id = ?", uid).FirstOrCreate(&models.User{
		ID: uid, UUID: "00000000-0000-0000-0000-000000091400",
		Name: "Mig", Email: "mig@test.local", Password: "x",
	})
	device := models.Device{UserID: uid, Name: "Mig Device", Status: "disconnected"}
	if err := db.Create(&device).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}

	// ExternalID ganda ditolak.
	tx1 := models.Transaction{UserID: uid, Amount: 66000, Status: "pending", ExternalID: "TEST-EXT-DUP"}
	if err := db.Create(&tx1).Error; err != nil {
		t.Fatalf("tx pertama: %v", err)
	}
	tx2 := models.Transaction{UserID: uid, Amount: 66000, Status: "pending", ExternalID: "TEST-EXT-DUP"}
	if err := db.Create(&tx2).Error; err == nil {
		t.Error("ExternalID ganda harus ditolak unique index")
	} else if !strings.Contains(err.Error(), "duplicate key") {
		t.Errorf("error ExternalID ganda harus duplicate key, dapat: %v", err)
	}

	// Kunci idempotency ganda ditolak.
	m1 := models.Message{UserID: uid, DeviceID: device.ID, To: "6281", Type: "text",
		Content: "satu", Status: "pending", IdempotencyKey: "TEST-IDEM-DUP"}
	if err := db.Create(&m1).Error; err != nil {
		t.Fatalf("msg pertama: %v", err)
	}
	m2 := models.Message{UserID: uid, DeviceID: device.ID, To: "6281", Type: "text",
		Content: "dua", Status: "pending", IdempotencyKey: "TEST-IDEM-DUP"}
	if err := db.Create(&m2).Error; err == nil {
		t.Error("kunci idempotency ganda harus ditolak unique index")
	} else if !strings.Contains(err.Error(), "duplicate key") {
		t.Errorf("error idem ganda harus duplicate key, dapat: %v", err)
	}

	// Pesan tanpa kunci tetap boleh banyak (index parsial).
	for i := 0; i < 2; i++ {
		m := models.Message{UserID: uid, DeviceID: device.ID, To: "6281", Type: "text",
			Content: "tanpa kunci", Status: "pending", IdempotencyKey: ""}
		if err := db.Create(&m).Error; err != nil {
			t.Fatalf("pesan tanpa kunci ke-%d harus lolos: %v", i+1, err)
		}
	}

	// 5. Idempoten: jalankan lagi (pool baru, alasan yang sama seperti
	//    di atas), tidak boleh error.
	sqlDB2, _ := db.DB()
	if sqlDB2 != nil {
		sqlDB2.Close()
	}
	db = migrateTestDB(t)
	if err := AutoMigrate(db); err != nil {
		t.Fatalf("AutoMigrate kedua: %v", err)
	}
}
