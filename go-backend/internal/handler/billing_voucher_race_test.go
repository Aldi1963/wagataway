package handler

import (
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/rls"
	"gorm.io/gorm"
)

func seedVoucherRace(t *testing.T, db *gorm.DB, maxUses int, code string, userIDs []uint) (models.Plan, models.Voucher) {
	t.Helper()
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.Voucher{},
		&models.VoucherRedemption{}, &models.Subscription{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	// Bersihkan sisa run sebelumnya — urutan penting: redemption dulu
	// (FK ke vouchers), baru vouchernya; bila dibalik, DELETE voucher
	// gagal FK violation dan voucher lama tertinggal (seed lalu gagal
	// duplikat code pada run berikutnya).
	db.Unscoped().Where("user_id IN ?", userIDs).Delete(&models.VoucherRedemption{})
	db.Unscoped().Where("user_id IN ?", userIDs).Delete(&models.Subscription{})
	db.Unscoped().Where("code = ?", code).Delete(&models.Voucher{})

	plan := models.Plan{Name: "Regular Uji", Slug: "regular-uji", Price: 66000, Duration: 30, IsActive: true}
	if err := db.Where("slug = ?", plan.Slug).FirstOrCreate(&plan).Error; err != nil {
		t.Fatalf("seed plan: %v", err)
	}
	for _, uid := range userIDs {
		u := models.User{
			ID:       uid,
			UUID:     fmt.Sprintf("00000000-0000-0000-0000-%012d", uid),
			Name:     fmt.Sprintf("Race %d", uid),
			Email:    fmt.Sprintf("race-%d@test.local", uid),
			Password: "x",
		}
		if err := db.Where("id = ?", uid).FirstOrCreate(&u).Error; err != nil {
			t.Fatalf("seed user %d: %v", uid, err)
		}
	}
	voucher := models.Voucher{
		Code:      code,
		Type:      "plan",
		PlanID:    &plan.ID,
		Duration:  30,
		MaxUses:   maxUses,
		UsedCount: 0,
		IsActive:  true,
	}
	if err := db.Create(&voucher).Error; err != nil {
		t.Fatalf("seed voucher: %v", err)
	}
	return plan, voucher
}

// TestRedeemVoucherRaceMaxUses: 10 user berbeda redeem bersamaan voucher
// MaxUses=1 — tepat 1 berhasil, 9 ditolak kehabisan, used_count tetap 1
// (tidak pernah over-redeem).
func TestRedeemVoucherRaceMaxUses(t *testing.T) {
	db := auditTestDB(t)
	userIDs := []uint{91001, 91002, 91003, 91004, 91005, 91006, 91007, 91008, 91009, 91010}
	plan, voucher := seedVoucherRace(t, db, 1, "RACE-MAX1", userIDs)

	now := time.Now()
	var wg sync.WaitGroup
	results := make([]error, len(userIDs))
	for i, uid := range userIDs {
		wg.Add(1)
		go func(i int, uid uint) {
			defer wg.Done()
			udb := rls.Scoped(db, uid)
			results[i] = udb.Transaction(func(tx *gorm.DB) error {
				return redeemVoucherTx(tx, uid, &voucher, plan, 30, false, now)
			})
		}(i, uid)
	}
	wg.Wait()

	success, exhausted := 0, 0
	for _, err := range results {
		switch {
		case err == nil:
			success++
		case errors.Is(err, errVoucherExhausted):
			exhausted++
		default:
			t.Errorf("error tak terduga: %v", err)
		}
	}
	if success != 1 {
		t.Errorf("berhasil = %d, mau 1", success)
	}
	if exhausted != len(userIDs)-1 {
		t.Errorf("ditolak habis = %d, mau %d", exhausted, len(userIDs)-1)
	}

	var v models.Voucher
	if err := db.First(&v, voucher.ID).Error; err != nil {
		t.Fatalf("baca voucher: %v", err)
	}
	if v.UsedCount != 1 {
		t.Errorf("used_count = %d, mau 1 (over-redeem!)", v.UsedCount)
	}
	var n int64
	db.Model(&models.VoucherRedemption{}).Where("voucher_id = ?", voucher.ID).Count(&n)
	if n != 1 {
		t.Errorf("redemption tercatat = %d, mau 1", n)
	}
	db.Model(&models.Subscription{}).Where("user_id IN ?", userIDs).Count(&n)
	if n != 1 {
		t.Errorf("langganan dibuat = %d, mau 1", n)
	}
}

// TestRedeemVoucherRaceSameUser: 5 request bersamaan dari user yang sama
// (kuota masih banyak) — tepat 1 berhasil, sisanya ditolak sudah-redeem.
func TestRedeemVoucherRaceSameUser(t *testing.T) {
	db := auditTestDB(t)
	uid := uint(91100)
	plan, voucher := seedVoucherRace(t, db, 10, "RACE-SAME", []uint{uid})

	now := time.Now()
	var wg sync.WaitGroup
	results := make([]error, 5)
	for i := range results {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			udb := rls.Scoped(db, uid)
			results[i] = udb.Transaction(func(tx *gorm.DB) error {
				return redeemVoucherTx(tx, uid, &voucher, plan, 30, false, now)
			})
		}(i)
	}
	wg.Wait()

	success, already := 0, 0
	for _, err := range results {
		switch {
		case err == nil:
			success++
		case errors.Is(err, errAlreadyRedeemed):
			already++
		default:
			t.Errorf("error tak terduga: %v", err)
		}
	}
	if success != 1 {
		t.Errorf("berhasil = %d, mau 1", success)
	}
	if already != 4 {
		t.Errorf("ditolak sudah-redeem = %d, mau 4", already)
	}
	var v models.Voucher
	db.First(&v, voucher.ID)
	if v.UsedCount != 1 {
		t.Errorf("used_count = %d, mau 1", v.UsedCount)
	}
}
