package handler

import (
	"fmt"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/quota"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/subscription"
	"gorm.io/gorm"
)

// Voucher MEMPERPANJANG / MENGANTRE (keputusan user 11 Nov 2026):
// tukar saat ada langganan aktif → langganan baru mulai di ends_at lama
// (status 'scheduled'), langganan lama tetap aktif; tukar berkali-kali →
// mengantre berurutan; tanpa langganan aktif → mulai sekarang seperti dulu.
// Selama mengantre, paket & kuota yang tampil tetap paket lama.

func mkQueuePlan(t *testing.T, db *gorm.DB, slug, name string, limit int) models.Plan {
	t.Helper()
	p := models.Plan{Name: name, Slug: slug, Price: 66000, Duration: 30,
		MonthlyMessageLimit: limit, IsActive: true}
	if err := db.Where("slug = ?", slug).FirstOrCreate(&p).Error; err != nil {
		t.Fatalf("seed plan %s: %v", slug, err)
	}
	return p
}

func mkQueueUser(t *testing.T, db *gorm.DB, uid uint, planSlug string) {
	t.Helper()
	u := models.User{
		ID:    uid,
		UUID:  fmt.Sprintf("00000000-0000-0000-0000-%012d", uid),
		Name:  fmt.Sprintf("Queue %d", uid),
		Email: fmt.Sprintf("queue-%d@test.local", uid),
		Plan:  planSlug,
	}
	if err := db.Where("id = ?", uid).FirstOrCreate(&u).Error; err != nil {
		t.Fatalf("seed user %d: %v", uid, err)
	}
	// FirstOrCreate tidak menimpa Plan bila user sudah ada dari run lalu.
	db.Model(&models.User{}).Where("id = ?", uid).Update("plan", planSlug)
}

func mkQueueVoucher(t *testing.T, db *gorm.DB, code string, planID uint, duration, maxUses int) models.Voucher {
	t.Helper()
	db.Unscoped().Where("code = ?", code).Delete(&models.Voucher{})
	v := models.Voucher{Code: code, Type: "plan", PlanID: &planID,
		Duration: duration, MaxUses: maxUses, UsedCount: 0, IsActive: true}
	if err := db.Create(&v).Error; err != nil {
		t.Fatalf("seed voucher %s: %v", code, err)
	}
	return v
}

func mkQueueSub(t *testing.T, db *gorm.DB, uid, planID uint, status string, start, end time.Time, isTrial bool) models.Subscription {
	t.Helper()
	s := models.Subscription{UserID: uid, PlanID: planID, Status: status,
		StartDate: start, EndDate: end, IsTrial: isTrial}
	if err := db.Create(&s).Error; err != nil {
		t.Fatalf("seed subscription: %v", err)
	}
	return s
}

func queueClean(t *testing.T, db *gorm.DB, uid uint) {
	t.Helper()
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.VoucherRedemption{})
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.Subscription{})
}

// within: dua waktu dianggap sama bila selisihnya <= toleransi (menutup
// pembulatan timestamptz Postgres ke mikrodetik).
func within(t *testing.T, got, want time.Time, tol time.Duration) {
	t.Helper()
	d := got.Sub(want)
	if d < 0 {
		d = -d
	}
	if d > tol {
		t.Errorf("waktu = %v, mau %v (selisih %v > %v)", got, want, d, tol)
	}
}

func redeemQueueVoucher(t *testing.T, db *gorm.DB, uid uint, v models.Voucher, plan models.Plan, duration int, isTrial bool, now time.Time) (time.Time, time.Time) {
	t.Helper()
	udb := rls.Scoped(db, uid)
	var startsAt, endsAt time.Time
	err := udb.Transaction(func(tx *gorm.DB) error {
		var err error
		startsAt, endsAt, err = redeemVoucherTx(tx, uid, &v, plan, duration, isTrial, now)
		return err
	})
	if err != nil {
		t.Fatalf("redeemVoucherTx: %v", err)
	}
	return startsAt, endsAt
}

// TestGrantVoucherQueuesWhenActive: langganan Lite aktif sampai +10 hari;
// tukar voucher Regular 30 hari → langganan baru mulai tepat di ends_at
// lama, berakhir +30 hari sesudahnya, status 'scheduled'; langganan lama
// tetap 'active' dan users.plan tetap "lite".
func TestGrantVoucherQueuesWhenActive(t *testing.T) {
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.Voucher{},
		&models.VoucherRedemption{}, &models.Subscription{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(92001)
	queueClean(t, db, uid)
	lite := mkQueuePlan(t, db, "lite-queue", "Lite Queue", 15000)
	reg := mkQueuePlan(t, db, "regular-queue", "Regular Queue", 100000)
	mkQueueUser(t, db, uid, "lite-queue")
	now := time.Now()
	oldEnd := now.Add(10 * 24 * time.Hour)
	mkQueueSub(t, db, uid, lite.ID, "active", now.Add(-20*24*time.Hour), oldEnd, false)

	v := mkQueueVoucher(t, db, "QUEUE-AKTIF", reg.ID, 30, 10)
	startsAt, endsAt := redeemQueueVoucher(t, db, uid, v, reg, 30, false, now)
	within(t, startsAt, oldEnd, time.Second)
	within(t, endsAt, oldEnd.AddDate(0, 0, 30), time.Second)

	var subs []models.Subscription
	db.Where("user_id = ?", uid).Order("start_date ASC").Find(&subs)
	if len(subs) != 2 {
		t.Fatalf("langganan = %d, mau 2", len(subs))
	}
	if subs[0].Status != "active" {
		t.Errorf("langganan lama status = %q, mau active (tidak dinonaktifkan)", subs[0].Status)
	}
	within(t, subs[0].EndDate, oldEnd, time.Second)
	if subs[1].Status != "scheduled" {
		t.Errorf("langganan baru status = %q, mau scheduled", subs[1].Status)
	}
	within(t, subs[1].StartDate, oldEnd, time.Second)
	within(t, subs[1].EndDate, oldEnd.AddDate(0, 0, 30), time.Second)

	var u models.User
	db.First(&u, uid)
	if u.Plan != "lite-queue" {
		t.Errorf("users.plan = %q, mau lite-queue (paket lama selama antre)", u.Plan)
	}
}

// TestGrantVoucherQueuesSequentially: tukar 2 voucher saat langganan aktif
// → voucher kedua mulai di ends_at voucher PERTAMA (bukan di ends_at
// langganan aktif saja); keduanya 'scheduled', berurutan tanpa tumpang tindih.
func TestGrantVoucherQueuesSequentially(t *testing.T) {
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.Voucher{},
		&models.VoucherRedemption{}, &models.Subscription{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(92002)
	queueClean(t, db, uid)
	lite := mkQueuePlan(t, db, "lite-queue", "Lite Queue", 15000)
	reg := mkQueuePlan(t, db, "regular-queue", "Regular Queue", 100000)
	pro := mkQueuePlan(t, db, "pro-queue", "Pro Queue", 300000)
	mkQueueUser(t, db, uid, "lite-queue")
	now := time.Now()
	oldEnd := now.Add(10 * 24 * time.Hour)
	mkQueueSub(t, db, uid, lite.ID, "active", now.Add(-20*24*time.Hour), oldEnd, false)

	v1 := mkQueueVoucher(t, db, "QUEUE-SEQ1", reg.ID, 30, 10)
	s1, e1 := redeemQueueVoucher(t, db, uid, v1, reg, 30, false, now)
	within(t, s1, oldEnd, time.Second)
	within(t, e1, oldEnd.AddDate(0, 0, 30), time.Second)

	// Voucher kedua: trial 7 hari — tetap mengantre di belakang yang pertama.
	v2 := mkQueueVoucher(t, db, "QUEUE-SEQ2", pro.ID, 7, 10)
	s2, e2 := redeemQueueVoucher(t, db, uid, v2, pro, 7, true, now)
	within(t, s2, e1, time.Second)
	within(t, e2, e1.AddDate(0, 0, 7), time.Second)

	var subs []models.Subscription
	db.Where("user_id = ?", uid).Order("start_date ASC").Find(&subs)
	if len(subs) != 3 {
		t.Fatalf("langganan = %d, mau 3", len(subs))
	}
	if subs[1].Status != "scheduled" || subs[2].Status != "scheduled" {
		t.Errorf("status antrean = %q/%q, mau scheduled/scheduled", subs[1].Status, subs[2].Status)
	}
	if !subs[2].StartDate.After(subs[1].StartDate) || !subs[2].EndDate.After(subs[1].EndDate) {
		t.Errorf("antrean tidak berurutan: %+v", subs)
	}
	var u models.User
	db.First(&u, uid)
	if u.Plan != "lite-queue" {
		t.Errorf("users.plan = %q, mau lite-queue", u.Plan)
	}
}

// TestGrantVoucherStartsNowWithoutActive: tanpa langganan aktif (hanya
// langganan lama yang sudah lewat) → mulai sekarang, status 'active',
// users.plan disinkronkan — perilaku lama dipertahankan.
func TestGrantVoucherStartsNowWithoutActive(t *testing.T) {
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.Voucher{},
		&models.VoucherRedemption{}, &models.Subscription{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(92003)
	queueClean(t, db, uid)
	lite := mkQueuePlan(t, db, "lite-queue", "Lite Queue", 15000)
	reg := mkQueuePlan(t, db, "regular-queue", "Regular Queue", 100000)
	mkQueueUser(t, db, uid, "lite-queue")
	now := time.Now()
	// Langganan lama sudah lewat 5 hari — bukan langganan aktif.
	mkQueueSub(t, db, uid, lite.ID, "active", now.Add(-40*24*time.Hour), now.Add(-5*24*time.Hour), false)

	v := mkQueueVoucher(t, db, "QUEUE-TANPA", reg.ID, 30, 10)
	startsAt, endsAt := redeemQueueVoucher(t, db, uid, v, reg, 30, false, now)
	within(t, startsAt, now, 2*time.Second)
	within(t, endsAt, now.AddDate(0, 0, 30), 2*time.Second)

	var sub models.Subscription
	if err := db.Where("user_id = ? AND plan_id = ?", uid, reg.ID).First(&sub).Error; err != nil {
		t.Fatalf("langganan baru tidak ditemukan: %v", err)
	}
	if sub.Status != "active" {
		t.Errorf("status = %q, mau active", sub.Status)
	}
	var u models.User
	db.First(&u, uid)
	if u.Plan != "regular-queue" {
		t.Errorf("users.plan = %q, mau regular-queue", u.Plan)
	}
}

// TestQueuedVoucherDoesNotChangeQuotaOrStatus: selama voucher mengantre,
// quota.Check menampilkan paket LAMA (limit Lite 15000) dan
// subscription.Check tetap active dengan nama paket lama — bukan paket
// masa depan.
func TestQueuedVoucherDoesNotChangeQuotaOrStatus(t *testing.T) {
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.Voucher{},
		&models.VoucherRedemption{}, &models.Subscription{}, &models.Message{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(92004)
	queueClean(t, db, uid)
	lite := mkQueuePlan(t, db, "lite-queue", "Lite Queue", 15000)
	reg := mkQueuePlan(t, db, "regular-queue", "Regular Queue", 100000)
	mkQueueUser(t, db, uid, "lite-queue")
	now := time.Now()
	oldEnd := now.Add(10 * 24 * time.Hour)
	mkQueueSub(t, db, uid, lite.ID, "active", now.Add(-20*24*time.Hour), oldEnd, false)

	v := mkQueueVoucher(t, db, "QUEUE-KUOTA", reg.ID, 30, 10)
	redeemQueueVoucher(t, db, uid, v, reg, 30, false, now)

	qr, err := quota.Check(db, uid)
	if err != nil {
		t.Fatalf("quota.Check: %v", err)
	}
	if qr.PlanName != "Lite Queue" {
		t.Errorf("quota planName = %q, mau Lite Queue (paket lama)", qr.PlanName)
	}
	if qr.Limit != 15000 {
		t.Errorf("quota limit = %d, mau 15000", qr.Limit)
	}
	if qr.IsTrial {
		t.Errorf("quota isTrial = true, mau false")
	}

	st, err := subscription.Check(db, uid)
	if err != nil {
		t.Fatalf("subscription.Check: %v", err)
	}
	if st.State != subscription.StateActive {
		t.Errorf("subState = %q, mau active", st.State)
	}
	if st.PlanName != "Lite Queue" {
		t.Errorf("sub planName = %q, mau Lite Queue (bukan paket antrean)", st.PlanName)
	}
}
