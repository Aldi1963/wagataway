// Unit test Fitur 7 (Trial 7 hari otomatis): guard sekali-per-user pada
// createTrialSubscription.
//
// DB-backed (postgres test; skip bila tidak tersedia), mengikuti pola
// testSubDB di paket subscription.
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

func trialTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL tidak diset — lewati test trial")
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
	if err := db.AutoMigrate(&models.Plan{}, &models.User{}, &models.Subscription{}); err != nil {
		t.Fatalf("AutoMigrate gagal: %v", err)
	}
	return db
}

func seedTrialLitePlan(t *testing.T, db *gorm.DB) models.Plan {
	t.Helper()
	var plan models.Plan
	if err := db.Where("slug = ?", trialPlanSlug).First(&plan).Error; err == nil {
		return plan
	}
	plan = models.Plan{
		Name:              "Lite",
		Slug:              trialPlanSlug,
		Price:             25000,
		Duration:          30,
		MonthlyMessageLimit: 15000,
		IsActive:          true,
	}
	if err := db.Create(&plan).Error; err != nil {
		t.Fatalf("gagal seed paket lite: %v", err)
	}
	return plan
}

func makeTrialTestUser(t *testing.T, db *gorm.DB, tag string) models.User {
	t.Helper()
	user := models.User{
		Name:     "Trial Test " + tag,
		Email:    fmt.Sprintf("trial7-%s-%d@example.com", tag, time.Now().UnixNano()),
                Password: "hashed-dummy",
		Role:     "user",
		Plan:     "free",
		Status:   "active",
		Timezone: "Asia/Jakarta",
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("gagal buat user test: %v", err)
	}
	return user
}

func cleanupTrialTest(t *testing.T, db *gorm.DB, userID uint) {
	t.Helper()
	db.Where("user_id = ?", userID).Delete(&models.Subscription{})
	db.Delete(&models.User{}, userID)
}

// User baru tanpa subscription apapun → trial Lite 7 hari dibuat.
func TestCreateTrialSubscription_NewUser(t *testing.T) {
	db := trialTestDB(t)
	plan := seedTrialLitePlan(t, db)
	user := makeTrialTestUser(t, db, "new")
	defer cleanupTrialTest(t, db, user.ID)

	before := time.Now()
	if !createTrialSubscription(db, &user) {
		t.Fatal("trial tidak dibuat untuk user baru")
	}

	var sub models.Subscription
	if err := db.Where("user_id = ?", user.ID).First(&sub).Error; err != nil {
		t.Fatalf("subscription trial tidak ditemukan: %v", err)
	}
	if !sub.IsTrial {
		t.Error("is_trial = false, want true")
	}
	if sub.PlanID != plan.ID {
		t.Errorf("plan_id = %d, want %d (lite)", sub.PlanID, plan.ID)
	}
	if sub.Status != "active" {
		t.Errorf("status = %q, want active", sub.Status)
	}
	// end_date ≈ start + 7 hari kalender.
	if got := sub.EndDate.Sub(sub.StartDate); got < 7*24*time.Hour-time.Minute || got > 7*24*time.Hour+time.Minute {
		t.Errorf("durasi trial = %v, want ±7 hari", got)
	}
	if sub.StartDate.Before(before.Add(-time.Minute)) || sub.StartDate.After(time.Now().Add(time.Minute)) {
		t.Errorf("start_date = %v, want ≈ now", sub.StartDate)
	}
	// Kolom plan user disinkron ke paket trial.
	var u models.User
	db.First(&u, user.ID)
	if u.Plan != trialPlanSlug {
		t.Errorf("user.plan = %q, want %q", u.Plan, trialPlanSlug)
	}
}

// Guard: user yang sudah punya subscription (mis. expired berbayar) →
// trial TIDAK dibuat lagi (sekali per user).
func TestCreateTrialSubscription_GuardOnce(t *testing.T) {
	db := trialTestDB(t)
	plan := seedTrialLitePlan(t, db)
	user := makeTrialTestUser(t, db, "guard")
	defer cleanupTrialTest(t, db, user.ID)

	now := time.Now()
	existing := models.Subscription{
		UserID:    user.ID,
		PlanID:    plan.ID,
		Status:    "expired",
		IsTrial:   false,
		StartDate: now.AddDate(0, 0, -60),
		EndDate:   now.AddDate(0, 0, -30),
	}
	if err := db.Create(&existing).Error; err != nil {
		t.Fatalf("gagal buat subscription lama: %v", err)
	}

	if createTrialSubscription(db, &user) {
		t.Fatal("trial dibuat padahal user sudah punya subscription — guard gagal")
	}
	var count int64
	db.Model(&models.Subscription{}).Where("user_id = ?", user.ID).Count(&count)
	if count != 1 {
		t.Fatalf("jumlah subscription = %d, want 1 (tidak ada trial ganda)", count)
	}
}

// Guard: pemanggilan ganda berurutan (simulasi double submit setelah
// subscription pertama terbuat) → hanya satu trial.
func TestCreateTrialSubscription_DoubleCall(t *testing.T) {
	db := trialTestDB(t)
	seedTrialLitePlan(t, db)
	user := makeTrialTestUser(t, db, "double")
	defer cleanupTrialTest(t, db, user.ID)

	if !createTrialSubscription(db, &user) {
		t.Fatal("panggilan pertama tidak membuat trial")
	}
	if createTrialSubscription(db, &user) {
		t.Fatal("panggilan kedua membuat trial ganda — guard gagal")
	}
	var count int64
	db.Model(&models.Subscription{}).Where("user_id = ?", user.ID).Count(&count)
	if count != 1 {
		t.Fatalf("jumlah subscription = %d, want 1", count)
	}
}
