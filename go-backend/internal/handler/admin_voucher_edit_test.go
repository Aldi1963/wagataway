package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Test edit voucher (item 11): voucher yang belum dipakai boleh diubah
// semua field utamanya; voucher yang sudah dipakai mengunci kode, tipe,
// paket, durasi, dan maks pakai (400); kode bentrok ditolak (409).

// deleteVoucherByCode menghapus voucher + redemption-nya bila ada (sisa
// run sebelumnya, termasuk kode TARGET rename yang sempat tersimpan).
func deleteVoucherByCode(t *testing.T, db *gorm.DB, code string) {
	t.Helper()
	var old []models.Voucher
	db.Unscoped().Where("code = ?", code).Find(&old)
	for _, o := range old {
		db.Unscoped().Where("voucher_id = ?", o.ID).Delete(&models.VoucherRedemption{})
	}
	db.Unscoped().Where("code = ?", code).Delete(&models.Voucher{})
}

func seedVoucherEdit(t *testing.T, db *gorm.DB, code string, usedCount int, withRedemption bool) (models.Plan, models.Voucher) {
	t.Helper()
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.Voucher{},
		&models.VoucherRedemption{}, &models.AdminActivityLog{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	// Bersihkan sisa run sebelumnya: redemption dulu (FK ke vouchers),
	// baru vouchernya — bila dibalik, DELETE voucher gagal FK violation
	// dan voucher lama tertinggal (seed lalu gagal duplikat code).
	deleteVoucherByCode(t, db, code)

	plan := models.Plan{Name: "Regular Uji Edit", Slug: "regular-uji-edit", Price: 66000, Duration: 30, IsActive: true}
	if err := db.Where("slug = ?", plan.Slug).FirstOrCreate(&plan).Error; err != nil {
		t.Fatalf("seed plan: %v", err)
	}
	voucher := models.Voucher{
		Code:      code,
		Type:      "trial",
		PlanID:    &plan.ID,
		Duration:  7,
		MaxUses:   10,
		UsedCount: usedCount,
		IsActive:  true,
	}
	if err := db.Create(&voucher).Error; err != nil {
		t.Fatalf("seed voucher: %v", err)
	}
	if withRedemption {
		uid := uint(92001)
		u := models.User{
			ID:       uid,
			UUID:     fmt.Sprintf("00000000-0000-0000-0000-%012d", uid),
			Name:     "Edit Uji",
			Email:    "edit-uji@test.local",
			Password: "x",
		}
		if err := db.Where("id = ?", uid).FirstOrCreate(&u).Error; err != nil {
			t.Fatalf("seed user: %v", err)
		}
		db.Unscoped().Where("voucher_id = ? AND user_id = ?", voucher.ID, uid).Delete(&models.VoucherRedemption{})
		if err := db.Create(&models.VoucherRedemption{VoucherID: voucher.ID, UserID: uid}).Error; err != nil {
			t.Fatalf("seed redemption: %v", err)
		}
	}
	return plan, voucher
}

func voucherEditRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	// Meniru middleware JWT: menanam userID admin di konteks agar
	// logAdminAction (via middleware.GetUserID) tidak panic.
	r.Use(func(c *gin.Context) {
		c.Set("userID", uint(92001))
		c.Next()
	})
	r.PUT("/admin/vouchers/:id", adminUpdateVoucher(db))
	return r
}

func callVoucherEdit(t *testing.T, r *gin.Engine, id uint, body map[string]interface{}) (int, map[string]interface{}) {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/admin/vouchers/%d", id), bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	var parsed map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("respons bukan JSON (status %d): %s", w.Code, w.Body.String())
	}
	return w.Code, parsed
}

func TestAdminUpdateVoucherUnused(t *testing.T) {
	db := auditTestDB(t)
	deleteVoucherByCode(t, db, "EDIT-BARU") // target rename run sebelumnya
	plan, voucher := seedVoucherEdit(t, db, "EDIT-UNUSED", 0, false)

	r := voucherEditRouter(db)
	expires := "2027-01-01T00:00:00Z"
	code, _ := callVoucherEdit(t, r, voucher.ID, map[string]interface{}{
		"code": "EDIT-BARU", "type": "trial", "planId": plan.ID,
		"duration": 14, "maxUses": 5, "isActive": false, "expiresAt": expires,
	})
	if code != http.StatusOK {
		t.Fatalf("status = %d, mau 200", code)
	}
	var v models.Voucher
	if err := db.First(&v, voucher.ID).Error; err != nil {
		t.Fatalf("baca voucher: %v", err)
	}
	if v.Code != "EDIT-BARU" {
		t.Errorf("code = %q, mau EDIT-BARU", v.Code)
	}
	if v.Duration != 14 {
		t.Errorf("duration = %d, mau 14", v.Duration)
	}
	if v.MaxUses != 5 {
		t.Errorf("maxUses = %d, mau 5", v.MaxUses)
	}
	if v.IsActive {
		t.Errorf("isActive = true, mau false")
	}
	if v.ExpiresAt == nil || v.ExpiresAt.Format(time.RFC3339) != expires {
		t.Errorf("expiresAt = %v, mau %s", v.ExpiresAt, expires)
	}
	if v.PlanID == nil || *v.PlanID != plan.ID {
		t.Errorf("planId = %v, mau %d", v.PlanID, plan.ID)
	}
}

func TestAdminUpdateVoucherUsedLocked(t *testing.T) {
	db := auditTestDB(t)
	plan, voucher := seedVoucherEdit(t, db, "EDIT-USED", 1, true)

	r := voucherEditRouter(db)
	locked := []struct {
		name string
		body map[string]interface{}
	}{
		{"kode", map[string]interface{}{"code": "EDIT-LAIN"}},
		{"durasi", map[string]interface{}{"duration": 30}},
		{"maks pakai", map[string]interface{}{"maxUses": 99}},
		{"tipe", map[string]interface{}{"type": "plan", "planId": plan.ID}},
		{"paket", map[string]interface{}{"planId": plan.ID + 1000}},
	}
	for _, tc := range locked {
		code, _ := callVoucherEdit(t, r, voucher.ID, tc.body)
		if code != http.StatusBadRequest {
			t.Errorf("ubah %s saat sudah dipakai: status = %d, mau 400", tc.name, code)
		}
	}

	// Field yang aman tetap bisa diubah: status aktif + tanggal berakhir.
	code, _ := callVoucherEdit(t, r, voucher.ID, map[string]interface{}{
		"isActive": false, "expiresAt": "2027-06-01T00:00:00Z",
	})
	if code != http.StatusOK {
		t.Errorf("ubah isActive+expiresAt saat sudah dipakai: status = %d, mau 200", code)
	}

	var v models.Voucher
	if err := db.First(&v, voucher.ID).Error; err != nil {
		t.Fatalf("baca voucher: %v", err)
	}
	if v.Code != "EDIT-USED" {
		t.Errorf("code berubah jadi %q (harus tetap EDIT-USED)", v.Code)
	}
	if v.Duration != 7 {
		t.Errorf("duration berubah jadi %d (harus tetap 7)", v.Duration)
	}
	if v.MaxUses != 10 {
		t.Errorf("maxUses berubah jadi %d (harus tetap 10)", v.MaxUses)
	}
	if v.IsActive {
		t.Errorf("isActive tetap true (harus jadi false)")
	}
	if v.ExpiresAt == nil {
		t.Errorf("expiresAt tetap nil (harus terisi)")
	}
}

// TestAdminUpdateVoucherUsedByRedemptionOnly: UsedCount masih 0 tapi ada
// baris redemption (mis. counter pernah diubah manual) — tetap terkunci.
func TestAdminUpdateVoucherUsedByRedemptionOnly(t *testing.T) {
	db := auditTestDB(t)
	_, voucher := seedVoucherEdit(t, db, "EDIT-REDONLY", 0, true)

	r := voucherEditRouter(db)
	code, _ := callVoucherEdit(t, r, voucher.ID, map[string]interface{}{"code": "EDIT-LAIN"})
	if code != http.StatusBadRequest {
		t.Errorf("ubah kode saat ada redemption: status = %d, mau 400", code)
	}
}

func TestAdminUpdateVoucherCodeConflict(t *testing.T) {
	db := auditTestDB(t)
	_, a := seedVoucherEdit(t, db, "EDIT-A", 0, false)
	seedVoucherEdit(t, db, "EDIT-B", 0, false)

	r := voucherEditRouter(db)
	code, _ := callVoucherEdit(t, r, a.ID, map[string]interface{}{"code": "EDIT-B"})
	if code != http.StatusConflict {
		t.Errorf("kode bentrok: status = %d, mau 409", code)
	}
	// Kode sendiri (tak berubah) tetap lolos.
	code, _ = callVoucherEdit(t, r, a.ID, map[string]interface{}{"code": "EDIT-A", "duration": 9})
	if code != http.StatusOK {
		t.Errorf("kode sama + ubah durasi: status = %d, mau 200", code)
	}
}

func TestAdminUpdateVoucherNotFound(t *testing.T) {
	db := auditTestDB(t)
	r := voucherEditRouter(db)
	code, _ := callVoucherEdit(t, r, 99999999, map[string]interface{}{"duration": 9})
	if code != http.StatusNotFound {
		t.Errorf("voucher tak ada: status = %d, mau 404", code)
	}
}
