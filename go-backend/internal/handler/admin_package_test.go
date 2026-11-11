package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Test create + edit paket admin menerima snake_case, camelCase, dan campur.
// Bug binding: form admin (Admin.tsx handleSave) mengirim max_devices/
// max_messages/max_contacts/is_active (snake_case) + maxBulk/maxAutoReply
// (camelCase), sementara tag JSON model Plan camelCase. Sebelum perbaikan:
// - CREATE: field snake_case diam-diam hilang (paket baru tersimpan
//   1/1000/500/true padahal form mengirim 5/5000/250/false).
// - EDIT: body campur membuat GORM Updates gagal total ("no such column:
//   maxAutoReply") dan error-nya ditelan lalu dibalas 200 — edit paket
//   adalah no-op diam-diam.

func seedPackageTestPlan(t *testing.T, db *gorm.DB, slug string) models.Plan {
	t.Helper()
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.AdminActivityLog{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	plan := models.Plan{Name: "Paket Uji " + slug, Slug: slug, Price: 1000, Duration: 30,
		MaxDevices: 1, MaxMessages: 1000, MaxContacts: 100, MaxBulk: 100, MaxAutoReply: 5, IsActive: true}
	if err := db.Where("slug = ?", slug).FirstOrCreate(&plan).Error; err != nil {
		t.Fatalf("seed plan: %v", err)
	}
	return plan
}

func deletePlanBySlug(t *testing.T, db *gorm.DB, slug string) {
	t.Helper()
	db.Where("slug = ?", slug).Delete(&models.Plan{})
}

func packageTestRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	// Meniru middleware JWT: menanam userID admin di konteks agar
	// logAdminAction (via middleware.GetUserID) tidak panic.
	r.Use(func(c *gin.Context) {
		c.Set("userID", uint(92001))
		c.Next()
	})
	r.POST("/admin/packages", adminCreatePackage(db))
	r.PUT("/admin/packages/:id", adminUpdatePackage(db))
	return r
}

func callPackageCreate(t *testing.T, r *gin.Engine, body map[string]interface{}) (int, map[string]interface{}) {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/admin/packages", bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	var parsed map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("respons bukan JSON (status %d): %s", w.Code, w.Body.String())
	}
	return w.Code, parsed
}

func callPackageUpdate(t *testing.T, r *gin.Engine, id uint, body map[string]interface{}) (int, map[string]interface{}) {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/admin/packages/%d", id), bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	var parsed map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("respons bukan JSON (status %d): %s", w.Code, w.Body.String())
	}
	return w.Code, parsed
}

func readPlan(t *testing.T, db *gorm.DB, id uint) models.Plan {
	t.Helper()
	var p models.Plan
	if err := db.First(&p, id).Error; err != nil {
		t.Fatalf("baca paket: %v", err)
	}
	return p
}

func TestAdminCreatePackageSnakeCase(t *testing.T) {
	db := auditTestDB(t)
	slug := "paket-uji-snake"
	deletePlanBySlug(t, db, slug)
	defer deletePlanBySlug(t, db, slug)

	r := packageTestRouter(db)
	// Body persis form admin (Admin.tsx handleSave): max_devices/
	// max_messages/max_contacts/is_active snake_case, maxBulk/maxAutoReply
	// camelCase — nilai 5/5000/250/false seperti laporan bug.
	status, _ := callPackageCreate(t, r, map[string]interface{}{
		"name": slug, "slug": slug, "price": 50000, "duration": 30,
		"max_devices": 5, "max_messages": 5000, "max_contacts": 250,
		"maxBulk": 100, "maxAutoReply": 5, "is_active": false,
	})
	if status != http.StatusCreated {
		t.Fatalf("status = %d, mau 201", status)
	}
	var p models.Plan
	if err := db.Where("slug = ?", slug).First(&p).Error; err != nil {
		t.Fatalf("baca paket: %v", err)
	}
	if p.MaxDevices != 5 {
		t.Errorf("maxDevices = %d, mau 5 (max_devices tidak tersimpan)", p.MaxDevices)
	}
	if p.MaxMessages != 5000 {
		t.Errorf("maxMessages = %d, mau 5000 (max_messages tidak tersimpan)", p.MaxMessages)
	}
	if p.MaxContacts != 250 {
		t.Errorf("maxContacts = %d, mau 250 (max_contacts tidak tersimpan)", p.MaxContacts)
	}
	if p.MaxBulk != 100 {
		t.Errorf("maxBulk = %d, mau 100", p.MaxBulk)
	}
	if p.MaxAutoReply != 5 {
		t.Errorf("maxAutoReply = %d, mau 5", p.MaxAutoReply)
	}
	if p.IsActive {
		t.Errorf("isActive = true, mau false (is_active tidak tersimpan)")
	}
}

func TestAdminCreatePackageCamelCase(t *testing.T) {
	db := auditTestDB(t)
	slug := "paket-uji-camel"
	deletePlanBySlug(t, db, slug)
	defer deletePlanBySlug(t, db, slug)

	r := packageTestRouter(db)
	status, _ := callPackageCreate(t, r, map[string]interface{}{
		"name": slug, "slug": slug, "price": 25000, "duration": 30,
		"maxDevices": 2, "maxMessages": 2000, "maxContacts": 1000,
		"maxBulk": 250, "maxAutoReply": 10, "isActive": true,
	})
	if status != http.StatusCreated {
		t.Fatalf("status = %d, mau 201", status)
	}
	var p models.Plan
	if err := db.Where("slug = ?", slug).First(&p).Error; err != nil {
		t.Fatalf("baca paket: %v", err)
	}
	if p.MaxDevices != 2 || p.MaxMessages != 2000 || p.MaxContacts != 1000 {
		t.Errorf("batas = %d/%d/%d, mau 2/2000/1000", p.MaxDevices, p.MaxMessages, p.MaxContacts)
	}
	if p.MaxBulk != 250 || p.MaxAutoReply != 10 {
		t.Errorf("bulk/autoReply = %d/%d, mau 250/10", p.MaxBulk, p.MaxAutoReply)
	}
	if !p.IsActive {
		t.Errorf("isActive = false, mau true")
	}
}

func TestAdminCreatePackageBothSpellingsCamelWins(t *testing.T) {
	db := auditTestDB(t)
	slug := "paket-uji-dual"
	deletePlanBySlug(t, db, slug)
	defer deletePlanBySlug(t, db, slug)

	r := packageTestRouter(db)
	status, _ := callPackageCreate(t, r, map[string]interface{}{
		"name": slug, "slug": slug, "price": 1000, "duration": 30,
		"maxDevices": 7, "max_devices": 99,
		"maxBulk": 11, "max_bulk": 99,
		"isActive": true, "is_active": false,
	})
	if status != http.StatusCreated {
		t.Fatalf("status = %d, mau 201", status)
	}
	var p models.Plan
	if err := db.Where("slug = ?", slug).First(&p).Error; err != nil {
		t.Fatalf("baca paket: %v", err)
	}
	if p.MaxDevices != 7 {
		t.Errorf("maxDevices = %d, mau 7 (camelCase harus menang)", p.MaxDevices)
	}
	if p.MaxBulk != 11 {
		t.Errorf("maxBulk = %d, mau 11 (camelCase harus menang)", p.MaxBulk)
	}
	if !p.IsActive {
		t.Errorf("isActive = false, mau true (camelCase harus menang)")
	}
}

func TestAdminUpdatePackageMixed(t *testing.T) {
	db := auditTestDB(t)
	slug := "paket-uji-edit-campur"
	plan := seedPackageTestPlan(t, db, slug)
	defer deletePlanBySlug(t, db, slug)

	r := packageTestRouter(db)
	// Body persis form admin saat edit: campur snake_case + camelCase.
	// Sebelum perbaikan: status 200 tapi TIDAK ADA satu field pun yang
	// tersimpan (GORM "no such column: maxAutoReply", error ditelan).
	status, _ := callPackageUpdate(t, r, plan.ID, map[string]interface{}{
		"name": "Paket Uji Edit Campur", "slug": slug, "price": 66000, "duration": 30,
		"max_devices": 3, "max_messages": 10000, "max_contacts": 2500,
		"maxBulk": 500, "maxAutoReply": 20, "is_active": false,
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, mau 200", status)
	}
	p := readPlan(t, db, plan.ID)
	if p.MaxDevices != 3 {
		t.Errorf("maxDevices = %d, mau 3 (tidak tersimpan)", p.MaxDevices)
	}
	if p.MaxMessages != 10000 {
		t.Errorf("maxMessages = %d, mau 10000 (tidak tersimpan)", p.MaxMessages)
	}
	if p.MaxContacts != 2500 {
		t.Errorf("maxContacts = %d, mau 2500 (tidak tersimpan)", p.MaxContacts)
	}
	if p.MaxBulk != 500 {
		t.Errorf("maxBulk = %d, mau 500 (tidak tersimpan)", p.MaxBulk)
	}
	if p.MaxAutoReply != 20 {
		t.Errorf("maxAutoReply = %d, mau 20 (tidak tersimpan)", p.MaxAutoReply)
	}
	if p.IsActive {
		t.Errorf("isActive = true, mau false (tidak tersimpan)")
	}
	if p.Price != 66000 {
		t.Errorf("price = %d, mau 66000", p.Price)
	}
}

func TestAdminUpdatePackageSnakeOnly(t *testing.T) {
	db := auditTestDB(t)
	slug := "paket-uji-edit-snake"
	plan := seedPackageTestPlan(t, db, slug)
	defer deletePlanBySlug(t, db, slug)

	r := packageTestRouter(db)
	status, _ := callPackageUpdate(t, r, plan.ID, map[string]interface{}{
		"max_devices": 9, "max_messages": 9000, "max_contacts": 900,
		"max_bulk": 90, "max_auto_reply": 9, "is_active": true,
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, mau 200", status)
	}
	p := readPlan(t, db, plan.ID)
	if p.MaxDevices != 9 {
		t.Errorf("maxDevices = %d, mau 9", p.MaxDevices)
	}
	if p.MaxMessages != 9000 || p.MaxContacts != 900 {
		t.Errorf("messages/contacts = %d/%d, mau 9000/900", p.MaxMessages, p.MaxContacts)
	}
	if p.MaxBulk != 90 || p.MaxAutoReply != 9 {
		t.Errorf("bulk/autoReply = %d/%d, mau 90/9", p.MaxBulk, p.MaxAutoReply)
	}
}

func TestAdminUpdatePackageBothSpellingsCamelWins(t *testing.T) {
	db := auditTestDB(t)
	slug := "paket-uji-edit-dual"
	plan := seedPackageTestPlan(t, db, slug)
	defer deletePlanBySlug(t, db, slug)

	r := packageTestRouter(db)
	status, _ := callPackageUpdate(t, r, plan.ID, map[string]interface{}{
		"maxDevices": 4, "max_devices": 99,
		"maxBulk": 44, "max_bulk": 99,
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, mau 200", status)
	}
	p := readPlan(t, db, plan.ID)
	if p.MaxDevices != 4 {
		t.Errorf("maxDevices = %d, mau 4 (camelCase harus menang)", p.MaxDevices)
	}
	if p.MaxBulk != 44 {
		t.Errorf("maxBulk = %d, mau 44 (camelCase harus menang)", p.MaxBulk)
	}
}

func TestAdminUpdatePackageInvalidValueReturnsError(t *testing.T) {
	db := auditTestDB(t)
	slug := "paket-uji-edit-gagal"
	plan := seedPackageTestPlan(t, db, slug)
	defer deletePlanBySlug(t, db, slug)

	r := packageTestRouter(db)
	// Nilai yang tidak bisa disimpan sebagai integer: UPDATE harus gagal
	// dan handler HARUS membalas error, bukan 200 seperti dulu.
	status, _ := callPackageUpdate(t, r, plan.ID, map[string]interface{}{
		"max_devices": "bukan-angka",
	})
	if status == http.StatusOK {
		t.Fatalf("status = 200, padahal UPDATE gagal — error ditelan lagi")
	}
	if status != http.StatusInternalServerError {
		t.Fatalf("status = %d, mau 500", status)
	}
	// Baris harus tetap utuh (UPDATE gagal total, bukan setengah jalan).
	p := readPlan(t, db, plan.ID)
	if p.MaxDevices != 1 {
		t.Errorf("maxDevices = %d, mau 1 (baris berubah padahal UPDATE gagal)", p.MaxDevices)
	}
}

func TestAdminUpdatePackageNotFound(t *testing.T) {
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.AdminActivityLog{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	r := packageTestRouter(db)
	status, _ := callPackageUpdate(t, r, 999999, map[string]interface{}{
		"max_devices": 3,
	})
	if status != http.StatusNotFound {
		t.Fatalf("status = %d, mau 404", status)
	}
}
