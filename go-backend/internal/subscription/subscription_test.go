package subscription

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

// ── Pure tests (tanpa DB) ──────────────────────────────────────────────────

func TestGraceRemaining(t *testing.T) {
	s := &Status{State: StateGrace, GraceLimit: 20, GraceUsed: 7}
	if got := s.GraceRemaining(); got != 13 {
		t.Errorf("GraceRemaining = %d, want 13", got)
	}
	s = &Status{State: StateGrace, GraceLimit: 20, GraceUsed: 25}
	if got := s.GraceRemaining(); got != 0 {
		t.Errorf("GraceRemaining floor = %d, want 0", got)
	}
	s = &Status{State: StateActive, GraceLimit: 20, GraceUsed: 0}
	if got := s.GraceRemaining(); got != 0 {
		t.Errorf("GraceRemaining non-grace = %d, want 0", got)
	}
}

// ── DB-backed tests (postgres test; skip bila tidak tersedia) ─────────────

func testSubDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL tidak diset — lewati test DB grace period")
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
	if err != nil {
		t.Skipf("gagal ambil sql.DB: %v", err)
	}
	if err := sqlDB.Ping(); err != nil {
		t.Skipf("postgres test tidak terjangkau: %v", err)
	}
	if err := db.AutoMigrate(&models.Plan{}, &models.User{}, &models.Subscription{}, &models.Message{}); err != nil {
		t.Fatalf("AutoMigrate gagal: %v", err)
	}
	return db
}

func mkUser(t *testing.T, db *gorm.DB) uint {
	t.Helper()
	u := models.User{
		Name:  "Grace Test",
		Email: fmt.Sprintf("grace-test-%d@t.local", time.Now().UnixNano()),
	}
	if err := db.Create(&u).Error; err != nil {
		t.Fatalf("seed user: %v", err)
	}
	dev := models.Device{UserID: u.ID, Name: "test"}
	if err := db.Create(&dev).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}
	return u.ID
}

func mkSub(t *testing.T, db *gorm.DB, userID uint, endOffset time.Duration, trial bool) {
	t.Helper()
	now := time.Now()
	sub := models.Subscription{
		UserID:    userID,
		PlanID:    1, // dummy plan id; tidak dipakai Check kecuali Plan.Name
		Status:    "active",
		StartDate: now.Add(-30 * 24 * time.Hour),
		EndDate:   now.Add(endOffset),
		IsTrial:   trial,
	}
	if err := db.Create(&sub).Error; err != nil {
		t.Fatalf("seed subscription: %v", err)
	}
}

func TestCheckActive(t *testing.T) {
	db := testSubDB(t)
	uid := mkUser(t, db)
	mkSub(t, db, uid, 24*time.Hour, false) // expired besok
	st, err := Check(db, uid)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if st.State != StateActive {
		t.Errorf("State = %q, want active", st.State)
	}
}

func TestCheckNoSubscription(t *testing.T) {
	db := testSubDB(t)
	uid := mkUser(t, db) // tanpa langganan sama sekali
	st, err := Check(db, uid)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if st.State != StateActive || st.HasSubscription {
		t.Errorf("State = %q HasSubscription = %v, want active/false", st.State, st.HasSubscription)
	}
}

func TestCheckGrace(t *testing.T) {
	db := testSubDB(t)
	uid := mkUser(t, db)
	mkSub(t, db, uid, -48*time.Hour, false) // expired 2 hari lalu
	st, err := Check(db, uid)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if st.State != StateGrace {
		t.Fatalf("State = %q, want grace", st.State)
	}
	if st.GraceDaysLeft != 1 {
		t.Errorf("GraceDaysLeft = %d, want 1 (72h - 48h = 24h)", st.GraceDaysLeft)
	}
	if st.GraceLimit != GraceDailyLimit {
		t.Errorf("GraceLimit = %d, want %d", st.GraceLimit, GraceDailyLimit)
	}
}

func TestCheckExpiredBoundary(t *testing.T) {
	db := testSubDB(t)
	// 71 jam yang lalu → masih grace (batas 72 jam).
	uid := mkUser(t, db)
	mkSub(t, db, uid, -71*time.Hour, false)
	st, err := Check(db, uid)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if st.State != StateGrace {
		t.Errorf("71h: State = %q, want grace", st.State)
	}
	// 73 jam yang lalu → expired (>= 72 jam).
	uid2 := mkUser(t, db)
	mkSub(t, db, uid2, -73*time.Hour, false)
	st2, err := Check(db, uid2)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if st2.State != StateExpired {
		t.Errorf("73h: State = %q, want expired", st2.State)
	}
}

func TestCheckTrialGrace(t *testing.T) {
	db := testSubDB(t)
	uid := mkUser(t, db)
	mkSub(t, db, uid, -24*time.Hour, true) // trial expired kemarin
	st, err := Check(db, uid)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if st.State != StateGrace || !st.IsTrial {
		t.Errorf("State = %q IsTrial = %v, want grace/true", st.State, st.IsTrial)
	}
}

func TestGraceDailyUsageCounted(t *testing.T) {
	db := testSubDB(t)
	uid := mkUser(t, db)
	mkSub(t, db, uid, -24*time.Hour, false) // grace
	now := time.Now()
	var dev models.Device
	if err := db.Where("user_id = ?", uid).First(&dev).Error; err != nil {
		t.Fatalf("device fixture: %v", err)
	}
	// 3 pesan hari ini (2 counted: sent + delivered; failed tidak dihitung)
	msgs := []models.Message{
		{UserID: uid, DeviceID: dev.ID, To: "6280000000000", Direction: "outgoing", Status: "sent", CreatedAt: now},
		{UserID: uid, DeviceID: dev.ID, To: "6280000000000", Direction: "outgoing", Status: "delivered", CreatedAt: now},
		{UserID: uid, DeviceID: dev.ID, To: "6280000000000", Direction: "outgoing", Status: "failed", CreatedAt: now},
		// pesan kemarin tidak dihitung
		{UserID: uid, DeviceID: dev.ID, To: "6280000000000", Direction: "outgoing", Status: "sent", CreatedAt: now.Add(-25 * time.Hour)},
	}
	for i := range msgs {
		if err := db.Create(&msgs[i]).Error; err != nil {
			t.Fatalf("seed message: %v", err)
		}
	}
	st, err := Check(db, uid)
	if err != nil {
		t.Fatalf("Check: %v", err)
	}
	if st.GraceUsed != 2 {
		t.Errorf("GraceUsed = %d, want 2", st.GraceUsed)
	}
}
