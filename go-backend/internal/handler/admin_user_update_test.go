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

// Test edit user admin (temuan error-handling): adminUpdateUser dulu memakai
// db.Model(&user).Updates(req) dari map mentah TANPA cek error — kunci
// camelCase yang bukan nama kolom (notifyWa, twoFaEnabled) membuat UPDATE
// gagal total ("no such column") dan error-nya ditelan lalu dibalas 200:
// edit user adalah no-op diam-diam. Sekarang kunci dinormalisasi ke nama
// kolom DB (camelCase menang bila keduanya dikirim, kunci tak dikenal
// dibuang) dan error UPDATE dikembalikan, bukan 200.

func seedUserUpdateUser(t *testing.T, db *gorm.DB, email string) models.User {
	t.Helper()
	if err := db.AutoMigrate(&models.User{}, &models.AdminActivityLog{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	db.Unscoped().Where("email = ?", email).Delete(&models.User{})
	u := models.User{
		Name: "User Uji", Email: email, Password: "hash-lama",
		Role: "user", Plan: "free", Status: "active", Timezone: "Asia/Jakarta",
	}
	if err := db.Create(&u).Error; err != nil {
		t.Fatalf("seed user: %v", err)
	}
	return u
}

func deleteUserByEmail(t *testing.T, db *gorm.DB, email string) {
	t.Helper()
	db.Unscoped().Where("email = ?", email).Delete(&models.User{})
}

func userUpdateRouter(db *gorm.DB) *gin.Engine {
	gin.SetMode(gin.TestMode)
	r := gin.New()
	// Meniru middleware JWT: menanam userID admin di konteks agar
	// logAdminAction (via middleware.GetUserID) tidak panic.
	r.Use(func(c *gin.Context) {
		c.Set("userID", uint(92001))
		c.Next()
	})
	r.PUT("/admin/users/:id", adminUpdateUser(db))
	return r
}

func callUserUpdate(t *testing.T, r *gin.Engine, id uint, body map[string]interface{}) (int, map[string]interface{}) {
	t.Helper()
	b, err := json.Marshal(body)
	if err != nil {
		t.Fatalf("marshal body: %v", err)
	}
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPut, fmt.Sprintf("/admin/users/%d", id), bytes.NewReader(b))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	var parsed map[string]interface{}
	if err := json.Unmarshal(w.Body.Bytes(), &parsed); err != nil {
		t.Fatalf("respons bukan JSON (status %d): %s", w.Code, w.Body.String())
	}
	return w.Code, parsed
}

func readUser(t *testing.T, db *gorm.DB, id uint) models.User {
	t.Helper()
	var u models.User
	if err := db.First(&u, id).Error; err != nil {
		t.Fatalf("baca user: %v", err)
	}
	return u
}

func TestAdminUpdateUserCamelCase(t *testing.T) {
	db := auditTestDB(t)
	email := "uji-user-camel@contoh.id"
	u := seedUserUpdateUser(t, db, email)
	defer deleteUserByEmail(t, db, email)

	r := userUpdateRouter(db)
	status, _ := callUserUpdate(t, r, u.ID, map[string]interface{}{
		"notifyWa": "6281234567890", "twoFaEnabled": true,
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, mau 200", status)
	}
	got := readUser(t, db, u.ID)
	if got.NotifyWA != "6281234567890" {
		t.Errorf("notify_wa = %q, mau 6281234567890 (notifyWa tidak tersimpan)", got.NotifyWA)
	}
	if !got.TwoFAEnabled {
		t.Errorf("two_fa_enabled = false, mau true (twoFaEnabled tidak tersimpan)")
	}
}

func TestAdminUpdateUserFormFields(t *testing.T) {
	db := auditTestDB(t)
	email := "uji-user-form@contoh.id"
	u := seedUserUpdateUser(t, db, email)
	defer deleteUserByEmail(t, db, email)

	r := userUpdateRouter(db)
	// Bentuk body persis form admin (Admin.tsx updateField): satu kunci
	// sekali, role/plan/status.
	status, _ := callUserUpdate(t, r, u.ID, map[string]interface{}{"role": "admin"})
	if status != http.StatusOK {
		t.Fatalf("status role = %d, mau 200", status)
	}
	status, _ = callUserUpdate(t, r, u.ID, map[string]interface{}{"plan": "pro"})
	if status != http.StatusOK {
		t.Fatalf("status plan = %d, mau 200", status)
	}
	status, _ = callUserUpdate(t, r, u.ID, map[string]interface{}{"status": "suspended"})
	if status != http.StatusOK {
		t.Fatalf("status status = %d, mau 200", status)
	}
	got := readUser(t, db, u.ID)
	if got.Role != "admin" || got.Plan != "pro" || got.Status != "suspended" {
		t.Errorf("role/plan/status = %q/%q/%q, mau admin/pro/suspended", got.Role, got.Plan, got.Status)
	}
}

func TestAdminUpdateUserMixedSpellingCamelWins(t *testing.T) {
	db := auditTestDB(t)
	email := "uji-user-dual@contoh.id"
	u := seedUserUpdateUser(t, db, email)
	defer deleteUserByEmail(t, db, email)

	r := userUpdateRouter(db)
	status, _ := callUserUpdate(t, r, u.ID, map[string]interface{}{
		"notifyWa": "6281111111111", "notify_wa": "6282222222222",
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, mau 200", status)
	}
	got := readUser(t, db, u.ID)
	if got.NotifyWA != "6281111111111" {
		t.Errorf("notify_wa = %q, mau 6281111111111 (camelCase harus menang)", got.NotifyWA)
	}
}

func TestAdminUpdateUserUnknownKeysIgnored(t *testing.T) {
	db := auditTestDB(t)
	email := "uji-user-unknown@contoh.id"
	u := seedUserUpdateUser(t, db, email)
	defer deleteUserByEmail(t, db, email)

	r := userUpdateRouter(db)
	status, _ := callUserUpdate(t, r, u.ID, map[string]interface{}{
		"role": "admin", "foo": "bar", "id": 999, "uuid": "bukan-uuid",
	})
	if status != http.StatusOK {
		t.Fatalf("status = %d, mau 200", status)
	}
	got := readUser(t, db, u.ID)
	if got.Role != "admin" {
		t.Errorf("role = %q, mau admin", got.Role)
	}
	if got.ID != u.ID {
		t.Errorf("id = %d, mau %d (id tidak boleh berubah)", got.ID, u.ID)
	}
}

func TestAdminUpdateUserPasswordNotChanged(t *testing.T) {
	db := auditTestDB(t)
	email := "uji-user-pass@contoh.id"
	u := seedUserUpdateUser(t, db, email)
	defer deleteUserByEmail(t, db, email)

	r := userUpdateRouter(db)
	status, _ := callUserUpdate(t, r, u.ID, map[string]interface{}{
		"password": "password-baru-123",
	})
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, mau 400 (password saja bukan perubahan valid)", status)
	}
	got := readUser(t, db, u.ID)
	if got.Password != "hash-lama" {
		t.Errorf("password berubah (tidak boleh diubah lewat endpoint ini)")
	}
}

func TestAdminUpdateUserInvalidRole(t *testing.T) {
	db := auditTestDB(t)
	email := "uji-user-role@contoh.id"
	u := seedUserUpdateUser(t, db, email)
	defer deleteUserByEmail(t, db, email)

	r := userUpdateRouter(db)
	status, _ := callUserUpdate(t, r, u.ID, map[string]interface{}{"role": "superadmin"})
	if status != http.StatusBadRequest {
		t.Fatalf("status = %d, mau 400", status)
	}
	got := readUser(t, db, u.ID)
	if got.Role != "user" {
		t.Errorf("role = %q, mau tetap user", got.Role)
	}
}

func TestAdminUpdateUserDuplicateEmail(t *testing.T) {
	db := auditTestDB(t)
	email1 := "uji-user-dup1@contoh.id"
	email2 := "uji-user-dup2@contoh.id"
	seedUserUpdateUser(t, db, email1)
	defer deleteUserByEmail(t, db, email1)
	u2 := seedUserUpdateUser(t, db, email2)
	defer deleteUserByEmail(t, db, email2)

	r := userUpdateRouter(db)
	status, res := callUserUpdate(t, r, u2.ID, map[string]interface{}{"email": email1})
	if status != http.StatusConflict {
		t.Fatalf("status = %d, mau 409 — body: %v", status, res)
	}
	got := readUser(t, db, u2.ID)
	if got.Email != email2 {
		t.Errorf("email = %q, mau tetap %q", got.Email, email2)
	}
}

func TestAdminUpdateUserNotFound(t *testing.T) {
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.AdminActivityLog{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	r := userUpdateRouter(db)
	status, _ := callUserUpdate(t, r, 999999999, map[string]interface{}{"role": "admin"})
	if status != http.StatusNotFound {
		t.Fatalf("status = %d, mau 404", status)
	}
}
