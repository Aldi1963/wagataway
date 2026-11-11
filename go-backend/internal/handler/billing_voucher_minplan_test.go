package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Voucher minimal paket (MinPlanID): voucher hanya bisa ditukar bila paket
// yang AKAN diberikan tier-nya >= paket minimal. Tier diukur dari SortOrder
// (Price sebagai penyeimbang bila SortOrder sama).

func mkMinPlan(t *testing.T, db *gorm.DB, slug, name string, price int64, sortOrder int) models.Plan {
	t.Helper()
	p := models.Plan{Name: name, Slug: slug, Price: price, Duration: 30,
		SortOrder: sortOrder, IsActive: true}
	if err := db.Where("slug = ?", slug).FirstOrCreate(&p).Error; err != nil {
		t.Fatalf("seed plan %s: %v", slug, err)
	}
	// FirstOrCreate tidak menimpa kolom bila baris sudah ada dari run lalu.
	db.Model(&models.Plan{}).Where("id = ?", p.ID).
		Updates(map[string]any{"price": price, "sort_order": sortOrder, "is_active": true})
	db.Where("id = ?", p.ID).First(&p)
	return p
}

func mkMinVoucher(t *testing.T, db *gorm.DB, code, typ string, planID, minPlanID *uint) models.Voucher {
	t.Helper()
	db.Unscoped().Where("code = ?", code).Delete(&models.Voucher{})
	v := models.Voucher{Code: code, Type: typ, PlanID: planID,
		MinPlanID: minPlanID, Duration: 7, MaxUses: 10, UsedCount: 0, IsActive: true}
	if err := db.Create(&v).Error; err != nil {
		t.Fatalf("seed voucher %s: %v", code, err)
	}
	return v
}

func seedMinPlans(t *testing.T, db *gorm.DB) map[string]models.Plan {
	t.Helper()
	// Tier cermin data live: SortOrder naik seiring harga.
	return map[string]models.Plan{
		"free":    mkMinPlan(t, db, "mp-free", "Free", 0, 1),
		"lite":    mkMinPlan(t, db, "mp-lite", "Lite", 25000, 2),
		"regular": mkMinPlan(t, db, "mp-regular", "Regular", 66000, 3),
		"pro":     mkMinPlan(t, db, "mp-pro", "Pro", 110000, 4),
		"master":  mkMinPlan(t, db, "mp-master", "Master", 175000, 5),
	}
}

// TestPlanTierBelow: perbandingan tier konsisten — SortOrder menentukan,
// Price hanya penyeimbang bila SortOrder sama.
func TestPlanTierBelow(t *testing.T) {
	plan := func(sortOrder int, price int64) models.Plan {
		return models.Plan{SortOrder: sortOrder, Price: price}
	}
	cases := []struct {
		name    string
		granted models.Plan
		min     models.Plan
		below   bool
	}{
		{"lite di bawah pro", plan(2, 25000), plan(4, 110000), true},
		{"regular di bawah pro", plan(3, 66000), plan(4, 110000), true},
		{"free di bawah pro", plan(1, 0), plan(4, 110000), true},
		{"pro sama dengan pro", plan(4, 110000), plan(4, 110000), false},
		{"master di atas pro", plan(5, 175000), plan(4, 110000), false},
		{"sortOrder sama harga lebih rendah", plan(4, 100000), plan(4, 110000), true},
		{"sortOrder sama harga lebih tinggi", plan(4, 120000), plan(4, 110000), false},
		{"sortOrder sama harga sama", plan(4, 110000), plan(4, 110000), false},
		{"sortOrder lebih tinggi harga lebih rendah tetap di atas", plan(5, 1000), plan(4, 110000), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := planTierBelow(tc.granted, tc.min); got != tc.below {
				t.Errorf("planTierBelow = %v, mau %v", got, tc.below)
			}
		})
	}
}

// TestCheckVoucherMinPlan: cek langsung pada fungsi — tanpa MinPlanID lolos
// untuk paket apa pun; min Pro menolak Lite/Regular, meloloskan Pro/Master.
func TestCheckVoucherMinPlan(t *testing.T) {
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.Voucher{},
		&models.VoucherRedemption{}, &models.Subscription{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	plans := seedMinPlans(t, db)
	udb := rls.Scoped(db, 1)
	liteID := plans["lite"].ID
	proID := plans["pro"].ID

	// Tanpa MinPlanID: lolos untuk paket apa pun, termasuk Free.
	v := models.Voucher{Code: "MP-NONE", Type: "plan", PlanID: &liteID}
	for _, slug := range []string{"free", "lite", "regular", "pro", "master"} {
		if err := checkVoucherMinPlan(udb, &v, plans[slug]); err != nil {
			t.Errorf("tanpa MinPlanID + %s: err = %v, mau nil", slug, err)
		}
	}

	// Min Pro: Lite/Regular/Free ditolak dengan nama paket minimum di pesan.
	vMin := models.Voucher{Code: "MP-PRO", Type: "plan", PlanID: &proID,
		MinPlanID: &proID}
	for _, slug := range []string{"free", "lite", "regular"} {
		err := checkVoucherMinPlan(udb, &vMin, plans[slug])
		if err == nil {
			t.Errorf("min Pro + %s: err = nil, mau ditolak", slug)
			continue
		}
		if !strings.Contains(err.Error(), "Pro") {
			t.Errorf("min Pro + %s: pesan %q tidak menyebut paket minimum", slug, err.Error())
		}
	}
	// Min Pro: Pro (setara) dan Master (di atas) lolos.
	for _, slug := range []string{"pro", "master"} {
		if err := checkVoucherMinPlan(udb, &vMin, plans[slug]); err != nil {
			t.Errorf("min Pro + %s: err = %v, mau nil", slug, err)
		}
	}

	// Paket minimum sudah dihapus admin: batas tidak terukur — voucher
	// dianggap berlaku untuk semua paket, bukan ditolak.
	gone := mkMinPlan(t, db, "mp-gone", "Gone", 999999, 9)
	vGone := models.Voucher{Code: "MP-GONE", Type: "plan", MinPlanID: &gone.ID}
	db.Unscoped().Delete(&models.Plan{}, gone.ID)
	if err := checkVoucherMinPlan(udb, &vGone, plans["free"]); err != nil {
		t.Errorf("min plan terhapus + free: err = %v, mau nil", err)
	}
}

// TestRedeemVoucherMinPlanTrialGrant: jalur voucherGrantPlan + cek digabung
// — trial tanpa PlanID memberi Free (ditolak min Pro); trial ber-PlanID
// Master memberi Master (lolos min Pro).
func TestRedeemVoucherMinPlanTrialGrant(t *testing.T) {
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.Voucher{},
		&models.VoucherRedemption{}, &models.Subscription{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	plans := seedMinPlans(t, db)
	udb := rls.Scoped(db, 1)
	proID := plans["pro"].ID
	masterID := plans["master"].ID

	// Trial tanpa PlanID → grant plan Free → min Pro menolak.
	vTrialFree := models.Voucher{Code: "MP-TRIAL-FREE", Type: "trial",
		MinPlanID: &proID, Duration: 7}
	plan, _, isTrial, err := voucherGrantPlan(udb, &vTrialFree)
	if err != nil {
		t.Fatalf("voucherGrantPlan trial: %v", err)
	}
	// Trial tanpa PlanID memakai paket acuan slug "free" (bukan paket
	// mp-free seed test ini) — tier terendah.
	if !isTrial || plan.Slug != "free" {
		t.Fatalf("trial tanpa PlanID memberi %s (trial=%v), mau free", plan.Slug, isTrial)
	}
	if err := checkVoucherMinPlan(udb, &vTrialFree, plan); err == nil {
		t.Errorf("trial Free + min Pro: err = nil, mau ditolak")
	}

	// Trial ber-PlanID Master → grant plan Master → min Pro meloloskan.
	vTrialMaster := models.Voucher{Code: "MP-TRIAL-MASTER", Type: "trial",
		PlanID: &masterID, MinPlanID: &proID, Duration: 7}
	plan, _, _, err = voucherGrantPlan(udb, &vTrialMaster)
	if err != nil {
		t.Fatalf("voucherGrantPlan trial master: %v", err)
	}
	if plan.Slug != "mp-master" {
		t.Fatalf("trial ber-PlanID memberi %s, mau mp-master", plan.Slug)
	}
	if err := checkVoucherMinPlan(udb, &vTrialMaster, plan); err != nil {
		t.Errorf("trial Master + min Pro: err = %v, mau nil", err)
	}
}

// minPlanEngine: gin engine minimal untuk POST /voucher/redeem dengan
// userID yang disetel langsung di context (tanpa middleware auth).
func minPlanEngine(db *gorm.DB, uid uint) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("userID", uid)
		c.Next()
	})
	r.POST("/voucher/redeem", redeemVoucher(db))
	return r
}

func postRedeem(t *testing.T, r *gin.Engine, code string) (int, string) {
	t.Helper()
	body, _ := json.Marshal(map[string]string{"code": code})
	req := httptest.NewRequest(http.MethodPost, "/voucher/redeem", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	return w.Code, w.Body.String()
}

// TestRedeemVoucherMinPlanHTTP: cek terpasang di handler redeem —
// penolakan 400 dengan pesan jelas, tanpa mencatat penukaran; yang lolos
// 200 dan langganan benar-benar terbentuk.
func TestRedeemVoucherMinPlanHTTP(t *testing.T) {
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.Voucher{},
		&models.VoucherRedemption{}, &models.Subscription{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	plans := seedMinPlans(t, db)
	liteID := plans["lite"].ID
	regularID := plans["regular"].ID
	proID := plans["pro"].ID
	masterID := plans["master"].ID

	cases := []struct {
		name       string
		uid        uint
		code       string
		typ        string
		planID     *uint
		minPlanID  *uint
		wantStatus int
		wantPlan   string // slug paket langganan yang terbentuk (bila 200)
	}{
		{"plan Lite ditolak min Pro", 92101, "MP-HTTP-LITE", "plan",
			&liteID, &proID, http.StatusBadRequest, ""},
		{"plan Regular ditolak min Pro", 92102, "MP-HTTP-REG", "plan",
			&regularID, &proID, http.StatusBadRequest, ""},
		{"plan Pro lolos min Pro", 92103, "MP-HTTP-PRO", "plan",
			&proID, &proID, http.StatusOK, "mp-pro"},
		{"plan Master lolos min Pro", 92104, "MP-HTTP-MASTER", "plan",
			&masterID, &proID, http.StatusOK, "mp-master"},
		{"plan Lite tanpa minimum lolos", 92105, "MP-HTTP-NOMIN", "plan",
			&liteID, nil, http.StatusOK, "mp-lite"},
		{"trial tanpa paket ditolak min Pro", 92106, "MP-HTTP-TRIAL", "trial",
			nil, &proID, http.StatusBadRequest, ""},
		{"trial Master lolos min Pro", 92107, "MP-HTTP-TRIAL-M", "trial",
			&masterID, &proID, http.StatusOK, "mp-master"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			queueClean(t, db, tc.uid)
			mkQueueUser(t, db, tc.uid, "mp-free")
			v := mkMinVoucher(t, db, tc.code, tc.typ, tc.planID, tc.minPlanID)
			r := minPlanEngine(db, tc.uid)
			status, body := postRedeem(t, r, tc.code)
			if status != tc.wantStatus {
				t.Fatalf("status = %d, mau %d (body: %s)", status, tc.wantStatus, body)
			}
			var count int64
			db.Model(&models.VoucherRedemption{}).
				Where("voucher_id = ? AND user_id = ?", v.ID, tc.uid).Count(&count)
			if tc.wantStatus == http.StatusBadRequest {
				if !strings.Contains(body, "Pro ke atas") {
					t.Errorf("body %q tidak memuat pesan minimum paket", body)
				}
				if count != 0 {
					t.Errorf("penukaran tercatat (%d) padahal redeem ditolak", count)
				}
				return
			}
			if count != 1 {
				t.Errorf("penukaran tercatat = %d, mau 1", count)
			}
			var sub models.Subscription
			if err := db.Where("user_id = ?", tc.uid).First(&sub).Error; err != nil {
				t.Fatalf("langganan tidak terbentuk: %v", err)
			}
			var gotPlan models.Plan
			db.First(&gotPlan, sub.PlanID)
			if gotPlan.Slug != tc.wantPlan {
				t.Errorf("langganan paket = %s, mau %s", gotPlan.Slug, tc.wantPlan)
			}
		})
	}
}
