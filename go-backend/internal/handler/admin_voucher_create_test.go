package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Test create voucher satuan menerima snake_case (bug binding): form admin
// mengirim plan_id/max_uses; sebelum perbaikan, keduanya diam-diam hilang
// (plan_id NULL, max_uses default 1 — persis voucher id 1 di DB live).

func seedVoucherCreatePlan(t *testing.T, db *gorm.DB) models.Plan {
	t.Helper()
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.Voucher{},
		&models.VoucherRedemption{}, &models.AdminActivityLog{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	plan := models.Plan{Name: "Regular Uji Buat", Slug: "regular-uji-buat", Price: 66000, Duration: 30, IsActive: true}
	if err := db.Where("slug = ?", plan.Slug).FirstOrCreate(&plan).Error; err != nil {
		t.Fatalf("seed plan: %v", err)
	}
	return plan
}

func voucherCreateRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	// Meniru middleware JWT: menanam userID admin di konteks agar
	// logAdminAction (via middleware.GetUserID) tidak panic.
	r.Use(func(c *gin.Context) {
		c.Set("userID", uint(92001))
		c.Next()
	})
	r.POST("/admin/vouchers", adminCreateVoucher(db))
	return r
}

func callVoucherCreate(t *testing.T, r *gin.Engine, body map[string]interface{}) (int, map[string]interface{}) {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/admin/vouchers", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	var parsed map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("respons bukan JSON (status %d): %s", w.Code, w.Body.String())
	}
	return w.Code, parsed
}

func TestAdminCreateVoucherSnakeCase(t *testing.T) {
	db := auditTestDB(t)
	plan := seedVoucherCreatePlan(t, db)
	code := "UJI-SNAKE-001"
	deleteVoucherByCode(t, db, code)
	defer deleteVoucherByCode(t, db, code)

	r := voucherCreateRouter(db)
	// Bentuk body persis form admin (Admin.tsx handleAdd): plan_id dan
	// max_uses snake_case, durasi 180 + diskon 100 seperti voucher id 1.
	status, _ := callVoucherCreate(t, r, map[string]interface{}{
		"code": code, "type": "plan", "plan_id": plan.ID,
		"duration": 180, "discount": 100, "max_uses": 100,
	})
	if status != http.StatusCreated {
		t.Fatalf("status = %d, mau 201", status)
	}
	var v models.Voucher
	if err := db.Where("code = ?", code).First(&v).Error; err != nil {
		t.Fatalf("baca voucher: %v", err)
	}
	if v.PlanID == nil || *v.PlanID != plan.ID {
		t.Errorf("planId = %v, mau %d (plan_id tidak tersimpan)", v.PlanID, plan.ID)
	}
	if v.MaxUses != 100 {
		t.Errorf("maxUses = %d, mau 100 (max_uses tidak tersimpan)", v.MaxUses)
	}
	if v.Duration != 180 {
		t.Errorf("duration = %d, mau 180", v.Duration)
	}
	if v.Discount != 100 {
		t.Errorf("discount = %d, mau 100", v.Discount)
	}
}

func TestAdminCreateVoucherCamelCase(t *testing.T) {
	db := auditTestDB(t)
	plan := seedVoucherCreatePlan(t, db)
	code := "UJI-CAMEL-001"
	deleteVoucherByCode(t, db, code)
	defer deleteVoucherByCode(t, db, code)

	r := voucherCreateRouter(db)
	status, _ := callVoucherCreate(t, r, map[string]interface{}{
		"code": code, "type": "plan", "planId": plan.ID,
		"duration": 7, "maxUses": 50,
	})
	if status != http.StatusCreated {
		t.Fatalf("status = %d, mau 201", status)
	}
	var v models.Voucher
	if err := db.Where("code = ?", code).First(&v).Error; err != nil {
		t.Fatalf("baca voucher: %v", err)
	}
	if v.PlanID == nil || *v.PlanID != plan.ID {
		t.Errorf("planId = %v, mau %d", v.PlanID, plan.ID)
	}
	if v.MaxUses != 50 {
		t.Errorf("maxUses = %d, mau 50", v.MaxUses)
	}
}

func TestAdminCreateVoucherBothSpellingsCamelWins(t *testing.T) {
	db := auditTestDB(t)
	plan := seedVoucherCreatePlan(t, db)
	code := "UJI-DUAL-001"
	deleteVoucherByCode(t, db, code)
	defer deleteVoucherByCode(t, db, code)

	r := voucherCreateRouter(db)
	status, _ := callVoucherCreate(t, r, map[string]interface{}{
		"code": code, "type": "plan",
		"planId": plan.ID, "plan_id": plan.ID + 1000,
		"maxUses": 5, "max_uses": 99,
	})
	if status != http.StatusCreated {
		t.Fatalf("status = %d, mau 201", status)
	}
	var v models.Voucher
	if err := db.Where("code = ?", code).First(&v).Error; err != nil {
		t.Fatalf("baca voucher: %v", err)
	}
	// plan_id+1000 tidak ada sebagai paket — create tidak memvalidasi
	// PlanID, jadi yang membedakan hanyalah nilai yang tersimpan.
	if v.PlanID == nil || *v.PlanID != plan.ID {
		t.Errorf("planId = %v, mau %d (camelCase harus menang)", v.PlanID, plan.ID)
	}
	if v.MaxUses != 5 {
		t.Errorf("maxUses = %d, mau 5 (camelCase harus menang)", v.MaxUses)
	}
}

func TestAdminUpdateVoucherSnakeCase(t *testing.T) {
	db := auditTestDB(t)
	plan, voucher := seedVoucherEdit(t, db, "UJI-EDIT-SNAKE", 0, false)
	defer deleteVoucherByCode(t, db, "UJI-EDIT-SNAKE")

	r := voucherEditRouter(db)
	code, _ := callVoucherEdit(t, r, voucher.ID, map[string]interface{}{
		"plan_id": plan.ID, "max_uses": 42, "is_active": false,
	})
	if code != http.StatusOK {
		t.Fatalf("status = %d, mau 200", code)
	}
	var v models.Voucher
	if err := db.First(&v, voucher.ID).Error; err != nil {
		t.Fatalf("baca voucher: %v", err)
	}
	if v.PlanID == nil || *v.PlanID != plan.ID {
		t.Errorf("planId = %v, mau %d (plan_id tidak tersimpan)", v.PlanID, plan.ID)
	}
	if v.MaxUses != 42 {
		t.Errorf("maxUses = %d, mau 42 (max_uses tidak tersimpan)", v.MaxUses)
	}
	if v.IsActive {
		t.Errorf("isActive = true, mau false (is_active tidak tersimpan)")
	}
}
