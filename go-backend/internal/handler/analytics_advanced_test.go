// Test analitik lanjutan (item 6): funnel baca → balas → beli, performa
// device/kampanye, dan waktu respons CS.
//
// DB-backed (postgres test wagataway_test; skip bila tidak tersedia),
// mengikuti pola trialTestDB — tidak pernah menyentuh DB live.
package handler

import (
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func analyticsTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL tidak diset — lewati test analitik")
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Skipf("DATABASE_URL tidak valid: %v", err)
	}
	u.Path = "/wagataway_test"
	db, err := gorm.Open(postgres.Open(u.String()), &gorm.Config{})
	if err != nil {
		t.Skipf("postgres test tidak terjangkau: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil || sqlDB.Ping() != nil {
		t.Skip("postgres test tidak terjangkau")
	}
	if err := db.AutoMigrate(&models.User{}, &models.Device{}, &models.Message{},
		&models.ChatInbox{}, &models.ChatConversation{}, &models.BulkJob{},
		&models.BulkJobRecipient{}, &models.BotProduct{}, &models.BotOrder{}); err != nil {
		t.Fatalf("AutoMigrate gagal: %v", err)
	}
	return db
}

func seedAnalyticsUser(t *testing.T, db *gorm.DB, uid uint) {
	t.Helper()
	u := models.User{ID: uid, UUID: fmt.Sprintf("00000000-0000-0000-0000-%012d", uid),
		Name: "Analitik Uji", Email: fmt.Sprintf("analitik-uji-%d@test.local", uid), Password: "x"}
	if err := db.Where("id = ?", uid).FirstOrCreate(&u).Error; err != nil {
		t.Fatalf("seed user: %v", err)
	}
	// Bersihkan data uji user ini dari run sebelumnya.
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.BotOrder{})
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.ChatConversation{})
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.ChatInbox{})
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.Message{})
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.BulkJob{})
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.Device{})
}

func TestAnalyticsFunnelReadReplyBuy(t *testing.T) {
	db := analyticsTestDB(t)
	const uid uint = 900601
	seedAnalyticsUser(t, db, uid)
	now := time.Now().Truncate(time.Second)
	dev := models.Device{UserID: uid, Name: "Dev Uji", Phone: "628100000001", Status: "disconnected"}
	if err := db.Create(&dev).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}
	mkMsg := func(to, status string, at time.Time, jobID *uint) {
		m := models.Message{UserID: uid, DeviceID: dev.ID, BulkJobID: jobID,
			To: to, Direction: "outgoing", Status: status, CreatedAt: at}
		if err := db.Create(&m).Error; err != nil {
			t.Fatalf("seed message: %v", err)
		}
	}
	// 4 pesan keluar: 2 dibaca, 1 terkirim, 1 gagal.
	mkMsg("628110000001", "read", now.Add(-2*time.Hour), nil)
	mkMsg("628110000002", "read", now.Add(-2*time.Hour), nil)
	mkMsg("628110000003", "sent", now.Add(-2*time.Hour), nil)
	mkMsg("628110000004", "failed", now.Add(-2*time.Hour), nil)
	// Balasan dari nomor pertama (setelah pesan keluar).
	if err := db.Create(&models.ChatInbox{UserID: uid, DeviceID: dev.ID, Phone: "628110000001",
		Direction: "in", Content: "mau", CreatedAt: now.Add(-1 * time.Hour)}).Error; err != nil {
		t.Fatalf("seed inbox: %v", err)
	}
	// Order dari nomor pertama (setelah pesan keluar) — beli.
	// Disisipkan via SQL mentah: kolom bot_orders.order_number NOT NULL di
	// DB tapi tidak ada di model BotOrder (drift skema yang sudah ada).
	prod := models.BotProduct{UserID: uid, Name: "Produk Uji", Price: 50000}
	if err := db.Create(&prod).Error; err != nil {
		t.Fatalf("seed product: %v", err)
	}
	seedOrder := func(number, phone string, qty int, total int64, at time.Time) {
		t.Helper()
		if err := db.Exec(`INSERT INTO bot_orders (user_id, product_id, buyer_phone, quantity, total, status, order_number, created_at, updated_at)
			VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
			uid, prod.ID, phone, qty, total, number, at, at).Error; err != nil {
			t.Fatalf("seed order %s: %v", number, err)
		}
	}
	seedOrder("ORD-UJI-1", "628110000001", 2, 100000, now.Add(-30*time.Minute))
	// Order dari nomor yang TIDAK pernah menerima pesan — tidak boleh dihitung.
	seedOrder("ORD-UJI-2", "628119999999", 1, 50000, now.Add(-30*time.Minute))

	f := analyticsFilter{from: now.AddDate(0, 0, -30), to: now.Add(24 * time.Hour), days: 30}
	res, err := computeFunnel(db, uid, f)
	if err != nil {
		t.Fatalf("computeFunnel: %v", err)
	}
	if res.Sent != 3 {
		t.Errorf("sent = %d, mau 3", res.Sent)
	}
	if res.Read != 2 || res.ReadRate < 66.6 || res.ReadRate > 66.7 {
		t.Errorf("read = %d (rate %.1f), mau 2 (66.7%%)", res.Read, res.ReadRate)
	}
	if res.Failed != 1 {
		t.Errorf("failed = %d, mau 1", res.Failed)
	}
	if res.Replied != 1 {
		t.Errorf("replied = %d, mau 1", res.Replied)
	}
	if res.Buyers != 1 || res.Orders != 1 || res.Revenue != 100000 {
		t.Errorf("buyers/orders/revenue = %d/%d/%d, mau 1/1/100000", res.Buyers, res.Orders, res.Revenue)
	}

	// Filter device yang tidak ada → semua nol.
	f.deviceID = dev.ID + 999
	empty, err := computeFunnel(db, uid, f)
	if err != nil {
		t.Fatalf("computeFunnel device kosong: %v", err)
	}
	if empty.Sent != 0 || empty.Replied != 0 || empty.Buyers != 0 {
		t.Errorf("filter device asing masih menghitung: %+v", empty)
	}
}

func TestAnalyticsDeviceAndCampaignPerf(t *testing.T) {
	db := analyticsTestDB(t)
	const uid uint = 900602
	seedAnalyticsUser(t, db, uid)
	now := time.Now().Truncate(time.Second)
	dev := models.Device{UserID: uid, Name: "Dev Kampanye", Phone: "628100000002", Status: "disconnected"}
	if err := db.Create(&dev).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}
	job := models.BulkJob{UserID: uid, DeviceID: dev.ID, Name: "Promo Uji",
		Status: "completed", TotalCount: 2, SentCount: 2, CreatedAt: now.Add(-3 * time.Hour)}
	if err := db.Create(&job).Error; err != nil {
		t.Fatalf("seed job: %v", err)
	}
	for _, to := range []string{"628120000001", "628120000002"} {
		m := models.Message{UserID: uid, DeviceID: dev.ID, BulkJobID: &job.ID,
			To: to, Direction: "outgoing", Status: "read", CreatedAt: now.Add(-2 * time.Hour)}
		if err := db.Create(&m).Error; err != nil {
			t.Fatalf("seed message: %v", err)
		}
	}
	if err := db.Create(&models.ChatInbox{UserID: uid, DeviceID: dev.ID, Phone: "628120000001",
		Direction: "in", Content: "ok", CreatedAt: now.Add(-1 * time.Hour)}).Error; err != nil {
		t.Fatalf("seed inbox: %v", err)
	}

	f := analyticsFilter{from: now.AddDate(0, 0, -30), to: now.Add(24 * time.Hour), days: 30}
	devs, err := computeDevicePerf(db, uid, f)
	if err != nil {
		t.Fatalf("computeDevicePerf: %v", err)
	}
	if len(devs) != 1 || devs[0].Sent != 2 || devs[0].Read != 2 || devs[0].Replied != 1 {
		t.Errorf("device perf = %+v, mau sent=2 read=2 replied=1", devs)
	}
	camps, err := computeCampaignPerf(db, uid, f)
	if err != nil {
		t.Fatalf("computeCampaignPerf: %v", err)
	}
	if len(camps) != 1 || camps[0].SentCount != 2 || camps[0].Read != 2 || camps[0].Replied != 1 {
		t.Errorf("campaign perf = %+v, mau sent=2 read=2 replied=1", camps)
	}
}

func TestAnalyticsResponseTime(t *testing.T) {
	db := analyticsTestDB(t)
	const uid uint = 900603
	seedAnalyticsUser(t, db, uid)
	now := time.Now().Truncate(time.Second)
	dev := models.Device{UserID: uid, Name: "Dev CS", Phone: "628100000003", Status: "disconnected"}
	if err := db.Create(&dev).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}
	// Percakapan A: masuk 10:00, dibalas 10:05 → FRT 300 dtk.
	// Percakapan B: masuk tapi tidak dibalas → reply rate 50%.
	for _, tc := range []struct {
		phone    string
		inAt     time.Time
		outAt    *time.Time
		status   string
		lastAct  time.Time
	}{
		{"628130000001", now.Add(-5 * time.Hour), ptrTime(now.Add(-5*time.Hour + 5*time.Minute)), "done", now.Add(-4 * time.Hour)},
		{"628130000002", now.Add(-3 * time.Hour), nil, "open", now.Add(-3 * time.Hour)},
	} {
		conv := models.ChatConversation{UserID: uid, DeviceID: dev.ID, Phone: tc.phone,
			Status: tc.status, LastActivity: tc.lastAct, CreatedAt: tc.inAt}
		if err := db.Create(&conv).Error; err != nil {
			t.Fatalf("seed conversation: %v", err)
		}
		if err := db.Create(&models.ChatInbox{UserID: uid, DeviceID: dev.ID, Phone: tc.phone,
			Direction: "in", Content: "halo", CreatedAt: tc.inAt}).Error; err != nil {
			t.Fatalf("seed inbox in: %v", err)
		}
		if tc.outAt != nil {
			if err := db.Create(&models.ChatInbox{UserID: uid, DeviceID: dev.ID, Phone: tc.phone,
				Direction: "out", Content: "siap", CreatedAt: *tc.outAt}).Error; err != nil {
				t.Fatalf("seed inbox out: %v", err)
			}
		}
	}

	f := analyticsFilter{from: now.AddDate(0, 0, -30), to: now.Add(24 * time.Hour), days: 30}
	res, err := computeResponseTime(db, uid, f)
	if err != nil {
		t.Fatalf("computeResponseTime: %v", err)
	}
	if res.Conversations != 2 {
		t.Errorf("conversations = %d, mau 2", res.Conversations)
	}
	if res.Replied != 1 || res.ReplyRate != 50 {
		t.Errorf("replied/replyRate = %d/%.1f, mau 1/50", res.Replied, res.ReplyRate)
	}
	if res.AvgFirstResponseS != 300 || res.MedFirstResponseS != 300 {
		t.Errorf("FRT avg/median = %.0f/%.0f, mau 300/300", res.AvgFirstResponseS, res.MedFirstResponseS)
	}
	if res.Buckets["5-15m"] != 1 {
		t.Errorf("bucket 5-15m = %d, mau 1 (buckets=%v)", res.Buckets["5-15m"], res.Buckets)
	}
	if res.Resolved != 1 {
		t.Errorf("resolved = %d, mau 1", res.Resolved)
	}
}

func ptrTime(t time.Time) *time.Time { return &t }
