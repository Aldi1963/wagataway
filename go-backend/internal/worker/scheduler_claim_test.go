package worker

import (
	"fmt"
	"net/url"
	"os"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func pad12(n uint) string { return fmt.Sprintf("%012d", n) }

// schedulerTestDB membuka DB test wagataway_test (pola yang sama seperti
// test RLS). Skip bila tidak tersedia — tidak pernah menyentuh DB live.
func schedulerTestDB(t *testing.T) *gorm.DB {
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

func seedScheduledMessage(t *testing.T, db *gorm.DB, uid uint, status string, sendAt time.Time) models.ScheduledMessage {
	t.Helper()
	if err := db.AutoMigrate(&models.User{}, &models.Device{}, &models.ScheduledMessage{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	db.Where("id = ?", uid).FirstOrCreate(&models.User{
		ID: uid, UUID: "00000000-0000-0000-0000-" + pad12(uid),
		Name: "Sched", Email: "sched-" + pad12(uid) + "@test.local", Password: "x",
	})
	// Device harus benar-benar ada (FK scheduled_messages -> devices).
	dev := models.Device{UserID: uid, Name: "Sched Device", Status: "disconnected"}
	if err := db.Where("user_id = ? AND name = ?", uid, dev.Name).FirstOrCreate(&dev).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}
	m := models.ScheduledMessage{
		UserID: uid, DeviceID: dev.ID, To: "6281234567890",
		Type: "text", Content: "jadwal", Status: status, SendAt: sendAt,
	}
	if err := db.Create(&m).Error; err != nil {
		t.Fatalf("seed scheduled: %v", err)
	}
	return m
}

// TestClaimScheduledMessageConcurrent: 20 worker bersamaan mengklaim pesan
// yang sama — tepat 1 berhasil.
func TestClaimScheduledMessageConcurrent(t *testing.T) {
	db := schedulerTestDB(t)
	m := seedScheduledMessage(t, db, 91300, "pending", time.Now().Add(-time.Minute))
	defer db.Unscoped().Delete(&m)

	var wg sync.WaitGroup
	won := make([]bool, 20)
	for i := range won {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			won[i] = claimScheduledMessage(db, m.ID, time.Now())
		}(i)
	}
	wg.Wait()

	n := 0
	for _, w := range won {
		if w {
			n++
		}
	}
	if n != 1 {
		t.Errorf("klaim berhasil = %d, mau 1", n)
	}
	var after models.ScheduledMessage
	db.First(&after, m.ID)
	if after.Status != "sending" {
		t.Errorf("status = %q, mau %q", after.Status, "sending")
	}
}

// TestClaimScheduledMessageStaleSending: klaim 'sending' basi (>10 menit)
// boleh diambil alih sekali; 'sending' baru tidak boleh.
func TestClaimScheduledMessageStaleSending(t *testing.T) {
	db := schedulerTestDB(t)

	// Basi: updated_at 11 menit lalu.
	stale := seedScheduledMessage(t, db, 91301, "sending", time.Now().Add(-time.Minute))
	defer db.Unscoped().Delete(&stale)
	if err := db.Model(&stale).UpdateColumn("updated_at", time.Now().Add(-11*time.Minute)).Error; err != nil {
		t.Fatalf("set updated_at basi: %v", err)
	}
	if !claimScheduledMessage(db, stale.ID, time.Now()) {
		t.Error("klaim sending basi harus berhasil")
	}
	if claimScheduledMessage(db, stale.ID, time.Now()) {
		t.Error("klaim kedua atas pesan yang sama harus gagal")
	}

	// Baru: updated_at sekarang.
	fresh := seedScheduledMessage(t, db, 91301, "sending", time.Now().Add(-time.Minute))
	defer db.Unscoped().Delete(&fresh)
	if claimScheduledMessage(db, fresh.ID, time.Now()) {
		t.Error("klaim sending baru harus gagal")
	}
}

// TestProcessScheduledMessagesConcurrent: 5 worker bersamaan memproses 10
// pesan pending — semua diproses tepat sekali (tidak ada yang macet di
// pending/sending, tidak ada yang diproses ganda sampai dua kali kirim).
// Device tidak terhubung, jadi semuanya berakhir failed dengan error_msg.
func TestProcessScheduledMessagesConcurrent(t *testing.T) {
	db := schedulerTestDB(t)
	uid := uint(91302)
	var ids []uint
	for i := 0; i < 10; i++ {
		m := seedScheduledMessage(t, db, uid, "pending", time.Now().Add(-time.Minute))
		ids = append(ids, m.ID)
		defer db.Unscoped().Delete(&models.ScheduledMessage{ID: m.ID})
	}

	wm := whatsapp.NewManager(t.TempDir(), db)
	s := NewScheduler(db, wm)

	var wg sync.WaitGroup
	for i := 0; i < 5; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			s.processScheduledMessages()
		}()
	}
	wg.Wait()

	var failed, stuck int64
	db.Model(&models.ScheduledMessage{}).Where("id IN ? AND status = ?", ids, "failed").Count(&failed)
	db.Model(&models.ScheduledMessage{}).Where("id IN ? AND status IN ?", ids, []string{"pending", "sending"}).Count(&stuck)
	if failed != 10 {
		t.Errorf("failed = %d, mau 10", failed)
	}
	if stuck != 0 {
		t.Errorf("macet pending/sending = %d, mau 0", stuck)
	}
}
