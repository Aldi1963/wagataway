package worker

import (
	"fmt"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"gorm.io/gorm"
)

// Aktivasi antrean voucher (status 'scheduled' → 'active' saat jendela
// mulai, + sinkron users.plan). Lihat subscription_activation.go.

func seedActivationUser(t *testing.T, db *gorm.DB, uid uint, planSlug string) {
	t.Helper()
	u := models.User{
		ID:    uid,
		UUID:  fmt.Sprintf("00000000-0000-0000-0000-%012d", uid),
		Name:  fmt.Sprintf("Aktif %d", uid),
		Email: fmt.Sprintf("aktif-%d@test.local", uid),
		Plan:  planSlug,
	}
	if err := db.Where("id = ?", uid).FirstOrCreate(&u).Error; err != nil {
		t.Fatalf("seed user %d: %v", uid, err)
	}
	db.Model(&models.User{}).Where("id = ?", uid).Update("plan", planSlug)
}

func seedActivationPlan(t *testing.T, db *gorm.DB, slug, name string) models.Plan {
	t.Helper()
	p := models.Plan{Name: name, Slug: slug, Price: 66000, Duration: 30, IsActive: true}
	if err := db.Where("slug = ?", slug).FirstOrCreate(&p).Error; err != nil {
		t.Fatalf("seed plan %s: %v", slug, err)
	}
	return p
}

func seedActivationSub(t *testing.T, db *gorm.DB, uid, planID uint, status string, start, end time.Time, isTrial bool) models.Subscription {
	t.Helper()
	s := models.Subscription{UserID: uid, PlanID: planID, Status: status,
		StartDate: start, EndDate: end, IsTrial: isTrial}
	if err := db.Create(&s).Error; err != nil {
		t.Fatalf("seed subscription: %v", err)
	}
	return s
}

func cleanActivation(t *testing.T, db *gorm.DB, uid uint) {
	t.Helper()
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.Subscription{})
}

// TestActivateDueScheduled: antrean yang jendelanya sudah mulai dibalik ke
// 'active' + users.plan disinkronkan ke paket antrean; langganan 'active'
// lama yang jendelanya sudah lewat ditandai 'expired'.
func TestActivateDueScheduled(t *testing.T) {
	db := schedulerTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.Subscription{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(93001)
	cleanActivation(t, db, uid)
	lite := seedActivationPlan(t, db, "lite-aktif", "Lite Aktif")
	reg := seedActivationPlan(t, db, "regular-aktif", "Regular Aktif")
	seedActivationUser(t, db, uid, "lite-aktif")
	now := time.Now()
	// Langganan lama: aktif, berakhir 1 jam lalu.
	seedActivationSub(t, db, uid, lite.ID, "active", now.Add(-30*24*time.Hour), now.Add(-time.Hour), false)
	// Antrean: mulai 1 jam lalu (saat langganan lama berakhir), berakhir +30 hari.
	q := seedActivationSub(t, db, uid, reg.ID, "scheduled", now.Add(-time.Hour), now.Add(30*24*time.Hour), false)

	n, err := activateDueScheduledSubscriptions(db, now)
	if err != nil {
		t.Fatalf("activateDueScheduledSubscriptions: %v", err)
	}
	if n != 1 {
		t.Errorf("diaktifkan = %d, mau 1", n)
	}

	var sub models.Subscription
	if err := db.First(&sub, q.ID).Error; err != nil {
		t.Fatalf("baca antrean: %v", err)
	}
	if sub.Status != "active" {
		t.Errorf("status antrean = %q, mau active", sub.Status)
	}
	var u models.User
	db.First(&u, uid)
	if u.Plan != "regular-aktif" {
		t.Errorf("users.plan = %q, mau regular-aktif", u.Plan)
	}
	// Langganan lama yang lewat ditandai expired.
	var olds []models.Subscription
	db.Where("user_id = ? AND plan_id = ?", uid, lite.ID).Find(&olds)
	if len(olds) != 1 || olds[0].Status != "expired" {
		t.Errorf("langganan lama = %+v, mau 1 baris expired", olds)
	}

	// Idempoten: jalankan lagi — tidak ada lagi yang diaktifkan.
	n2, err := activateDueScheduledSubscriptions(db, now)
	if err != nil {
		t.Fatalf("aktivasi kedua: %v", err)
	}
	if n2 != 0 {
		t.Errorf("aktivasi kedua = %d, mau 0", n2)
	}
}

// TestActivateDueScheduledSkipsFuture: antrean yang jendelanya BELUM mulai
// tidak disentuh; antrean yang jendelanya sudah lewat seluruhnya langsung
// 'expired' (bukan 'active') dan users.plan tidak berubah.
func TestActivateDueScheduledSkipsFuture(t *testing.T) {
	db := schedulerTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.Subscription{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(93002)
	cleanActivation(t, db, uid)
	reg := seedActivationPlan(t, db, "regular-aktif", "Regular Aktif")
	seedActivationUser(t, db, uid, "free")
	now := time.Now()
	future := seedActivationSub(t, db, uid, reg.ID, "scheduled", now.Add(10*24*time.Hour), now.Add(40*24*time.Hour), false)
	past := seedActivationSub(t, db, uid, reg.ID, "scheduled", now.Add(-40*24*time.Hour), now.Add(-10*24*time.Hour), false)

	n, err := activateDueScheduledSubscriptions(db, now)
	if err != nil {
		t.Fatalf("activateDueScheduledSubscriptions: %v", err)
	}
	if n != 0 {
		t.Errorf("diaktifkan = %d, mau 0", n)
	}
	var f, p models.Subscription
	db.First(&f, future.ID)
	db.First(&p, past.ID)
	if f.Status != "scheduled" {
		t.Errorf("antrean masa depan status = %q, mau tetap scheduled", f.Status)
	}
	if p.Status != "expired" {
		t.Errorf("antrean yang sudah lewat status = %q, mau expired", p.Status)
	}
	var u models.User
	db.First(&u, uid)
	if u.Plan != "free" {
		t.Errorf("users.plan = %q, mau tetap free", u.Plan)
	}
}
