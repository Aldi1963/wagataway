package quota

import (
	"errors"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// ── Pure unit tests (tanpa DB) ─────────────────────────────────────────────

func TestPercent(t *testing.T) {
	r := &Result{Used: 80, Limit: 100}
	if got := r.Percent(); got != 80 {
		t.Errorf("Percent = %d, want 80", got)
	}
	r = &Result{Used: 150, Limit: 100}
	if got := r.Percent(); got != 100 {
		t.Errorf("Percent capped = %d, want 100", got)
	}
	r = &Result{Used: 999, Limit: 0, Unlimited: true}
	if got := r.Percent(); got != 0 {
		t.Errorf("Percent unlimited = %d, want 0", got)
	}
}

func TestRemaining(t *testing.T) {
	r := &Result{Used: 30, Limit: 100}
	if got := r.Remaining(); got != 70 {
		t.Errorf("Remaining = %d, want 70", got)
	}
	r = &Result{Used: 150, Limit: 100}
	if got := r.Remaining(); got != 0 {
		t.Errorf("Remaining floor = %d, want 0", got)
	}
	r = &Result{Used: 5, Limit: 0, Unlimited: true}
	if got := r.Remaining(); got != -1 {
		t.Errorf("Remaining unlimited = %d, want -1", got)
	}
}

func TestExceededMessage(t *testing.T) {
	r := &Result{PlanName: "Lite", Used: 15000, Limit: 15000}
	msg := ExceededMessage(r)
	want := "Kuota pesan paket Lite habis (15000/15000). Perpanjang/upgrade paket untuk menambah kuota."
	if msg != want {
		t.Errorf("ExceededMessage = %q, want %q", msg, want)
	}
}

func TestIsExceeded(t *testing.T) {
	e := &ExceededError{Info: &Result{PlanName: "Free", Used: 3000, Limit: 3000}}
	if !IsExceeded(e) {
		t.Error("IsExceeded(ExceededError) = false, want true")
	}
	if !errors.Is(e, ErrExceeded) {
		t.Error("ExceededError tidak unwrap ke ErrExceeded")
	}
	if IsExceeded(errors.New("device tidak terhubung")) {
		t.Error("IsExceeded(error biasa) = true, want false")
	}
}

// ── DB-backed tests (postgres test; skip bila tidak tersedia) ─────────────

func testDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL tidak diset — lewati test DB kuota")
	}
	// Pakai database khusus test agar tidak mengganggu data live.
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
	if err != nil {
		t.Skipf("gagal ambil sql.DB: %v", err)
	}
	if err := sqlDB.Ping(); err != nil {
		t.Skipf("postgres test tidak terjangkau: %v", err)
	}
	if err := db.AutoMigrate(&models.Plan{}, &models.User{}, &models.Subscription{}, &models.Device{}, &models.Message{}); err != nil {
		t.Fatalf("AutoMigrate gagal: %v", err)
	}
	return db
}

// seedQuotaFixtures menyiapkan paket + user + device. Mengembalikan deviceID
// per user agar FK messages terpenuhi.
func seedQuotaFixtures(t *testing.T, db *gorm.DB) (userFree, userLite, userMaster, userTrial, userNoSub uint, devOf map[uint]uint) {
	t.Helper()
	db.Exec("TRUNCATE plans, users, subscriptions, devices, messages RESTART IDENTITY CASCADE")
	plans := []models.Plan{
		{Name: "Free", Slug: "free", MonthlyMessageLimit: 3000},
		{Name: "Lite", Slug: "lite", MonthlyMessageLimit: 15000},
		{Name: "Master", Slug: "master", MonthlyMessageLimit: 0},
	}
	for i := range plans {
		if err := db.Create(&plans[i]).Error; err != nil {
			t.Fatalf("seed plan: %v", err)
		}
	}
	mkUser := func() uint {
		// Email harus unik per user: tambah nanos + counter.
		u := models.User{
			Name:  "Kuota Test",
			Email: "kuota-test-" + randomSuffix() + "@t.local",
		}
		if err := db.Create(&u).Error; err != nil {
			t.Fatalf("seed user: %v", err)
		}
		return u.ID
	}
	mkSub := func(uid, pid uint, trial bool) {
		now := time.Now()
		sub := models.Subscription{UserID: uid, PlanID: pid, Status: "active",
			StartDate: now, EndDate: now.AddDate(0, 1, 0), IsTrial: trial}
		if err := db.Create(&sub).Error; err != nil {
			t.Fatalf("seed sub: %v", err)
		}
	}
	userFree, userLite, userMaster, userTrial, userNoSub = mkUser(), mkUser(), mkUser(), mkUser(), mkUser()
	mkSub(userFree, plans[0].ID, false)
	mkSub(userLite, plans[1].ID, false)
	mkSub(userMaster, plans[2].ID, false)
	mkSub(userTrial, plans[1].ID, true) // trial di atas paket Lite
	devOf = map[uint]uint{}
	for _, uid := range []uint{userFree, userLite, userMaster, userTrial, userNoSub} {
		d := models.Device{UserID: uid, Name: "Test Device", Phone: "6280000000000", Status: "disconnected"}
		if err := db.Create(&d).Error; err != nil {
			t.Fatalf("seed device: %v", err)
		}
		devOf[uid] = d.ID
	}
	return userFree, userLite, userMaster, userTrial, userNoSub, devOf
}

var suffixN int64

func randomSuffix() string {
	suffixN++
	return strings.Replace(time.Now().Format("150405.000000000"), ".", "", -1) + string(rune('a'+suffixN%26))
}

// addMessages menyisipkan n pesan outgoing bulan berjalan dengan status s.
func addMessages(t *testing.T, db *gorm.DB, uid uint, n int, status string, monthOffset int) {
	t.Helper()
	var dev models.Device
	if err := db.Where("user_id = ?", uid).First(&dev).Error; err != nil {
		t.Fatalf("device fixture: %v", err)
	}
	now := time.Now()
	base := time.Date(now.Year(), now.Month(), 1, 12, 0, 0, 0, now.Location()).AddDate(0, monthOffset, 0)
	msgs := make([]models.Message, 0, n)
	for i := 0; i < n; i++ {
		msgs = append(msgs, models.Message{UserID: uid, DeviceID: dev.ID, To: "6280000000000",
			Type: "text", Content: "x", Direction: "outgoing", Status: status,
			CreatedAt: base.Add(time.Duration(i) * time.Second)})
	}
	if err := db.CreateInBatches(msgs, 500).Error; err != nil {
		t.Fatalf("seed message: %v", err)
	}
}

func TestCheckCountingSemantics(t *testing.T) {
	db := testDB(t)
	uFree, _, _, _, _, _ := seedQuotaFixtures(t, db)

	// Hanya sent/delivered/read bulan berjalan yang dihitung.
	addMessages(t, db, uFree, 5, "sent", 0)
	addMessages(t, db, uFree, 3, "delivered", 0)
	addMessages(t, db, uFree, 2, "read", 0)
	addMessages(t, db, uFree, 10, "failed", 0)   // tidak dihitung
	addMessages(t, db, uFree, 7, "pending", 0)   // tidak dihitung
	addMessages(t, db, uFree, 20, "sent", -1)    // bulan lalu: tidak dihitung

	used, err := Usage(db, uFree)
	if err != nil {
		t.Fatalf("Usage: %v", err)
	}
	if used != 10 {
		t.Errorf("Usage = %d, want 10 (5 sent + 3 delivered + 2 read)", used)
	}
}

func TestCheckAllowedAndWarning(t *testing.T) {
	db := testDB(t)
	uFree, _, _, _, _, _ := seedQuotaFixtures(t, db)

	qr, err := Check(db, uFree)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if qr.PlanName != "Free" || qr.Limit != 3000 || qr.Unlimited {
		t.Errorf("plan salah: %+v", qr)
	}
	if !qr.Allowed {
		t.Error("kuota kosong seharusnya Allowed")
	}
	if qr.Warning {
		t.Error("pemakaian 0 seharusnya belum Warning")
	}

	// 80% tepat -> warning menyala.
	addMessages(t, db, uFree, 2400, "sent", 0)
	qr, _ = Check(db, uFree)
	if !qr.Warning {
		t.Error("pemakaian 2400/3000 (80%) seharusnya Warning=true")
	}
	if qr.Percent() != 80 {
		t.Errorf("Percent = %d, want 80", qr.Percent())
	}
	if !qr.Allowed {
		t.Error("2400/3000 seharusnya masih Allowed")
	}

	// Habis -> diblokir.
	addMessages(t, db, uFree, 600, "sent", 0)
	qr, _ = Check(db, uFree)
	if qr.Allowed {
		t.Errorf("3000/3000 seharusnya tidak Allowed (used=%d)", qr.Used)
	}
	if !strings.Contains(ExceededMessage(qr), "paket Free habis (3000/3000)") {
		t.Errorf("pesan penolakan salah: %q", ExceededMessage(qr))
	}
}

func TestCheckUnlimited(t *testing.T) {
	db := testDB(t)
	_, _, uMaster, _, _, _ := seedQuotaFixtures(t, db)
	addMessages(t, db, uMaster, 50, "sent", 0)
	qr, err := Check(db, uMaster)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if !qr.Unlimited || !qr.Allowed || qr.Warning {
		t.Errorf("master seharusnya unlimited: %+v", qr)
	}
	if qr.Remaining() != -1 {
		t.Errorf("Remaining unlimited = %d, want -1", qr.Remaining())
	}
}

func TestCheckTrial(t *testing.T) {
	db := testDB(t)
	_, _, _, uTrial, _, _ := seedQuotaFixtures(t, db)
	qr, err := Check(db, uTrial)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if !qr.IsTrial {
		t.Error("seharusnya terdeteksi trial")
	}
	if qr.Limit != TrialMonthlyLimit {
		t.Errorf("limit trial = %d, want %d", qr.Limit, TrialMonthlyLimit)
	}
}

func TestCheckNoSubscriptionFallback(t *testing.T) {
	db := testDB(t)
	_, _, _, _, uNoSub, _ := seedQuotaFixtures(t, db)
	qr, err := Check(db, uNoSub)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if qr.Limit != 3000 || qr.PlanName != "Free" {
		t.Errorf("tanpa langganan seharusnya fallback Free/3000: %+v", qr)
	}
	if !qr.Allowed {
		t.Error("user baru tanpa pemakaian seharusnya Allowed")
	}
}

func TestCheckNBulk(t *testing.T) {
	db := testDB(t)
	uFree, _, _, _, _, _ := seedQuotaFixtures(t, db)
	addMessages(t, db, uFree, 2990, "sent", 0)

	// Sisa 10: bulk 10 pesan lolos, 11 ditolak.
	qr, _ := CheckN(db, uFree, 10)
	if !qr.Allowed {
		t.Error("2990+10=3000 seharusnya Allowed")
	}
	qr, _ = CheckN(db, uFree, 11)
	if qr.Allowed {
		t.Error("2990+11=3001 seharusnya ditolak")
	}
}

func TestBackfillDefaults(t *testing.T) {
	db := testDB(t)
	db.Exec("TRUNCATE plans RESTART IDENTITY CASCADE")
	for _, p := range []models.Plan{
		{Name: "Free", Slug: "free"},
		{Name: "Master", Slug: "master"},
		{Name: "Custom", Slug: "custom", MonthlyMessageLimit: 777},
	} {
		if err := db.Create(&p).Error; err != nil {
			t.Fatalf("seed: %v", err)
		}
	}
	if err := BackfillDefaults(db); err != nil {
		t.Fatalf("BackfillDefaults: %v", err)
	}
	var free, master, custom models.Plan
	db.Where("slug=?", "free").First(&free)
	db.Where("slug=?", "master").First(&master)
	db.Where("slug=?", "custom").First(&custom)
	if free.MonthlyMessageLimit != 3000 {
		t.Errorf("free = %d, want 3000", free.MonthlyMessageLimit)
	}
	if master.MonthlyMessageLimit != 0 {
		t.Errorf("master = %d, want 0 (unlimited)", master.MonthlyMessageLimit)
	}
	if custom.MonthlyMessageLimit != 777 {
		t.Errorf("custom kustom tertimpa: %d, want 777", custom.MonthlyMessageLimit)
	}
}

// ── Fitur 5: grace period 3 hari terintegrasi di gate kuota ────────────────

// mkGraceUser membuat user dengan langganan Lite yang berakhir endOffset
// dari sekarang (negatif = sudah expired).
func mkGraceUser(t *testing.T, db *gorm.DB, endOffset time.Duration) uint {
	t.Helper()
	u := models.User{Name: "Grace Gate", Email: "grace-gate-" + randomSuffix() + "@t.local"}
	if err := db.Create(&u).Error; err != nil {
		t.Fatalf("seed user: %v", err)
	}
	var lite models.Plan
	if err := db.Where("slug = ?", "lite").First(&lite).Error; err != nil {
		t.Fatalf("plan lite: %v", err)
	}
	now := time.Now()
	sub := models.Subscription{UserID: u.ID, PlanID: lite.ID, Status: "active",
		StartDate: now.Add(-60 * 24 * time.Hour), EndDate: now.Add(endOffset)}
	if err := db.Create(&sub).Error; err != nil {
		t.Fatalf("seed sub: %v", err)
	}
	d := models.Device{UserID: u.ID, Name: "Test Device", Phone: "6280000000000", Status: "disconnected"}
	if err := db.Create(&d).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}
	return u.ID
}

// addTodayMessages menyisipkan n pesan outgoing HARI INI (untuk hitungan grace).
func addTodayMessages(t *testing.T, db *gorm.DB, uid uint, n int, status string) {
	t.Helper()
	var dev models.Device
	if err := db.Where("user_id = ?", uid).First(&dev).Error; err != nil {
		t.Fatalf("device fixture: %v", err)
	}
	now := time.Now()
	msgs := make([]models.Message, 0, n)
	for i := 0; i < n; i++ {
		msgs = append(msgs, models.Message{UserID: uid, DeviceID: dev.ID, To: "6280000000000",
			Type: "text", Content: "x", Direction: "outgoing", Status: status,
			CreatedAt: now.Add(time.Duration(i) * time.Second)})
	}
	if err := db.CreateInBatches(msgs, 500).Error; err != nil {
		t.Fatalf("seed message: %v", err)
	}
}

func TestCheckGraceDailyLimit(t *testing.T) {
	db := testDB(t)
	_, _, _, _, _, _ = seedQuotaFixtures(t, db)
	uid := mkGraceUser(t, db, -24*time.Hour) // expired kemarin → grace
	addTodayMessages(t, db, uid, 19, "sent")

	qr, err := CheckN(db, uid, 1)
	if err != nil {
		t.Fatalf("CheckN: %v", err)
	}
	if !qr.Allowed {
		t.Error("19+1=20 dalam grace seharusnya Allowed")
	}
	if qr.SubState != "grace" {
		t.Errorf("SubState = %q, want grace", qr.SubState)
	}
	if qr.SubGraceDaysLeft != 2 {
		t.Errorf("SubGraceDaysLeft = %d, want 2", qr.SubGraceDaysLeft)
	}

	// 19+2=21 > 20 → ditolak dengan code SUBSCRIPTION_GRACE_LIMIT.
	qr, err = CheckN(db, uid, 2)
	if err != nil {
		t.Fatalf("CheckN: %v", err)
	}
	if qr.Allowed {
		t.Error("19+2=21 dalam grace seharusnya ditolak")
	}
	if !qr.SubGraceBlocked || qr.Code() != "SUBSCRIPTION_GRACE_LIMIT" {
		t.Errorf("SubGraceBlocked=%v Code=%q, want true/SUBSCRIPTION_GRACE_LIMIT", qr.SubGraceBlocked, qr.Code())
	}
	msg := ExceededMessage(qr)
	if want := "Masa tenggang"; !strings.Contains(msg, want) {
		t.Errorf("pesan %q tidak mengandung %q", msg, want)
	}
}

func TestCheckExpiredBlocked(t *testing.T) {
	db := testDB(t)
	_, _, _, _, _, _ = seedQuotaFixtures(t, db)
	uid := mkGraceUser(t, db, -5*24*time.Hour) // expired 5 hari lalu

	qr, err := CheckN(db, uid, 1)
	if err != nil {
		t.Fatalf("CheckN: %v", err)
	}
	if qr.Allowed {
		t.Error("expired >= 3 hari seharusnya diblokir")
	}
	if !qr.SubExpired || qr.SubState != "expired" || qr.Code() != "SUBSCRIPTION_EXPIRED" {
		t.Errorf("SubExpired=%v SubState=%q Code=%q, want true/expired/SUBSCRIPTION_EXPIRED",
			qr.SubExpired, qr.SubState, qr.Code())
	}
	want := "Langganan berakhir. Perpanjang di https://wa.clipku.com/billing"
	if msg := ExceededMessage(qr); msg != want {
		t.Errorf("pesan = %q, want %q", msg, want)
	}
}

func TestCheckActiveSubscriptionUnaffected(t *testing.T) {
	db := testDB(t)
	_, userLite, _, _, _, _ := seedQuotaFixtures(t, db)
	// Langganan aktif, 0 pesan → tidak terblokir, SubState active.
	qr, err := CheckN(db, userLite, 1)
	if err != nil {
		t.Fatalf("CheckN: %v", err)
	}
	if !qr.Allowed || qr.SubState != "active" {
		t.Errorf("Allowed=%v SubState=%q, want true/active", qr.Allowed, qr.SubState)
	}
	if qr.SubExpired || qr.SubGraceBlocked {
		t.Error("user aktif tidak boleh kena flag expired/grace")
	}
}
