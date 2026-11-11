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

// bulkTestRouter memasang handler bulk di engine gin test dengan userID
// admin palsu di context (dibutuhkan logAdminAction via GetUserID).
func bulkTestRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) {
		c.Set("userID", uint(1))
		c.Next()
	})
	r.POST("/admin/vouchers/bulk", adminBulkCreateVouchers(db))
	return r
}

func bulkTestSetup(t *testing.T, db *gorm.DB, prefix string) {
	t.Helper()
	if err := db.AutoMigrate(&models.Voucher{}, &models.Plan{}, &models.AdminActivityLog{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	// Bersihkan sisa run sebelumnya untuk prefix ini.
	db.Unscoped().Where("code LIKE ?", prefix+"-%").Delete(&models.Voucher{})
}

func bulkTestPost(t *testing.T, r *gin.Engine, body map[string]any) (int, map[string]any) {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	req := httptest.NewRequest(http.MethodPost, "/admin/vouchers/bulk", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	var res map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &res); err != nil {
		t.Fatalf("unmarshal respons (%d): %v — body: %s", w.Code, err, w.Body.String())
	}
	return w.Code, res
}

func bulkTestBody(prefix string, count int) map[string]any {
	return map[string]any{
		"prefix": prefix, "count": count, "type": "trial",
		"duration": 7, "discount": 0, "max_uses": 1,
	}
}

// TestBulkCreateVouchersAllSuccess: bulk 5 kode → 5 berhasil, 0 gagal,
// kode berformat {PREFIX}-{NNN} berurutan 001–005.
func TestBulkCreateVouchersAllSuccess(t *testing.T) {
	db := auditTestDB(t)
	bulkTestSetup(t, db, "BULKOK")
	defer bulkTestSetup(t, db, "BULKOK")

	r := bulkTestRouter(db)
	code, res := bulkTestPost(t, r, bulkTestBody("BULKOK", 5))
	if code != http.StatusCreated {
		t.Fatalf("status = %d, mau %d — body: %v", code, http.StatusCreated, res)
	}
	if int(res["createdCount"].(float64)) != 5 {
		t.Errorf("createdCount = %v, mau 5", res["createdCount"])
	}
	if int(res["failedCount"].(float64)) != 0 {
		t.Errorf("failedCount = %v, mau 0", res["failedCount"])
	}
	created := res["created"].([]any)
	for i, want := range []string{"BULKOK-001", "BULKOK-002", "BULKOK-003", "BULKOK-004", "BULKOK-005"} {
		got := created[i].(map[string]any)["code"].(string)
		if got != want {
			t.Errorf("created[%d].code = %q, mau %q", i, got, want)
		}
	}
	var n int64
	db.Model(&models.Voucher{}).Where("code LIKE ?", "BULKOK-%").Count(&n)
	if n != 5 {
		t.Errorf("voucher di DB = %d, mau 5", n)
	}
}

// TestBulkCreateVouchersPartialCollision: 1 dari 5 kode sudah ada → 4
// lainnya tetap dibuat, 1 gagal dilaporkan dengan kode + alasannya.
func TestBulkCreateVouchersPartialCollision(t *testing.T) {
	db := auditTestDB(t)
	bulkTestSetup(t, db, "BULKCOL")
	defer bulkTestSetup(t, db, "BULKCOL")

	// Bentrok: kode ketiga sudah dipakai voucher lama.
	if err := db.Create(&models.Voucher{Code: "BULKCOL-003", Type: "trial", Duration: 7, MaxUses: 1, IsActive: true}).Error; err != nil {
		t.Fatalf("seed voucher bentrok: %v", err)
	}

	r := bulkTestRouter(db)
	code, res := bulkTestPost(t, r, bulkTestBody("BULKCOL", 5))
	if code != http.StatusMultiStatus {
		t.Fatalf("status = %d, mau %d (partial) — body: %v", code, http.StatusMultiStatus, res)
	}
	if int(res["createdCount"].(float64)) != 4 {
		t.Errorf("createdCount = %v, mau 4", res["createdCount"])
	}
	if int(res["failedCount"].(float64)) != 1 {
		t.Fatalf("failedCount = %v, mau 1", res["failedCount"])
	}
	failed := res["failed"].([]any)
	f := failed[0].(map[string]any)
	if f["code"] != "BULKCOL-003" {
		t.Errorf("failed[0].code = %v, mau BULKCOL-003", f["code"])
	}
	if f["reason"] != "Kode sudah ada" {
		t.Errorf("failed[0].reason = %v, mau 'Kode sudah ada'", f["reason"])
	}
	// 4 kode lain benar-benar ada di DB; kode bentrok tetap 1 baris.
	var n int64
	db.Model(&models.Voucher{}).Where("code LIKE ?", "BULKCOL-%").Count(&n)
	if n != 5 {
		t.Errorf("voucher di DB = %d, mau 5 (4 baru + 1 lama)", n)
	}
}

// TestBulkCreateVouchersTooMany: jumlah > 500 ditolak 400, tidak ada
// voucher yang dibuat.
func TestBulkCreateVouchersTooMany(t *testing.T) {
	db := auditTestDB(t)
	bulkTestSetup(t, db, "BULKMAX")
	defer bulkTestSetup(t, db, "BULKMAX")

	r := bulkTestRouter(db)
	code, res := bulkTestPost(t, r, bulkTestBody("BULKMAX", 501))
	if code != http.StatusBadRequest {
		t.Fatalf("status = %d, mau %d — body: %v", code, http.StatusBadRequest, res)
	}
	if res["message"] == nil || res["message"] == "" {
		t.Errorf("respons tanpa pesan error yang jelas: %v", res)
	}
	var n int64
	db.Model(&models.Voucher{}).Where("code LIKE ?", "BULKMAX-%").Count(&n)
	if n != 0 {
		t.Errorf("voucher di DB = %d, mau 0 (request ditolak utuh)", n)
	}
}

// TestBulkCreateVouchersInvalidPrefix: prefix kosong / karakter liar /
// terlalu panjang ditolak 400.
func TestBulkCreateVouchersInvalidPrefix(t *testing.T) {
	db := auditTestDB(t)
	bulkTestSetup(t, db, "BULKBAD")
	defer bulkTestSetup(t, db, "BULKBAD")

	r := bulkTestRouter(db)
	for _, prefix := range []string{"", "ADA SPASI", "ada_underscore", "TERLALUPANJANGPREFIX12345"} {
		body := bulkTestBody(prefix, 3)
		code, res := bulkTestPost(t, r, body)
		if code != http.StatusBadRequest {
			t.Errorf("prefix %q: status = %d, mau 400 — body: %v", prefix, code, res)
		}
	}
	var n int64
	db.Model(&models.Voucher{}).Where("code LIKE ?", "BULKBAD-%").Count(&n)
	if n != 0 {
		t.Errorf("voucher di DB = %d, mau 0", n)
	}
}

// TestBulkCreateVouchersPlanRequiresPackage: tipe plan tanpa plan_id
// ditolak; dengan plan_id yang tidak ada juga ditolak.
func TestBulkCreateVouchersPlanRequiresPackage(t *testing.T) {
	db := auditTestDB(t)
	bulkTestSetup(t, db, "BULKPLAN")
	defer bulkTestSetup(t, db, "BULKPLAN")

	r := bulkTestRouter(db)
	body := bulkTestBody("BULKPLAN", 2)
	body["type"] = "plan"
	delete(body, "plan_id")
	code, _ := bulkTestPost(t, r, body)
	if code != http.StatusBadRequest {
		t.Errorf("plan tanpa plan_id: status = %d, mau 400", code)
	}
	body["plan_id"] = 999999
	code, _ = bulkTestPost(t, r, body)
	if code != http.StatusBadRequest {
		t.Errorf("plan_id tidak ada: status = %d, mau 400", code)
	}
	var n int64
	db.Model(&models.Voucher{}).Where("code LIKE ?", "BULKPLAN-%").Count(&n)
	if n != 0 {
		t.Errorf("voucher di DB = %d, mau 0", n)
	}
}

// TestBulkCreateVouchersZeroDuration: jebakan default: yang sama seperti
// create satuan — Create(struct) mengganti duration=0 dengan default tag
// model (7). Bulk sekarang dibuat lewat map, jadi duration=0 tersimpan 0.
func TestBulkCreateVouchersZeroDuration(t *testing.T) {
	db := auditTestDB(t)
	bulkTestSetup(t, db, "BULKZERO")
	defer bulkTestSetup(t, db, "BULKZERO")

	r := bulkTestRouter(db)
	body := bulkTestBody("BULKZERO", 2)
	body["duration"] = 0
	code, res := bulkTestPost(t, r, body)
	if code != http.StatusCreated {
		t.Fatalf("status = %d, mau %d — body: %v", code, http.StatusCreated, res)
	}
	var vs []models.Voucher
	if err := db.Where("code LIKE ?", "BULKZERO-%").Find(&vs).Error; err != nil {
		t.Fatalf("baca voucher: %v", err)
	}
	if len(vs) != 2 {
		t.Fatalf("voucher di DB = %d, mau 2", len(vs))
	}
	for _, v := range vs {
		if v.Duration != 0 {
			t.Errorf("voucher %s: duration = %d, mau 0 (diganti default 7)", v.Code, v.Duration)
		}
	}
}
