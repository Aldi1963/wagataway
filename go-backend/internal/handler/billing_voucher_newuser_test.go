package handler

import (
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/rls"
	"gorm.io/gorm"
)

// seedVoucherNewUser menyiapkan paket + voucher + user untuk test syarat
// pengguna baru. subEnd nil = user tanpa riwayat langganan; bila diisi,
// dibuat satu langganan (status active) dengan end_date = *subEnd.
func seedVoucherNewUser(t *testing.T, db *gorm.DB, code string, newUsersOnly bool, userIDs []uint, subEnds map[uint]*time.Time) (models.Plan, models.Voucher) {
	t.Helper()
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.Voucher{},
		&models.VoucherRedemption{}, &models.Subscription{}, &models.Message{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	db.Unscoped().Where("user_id IN ?", userIDs).Delete(&models.VoucherRedemption{})
	db.Unscoped().Where("user_id IN ?", userIDs).Delete(&models.Subscription{})
	db.Unscoped().Where("code = ?", code).Delete(&models.Voucher{})

	plan := models.Plan{Name: "Regular Uji", Slug: "regular-uji-nu", Price: 66000, Duration: 30, IsActive: true}
	if err := db.Where("slug = ?", plan.Slug).FirstOrCreate(&plan).Error; err != nil {
		t.Fatalf("seed plan: %v", err)
	}
	now := time.Now()
	for _, uid := range userIDs {
		u := models.User{
			ID:       uid,
			UUID:     fmt.Sprintf("00000000-0000-0000-0000-%012d", uid),
			Name:     fmt.Sprintf("NewUser %d", uid),
			Email:    fmt.Sprintf("newuser-%d@test.local", uid),
			Password: "x",
		}
		if err := db.Where("id = ?", uid).FirstOrCreate(&u).Error; err != nil {
			t.Fatalf("seed user %d: %v", uid, err)
		}
		if end, ok := subEnds[uid]; ok && end != nil {
			sub := models.Subscription{
				UserID:    uid,
				PlanID:    plan.ID,
				Status:    "active",
				StartDate: now.Add(-30 * 24 * time.Hour),
				EndDate:   *end,
			}
			if err := db.Create(&sub).Error; err != nil {
				t.Fatalf("seed subscription user %d: %v", uid, err)
			}
		}
	}
	voucher := models.Voucher{
		Code:         code,
		Type:         "plan",
		PlanID:       &plan.ID,
		Duration:     30,
		MaxUses:      100,
		UsedCount:    0,
		IsActive:     true,
		NewUsersOnly: newUsersOnly,
	}
	if err := db.Create(&voucher).Error; err != nil {
		t.Fatalf("seed voucher: %v", err)
	}
	return plan, voucher
}

func redeemNewUserTx(t *testing.T, db *gorm.DB, uid uint, voucher models.Voucher, plan models.Plan) error {
	t.Helper()
	udb := rls.Scoped(db, uid)
	return udb.Transaction(func(tx *gorm.DB) error {
		_, _, err := redeemVoucherTx(tx, uid, &voucher, plan, 30, false, time.Now())
		return err
	})
}

// TestRedeemVoucherNewUsersOnly_NoHistory: user tanpa riwayat langganan
// lolos.
func TestRedeemVoucherNewUsersOnly_NoHistory(t *testing.T) {
	db := auditTestDB(t)
	uid := uint(92001)
	plan, voucher := seedVoucherNewUser(t, db, "NU-NOHIST", true, []uint{uid}, nil)
	if err := redeemNewUserTx(t, db, uid, voucher, plan); err != nil {
		t.Fatalf("user tanpa riwayat harus lolos: %v", err)
	}
}

// TestRedeemVoucherNewUsersOnly_Expired: user dengan langganan yang sudah
// habis (10 hari lalu) lolos.
func TestRedeemVoucherNewUsersOnly_Expired(t *testing.T) {
	db := auditTestDB(t)
	uid := uint(92002)
	end := time.Now().Add(-10 * 24 * time.Hour)
	plan, voucher := seedVoucherNewUser(t, db, "NU-EXPIRED", true, []uint{uid},
		map[uint]*time.Time{uid: &end})
	if err := redeemNewUserTx(t, db, uid, voucher, plan); err != nil {
		t.Fatalf("user dengan langganan habis harus lolos: %v", err)
	}
}

// TestRedeemVoucherNewUsersOnly_Grace: user dalam masa tenggang (expired
// 1 hari lalu) lolos — langganannya sudah habis.
func TestRedeemVoucherNewUsersOnly_Grace(t *testing.T) {
	db := auditTestDB(t)
	uid := uint(92003)
	end := time.Now().Add(-24 * time.Hour)
	plan, voucher := seedVoucherNewUser(t, db, "NU-GRACE", true, []uint{uid},
		map[uint]*time.Time{uid: &end})
	if err := redeemNewUserTx(t, db, uid, voucher, plan); err != nil {
		t.Fatalf("user dalam masa tenggang harus lolos: %v", err)
	}
}

// TestRedeemVoucherNewUsersOnly_ActiveRejected: user dengan langganan aktif
// ditolak dengan errVoucherNewUsersOnly.
func TestRedeemVoucherNewUsersOnly_ActiveRejected(t *testing.T) {
	db := auditTestDB(t)
	uid := uint(92004)
	end := time.Now().Add(24 * time.Hour)
	plan, voucher := seedVoucherNewUser(t, db, "NU-ACTIVE", true, []uint{uid},
		map[uint]*time.Time{uid: &end})
	err := redeemNewUserTx(t, db, uid, voucher, plan)
	if !errors.Is(err, errVoucherNewUsersOnly) {
		t.Fatalf("user dengan langganan aktif harus ditolak errVoucherNewUsersOnly, dapat: %v", err)
	}
	// Tidak ada redemption yang tercatat untuk penolakan ini.
	var count int64
	db.Model(&models.VoucherRedemption{}).
		Where("voucher_id = ? AND user_id = ?", voucher.ID, uid).Count(&count)
	if count != 0 {
		t.Errorf("redemption tercatat = %d, want 0 (redeem ditolak)", count)
	}
}

// TestRedeemVoucherNewUsersOnly_FlagOff: flag mati = perilaku lama — user
// dengan langganan aktif tetap lolos (langganan baru mengantre).
func TestRedeemVoucherNewUsersOnly_FlagOff(t *testing.T) {
	db := auditTestDB(t)
	uid := uint(92005)
	end := time.Now().Add(24 * time.Hour)
	plan, voucher := seedVoucherNewUser(t, db, "NU-FLAGOFF", false, []uint{uid},
		map[uint]*time.Time{uid: &end})
	if err := redeemNewUserTx(t, db, uid, voucher, plan); err != nil {
		t.Fatalf("flag mati + langganan aktif harus lolos (perilaku lama): %v", err)
	}
}
