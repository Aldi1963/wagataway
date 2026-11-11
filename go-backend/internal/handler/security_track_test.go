// Unit test item keamanan 5 & 10: pencabutan sesi saat ganti/reset password,
// dan team-login (brute-force lockout + jti + sesi tercatat).
//
// DB-backed (postgres test `wagataway_test`, pola trialTestDB): skip bila
// DATABASE_URL tidak diset atau DB test tidak terjangkau. TIDAK PERNAH
// menyentuh DB live `wagataway`.
package handler

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"net/url"
)

func secTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL tidak diset — lewati test keamanan")
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Skipf("DATABASE_URL tidak valid: %v", err)
	}
	u.Path = "/wagataway_test"
	db, err := gorm.Open(postgres.Open(u.String()), &gorm.Config{})
	if err != nil {
		t.Skipf("postgres test tidak terjangkau: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Skipf("gagal ambil sql.DB: %v", err)
	}
	if err := sqlDB.Ping(); err != nil {
		t.Skipf("postgres test tidak terjangkau: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.TeamMember{}, &models.Session{}, &models.PasswordResetToken{}); err != nil {
		t.Fatalf("AutoMigrate gagal: %v", err)
	}
	db.Exec("TRUNCATE users, team_members, sessions, password_reset_tokens RESTART IDENTITY CASCADE")
	return db
}

func secTestUser(t *testing.T, db *gorm.DB, email, password string) models.User {
	t.Helper()
	hashed, err := bcrypt.GenerateFromPassword([]byte(password), 12)
	if err != nil {
		t.Fatalf("hash gagal: %v", err)
	}
	user := models.User{Name: "Tester", Email: email, Password: string(hashed), Role: "user", Plan: "free", Status: "active"}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("buat user gagal: %v", err)
	}
	return user
}

func secTestSession(t *testing.T, db *gorm.DB, userID uint, jti string) {
	t.Helper()
	if err := db.Create(&models.Session{UserID: userID, JTI: jti, CreatedAt: time.Now(), LastSeen: time.Now()}).Error; err != nil {
		t.Fatalf("buat sesi gagal: %v", err)
	}
}

func secSessionRevoked(t *testing.T, db *gorm.DB, jti string) bool {
	t.Helper()
	var s models.Session
	if err := db.Where("jti = ?", jti).First(&s).Error; err != nil {
		t.Fatalf("sesi %s tidak ditemukan: %v", jti, err)
	}
	return s.RevokedAt != nil
}

// Item 5: revokeAllSessionsExcept mencabut semua kecuali jti yang dikecualikan.
func TestRevokeAllSessionsExcept(t *testing.T) {
	db := secTestDB(t)
	user := secTestUser(t, db, "revoke@test.local", "pass1234")
	secTestSession(t, db, user.ID, "jti-a")
	secTestSession(t, db, user.ID, "jti-b")
	secTestSession(t, db, user.ID, "jti-c")

	if err := revokeAllSessionsExcept(db, user.ID, "jti-b"); err != nil {
		t.Fatalf("revoke gagal: %v", err)
	}
	if !secSessionRevoked(t, db, "jti-a") || !secSessionRevoked(t, db, "jti-c") {
		t.Fatal("sesi lain harus tercabut")
	}
	if secSessionRevoked(t, db, "jti-b") {
		t.Fatal("sesi yang dikecualikan tidak boleh tercabut")
	}

	// Tanpa pengecualian: semua tercabut (jalur reset password).
	if err := revokeAllSessionsExcept(db, user.ID, ""); err != nil {
		t.Fatalf("revoke semua gagal: %v", err)
	}
	if !secSessionRevoked(t, db, "jti-b") {
		t.Fatal("tanpa pengecualian semua sesi harus tercabut")
	}
}

// Item 5 (end-to-end handler): ganti password mencabut sesi lain, bukan sesi berjalan.
func TestChangePasswordRevokesOtherSessions(t *testing.T) {
	db := secTestDB(t)
	user := secTestUser(t, db, "changepw@test.local", "oldpass123")
	secTestSession(t, db, user.ID, "jti-current")
	secTestSession(t, db, user.ID, "jti-other")

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("userID", user.ID)
	c.Set("sessionJTI", "jti-current")
	c.Request = httptest.NewRequest(http.MethodPost, "/api/auth/change-password",
		strings.NewReader(`{"currentPassword":"oldpass123","newPassword":"newpass123"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	handleChangePassword(db)(c)

	if w.Code != http.StatusOK {
		t.Fatalf("ganti password harus 200, got %d: %s", w.Code, w.Body.String())
	}
	if secSessionRevoked(t, db, "jti-current") {
		t.Fatal("sesi berjalan tidak boleh tercabut")
	}
	if !secSessionRevoked(t, db, "jti-other") {
		t.Fatal("sesi lain harus tercabut setelah ganti password")
	}
	var u models.User
	db.First(&u, user.ID)
	if err := bcrypt.CompareHashAndPassword([]byte(u.Password), []byte("newpass123")); err != nil {
		t.Fatal("password baru harus tersimpan")
	}
}

// Item 5 (end-to-end handler): reset password mencabut SEMUA sesi.
func TestResetPasswordRevokesAllSessions(t *testing.T) {
	db := secTestDB(t)
	user := secTestUser(t, db, "resetpw@test.local", "oldpass123")
	secTestSession(t, db, user.ID, "jti-1")
	secTestSession(t, db, user.ID, "jti-2")
	rawToken := "rawtoken1234567890abcdef"
	if err := db.Create(&models.PasswordResetToken{
		UserID: user.ID, TokenHash: hashResetToken(rawToken),
		ExpiresAt: time.Now().Add(30 * time.Minute),
	}).Error; err != nil {
		t.Fatalf("buat token reset gagal: %v", err)
	}

	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/auth/reset-password",
		strings.NewReader(`{"token":"`+rawToken+`","password":"brandnew123"}`))
	c.Request.Header.Set("Content-Type", "application/json")
	handleResetPassword(&config.Config{}, db)(c)

	if w.Code != http.StatusOK {
		t.Fatalf("reset password harus 200, got %d: %s", w.Code, w.Body.String())
	}
	if !secSessionRevoked(t, db, "jti-1") || !secSessionRevoked(t, db, "jti-2") {
		t.Fatal("semua sesi harus tercabut setelah reset password")
	}
}

// Item 10: team-login — 5x gagal -> kunci 15 menit; sukses -> jti + sesi tercatat.
func TestTeamLoginLockoutAndSession(t *testing.T) {
	db := secTestDB(t)
	owner := secTestUser(t, db, "owner@test.local", "ownerpass123")
	hashed, _ := bcrypt.GenerateFromPassword([]byte("memberpass123"), 12)
	member := models.TeamMember{OwnerID: owner.ID, Email: "member@test.local", Name: "Member", Role: "member", IsActive: true, Password: string(hashed)}
	if err := db.Create(&member).Error; err != nil {
		t.Fatalf("buat member gagal: %v", err)
	}

	cfg := &config.Config{JWTSecret: "test-secret-min-32-karakter-xxxx", JWTExpiry: 24 * time.Hour}
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.POST("/team-login", handleTeamLogin(cfg, db))
	call := func(password string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		req := httptest.NewRequest(http.MethodPost, "/team-login",
			strings.NewReader(`{"email":"member@test.local","password":"`+password+`"}`))
		req.Header.Set("Content-Type", "application/json")
		r.ServeHTTP(w, req)
		return w
	}

	for i := 0; i < 5; i++ {
		if w := call("salah123"); w.Code != http.StatusUnauthorized {
			t.Fatalf("percobaan gagal ke-%d harus 401, got %d", i+1, w.Code)
		}
	}
	// Terkunci: password benar pun ditolak 429.
	if w := call("memberpass123"); w.Code != http.StatusTooManyRequests {
		t.Fatalf("saat terkunci harus 429, got %d: %s", w.Code, w.Body.String())
	}
	var m models.TeamMember
	db.First(&m, member.ID)
	if m.LockedUntil == nil || m.LockedUntil.Before(time.Now()) {
		t.Fatal("member harus terkunci 15 menit setelah 5x gagal")
	}

	// Simulasikan masa kunci habis, lalu login benar harus sukses + berjti.
	past := time.Now().Add(-time.Minute)
	db.Model(&models.TeamMember{}).Where("id = ?", member.ID).Update("locked_until", past)
	w := call("memberpass123")
	if w.Code != http.StatusOK {
		t.Fatalf("login benar setelah kunci habis harus 200, got %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Token string `json:"token"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil || resp.Token == "" {
		t.Fatalf("respons harus berisi token: %s", w.Body.String())
	}
	claims := &middleware.Claims{}
	if _, err := jwt.ParseWithClaims(resp.Token, claims, func(t *jwt.Token) (interface{}, error) {
		return []byte(cfg.JWTSecret), nil
	}); err != nil {
		t.Fatalf("token harus valid: %v", err)
	}
	if claims.ID == "" {
		t.Fatal("token team-login harus membawa jti")
	}
	var s models.Session
	if err := db.Where("jti = ?", claims.ID).First(&s).Error; err != nil {
		t.Fatalf("sesi team-login harus tercatat: %v", err)
	}
	if s.RevokedAt != nil {
		t.Fatal("sesi baru tidak boleh tercabut")
	}
	if s.TeamMemberID == nil || *s.TeamMemberID != member.ID {
		t.Fatalf("sesi harus ditandai milik member %d, got %v", member.ID, s.TeamMemberID)
	}

	// Counter gagal ter-reset oleh login sukses: 1x salah -> 401 (bukan kunci).
	if w := call("salah123"); w.Code != http.StatusUnauthorized {
		t.Fatalf("setelah sukses, 1x salah harus 401, got %d", w.Code)
	}
	db.First(&m, member.ID)
	if m.FailedAttempts != 1 {
		t.Fatalf("hitungan gagal harus 1 setelah 1x salah, got %d", m.FailedAttempts)
	}
}
