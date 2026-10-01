package handler

import (
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

type loginRequest struct {
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

type registerRequest struct {
	Name     string `json:"name" binding:"required,min=2"`
	Email    string `json:"email" binding:"required,email"`
	Password string `json:"password" binding:"required,min=6"`
}

func registerAuthRoutes(rg *gin.RouterGroup, cfg *config.Config, db *gorm.DB) {
	auth := rg.Group("/auth")
	auth.Use(middleware.AuthRateLimit.Middleware())
	{
		auth.POST("/login", handleLogin(cfg, db))
		auth.POST("/register", handleRegister(cfg, db))
		auth.GET("/me", middleware.AuthRequired(cfg), handleGetMe(db))
		auth.PATCH("/me", middleware.AuthRequired(cfg), handleUpdateMe(db))
		auth.POST("/change-password", middleware.AuthRequired(cfg), handleChangePassword(db))
		auth.POST("/logout", handleLogout())
		auth.POST("/forgot-password", handleForgotPassword(cfg, db))
		auth.POST("/reset-password", handleResetPassword(cfg, db))
	}
}

func handleLogin(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req loginRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}

		var user models.User
		if err := db.Where("email = ?", req.Email).First(&user).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Email atau password salah", "code": "INVALID_CREDENTIALS"})
			return
		}

		if user.Status == "banned" {
			// Pesan generik yang sama seperti kredensial salah agar tidak
			// membocorkan status akun (anti user-enumeration).
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Email atau password salah", "code": "INVALID_CREDENTIALS"})
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Email atau password salah", "code": "INVALID_CREDENTIALS"})
			return
		}

		// Check 2FA
		if user.TwoFAEnabled {
			c.JSON(http.StatusOK, gin.H{
				"requires2FA": true,
				"userId":      user.ID,
			})
			return
		}

		token, err := generateToken(cfg, &user)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat token", "code": "TOKEN_ERROR"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"token": token,
			"user": gin.H{
				"id":     user.ID,
				"name":   user.Name,
				"email":  user.Email,
				"role":   user.Role,
				"plan":   user.Plan,
				"avatar": user.Avatar,
			},
		})
	}
}

func handleRegister(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req registerRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}

		// Check email exists
		var count int64
		db.Model(&models.User{}).Where("email = ?", req.Email).Count(&count)
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"message": "Email sudah terdaftar", "code": "EMAIL_EXISTS"})
			return
		}

		// Hash password
		hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memproses registrasi", "code": "INTERNAL_ERROR"})
			return
		}

		user := models.User{
			Name:     req.Name,
			Email:    req.Email,
			Password: string(hashed),
			Role:     "user",
			Plan:     "free",
			Status:   "active",
			Timezone: "Asia/Jakarta",
		}

		if err := db.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat akun", "code": "CREATE_ERROR"})
			return
		}

		// Fitur 7: beri trial paket Lite 7 hari secara otomatis. Sekali per
		// user (guard di dalam createTrialSubscription). Kegagalan pembuatan
		// trial TIDAK menggagalkan registrasi — user tetap terdaftar.
		if createTrialSubscription(db, &user) {
			user.Plan = trialPlanSlug
		}

		token, err := generateToken(cfg, &user)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat token", "code": "TOKEN_ERROR"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"token": token,
			"user": gin.H{
				"id":    user.ID,
				"name":  user.Name,
				"email": user.Email,
				"role":  user.Role,
				"plan":  user.Plan,
			},
		})
	}
}

// Fitur 7 (Trial 7 hari otomatis):
// Slug paket yang diberikan sebagai trial saat registrasi baru.
const trialPlanSlug = "lite"

// trialDurationDays: durasi masa trial dalam hari kalender.
const trialDurationDays = 7

// createTrialSubscription memberi user baru langganan trial paket Lite
// 7 hari (is_trial=true, status aktif).
//
// Guard sekali-per-user: trial hanya dibuat bila user BELUM punya
// subscription apapun — mencegah trial ganda dari retry register / double
// submit (percobaan register ulang untuk email yang sama ditolak di tahap
// EMAIL_EXISTS sebelum sampai ke sini).
//
// Trial mengikuti semua aturan langganan yang sudah ada tanpa kode khusus:
// kuota Lite (quota.TrialMonthlyLimit), reminder H-3/H-1 (worker), dan
// grace period (paket subscription). Kolom user.plan disinkronkan ke
// slug paket trial agar konsisten dengan alur aktivasi berbayar.
//
// Kegagalan pembuatan trial TIDAK menggagalkan registrasi — user tetap
// terdaftar, hanya tanpa trial. Mengembalikan true bila trial dibuat.
func createTrialSubscription(db *gorm.DB, user *models.User) bool {
	var count int64
	if err := db.Model(&models.Subscription{}).
		Where("user_id = ?", user.ID).
		Count(&count).Error; err != nil {
		log.Error().Err(err).Uint("userID", user.ID).
			Msg("trial: gagal cek subscription user, lewati pembuatan trial")
		return false
	}
	if count > 0 {
		// Bukan registrasi baru — user sudah punya riwayat langganan.
		return false
	}

	var plan models.Plan
	if err := db.Where("slug = ? AND is_active = ?", trialPlanSlug, true).
		First(&plan).Error; err != nil {
		log.Error().Err(err).Str("slug", trialPlanSlug).
			Msg("trial: paket trial tidak ditemukan, lewati pembuatan trial")
		return false
	}

	now := time.Now()
	sub := models.Subscription{
		UserID:    user.ID,
		PlanID:    plan.ID,
		Status:    "active",
		IsTrial:   true,
		StartDate: now,
		EndDate:   now.AddDate(0, 0, trialDurationDays),
	}
	if err := db.Create(&sub).Error; err != nil {
		log.Error().Err(err).Uint("userID", user.ID).
			Msg("trial: gagal membuat subscription trial")
		return false
	}
	if err := db.Model(&models.User{}).Where("id = ?", user.ID).
		Update("plan", plan.Slug).Error; err != nil {
		log.Error().Err(err).Uint("userID", user.ID).
			Msg("trial: gagal sinkron kolom plan user")
	}
	log.Info().Uint("userID", user.ID).Uint("planID", plan.ID).
		Msg("trial: subscription trial 7 hari dibuat")
	return true
}

func handleGetMe(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)

		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "User tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"user": gin.H{
				"id":           user.ID,
				"name":         user.Name,
				"email":        user.Email,
				"phone":        user.Phone,
				"notifyWa":     user.NotifyWA,
				"role":         user.Role,
				"plan":         user.Plan,
				"avatar":       user.Avatar,
				"twoFaEnabled": user.TwoFAEnabled,
				"timezone":     user.Timezone,
				"createdAt":    user.CreatedAt,
			},
		})
	}
}

func handleLogout() gin.HandlerFunc {
	return func(c *gin.Context) {
		// JWT is stateless — client just discards the token
		c.JSON(http.StatusOK, gin.H{"message": "Berhasil logout"})
	}
}

type updateMeRequest struct {
	Name     *string `json:"name"`
	NotifyWA *string `json:"notifyWa"`
}

// normalizeNotifyWA menormalisasi nomor notifikasi WA ke format 62xxxxxxxxxx.
// Mengembalikan "" bila input kosong (boleh dikosongkan = tidak dikirimi reminder)
// dan error bila formatnya tidak valid.
func normalizeNotifyWA(raw string) (string, error) {
	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, raw)
	if digits == "" {
		return "", nil
	}
	if strings.HasPrefix(digits, "0") {
		digits = "62" + digits[1:]
	}
	if len(digits) < 9 || len(digits) > 16 {
		return "", errors.New("nomor WA harus 9-16 digit")
	}
	return digits, nil
}

func handleUpdateMe(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)

		var req updateMeRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}

		updates := map[string]interface{}{}
		if req.Name != nil {
			name := strings.TrimSpace(*req.Name)
			if len(name) < 2 || len(name) > 100 {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Nama tidak valid (min. 2 karakter)", "code": "VALIDATION_ERROR"})
				return
			}
			updates["name"] = name
		}
		if req.NotifyWA != nil {
			normalized, err := normalizeNotifyWA(strings.TrimSpace(*req.NotifyWA))
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"message": err.Error(), "code": "VALIDATION_ERROR"})
				return
			}
			updates["notify_wa"] = normalized
		}
		if len(updates) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Tidak ada perubahan", "code": "VALIDATION_ERROR"})
			return
		}

		if err := db.Model(&models.User{}).Where("id = ?", userID).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan perubahan", "code": "SERVER_ERROR"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Informasi akun berhasil disimpan"})
	}
}

type changePasswordRequest struct {
	CurrentPassword string `json:"currentPassword" binding:"required"`
	NewPassword     string `json:"newPassword" binding:"required,min=6,max=100"`
}

func handleChangePassword(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)

		var req changePasswordRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Password baru minimal 6 karakter", "code": "VALIDATION_ERROR"})
			return
		}

		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "User tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.CurrentPassword)); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Password saat ini salah", "code": "INVALID_CURRENT_PASSWORD"})
			return
		}

		hashed, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), 12)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memproses password", "code": "SERVER_ERROR"})
			return
		}

		if err := db.Model(&user).Update("password", string(hashed)).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal mengubah password", "code": "SERVER_ERROR"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Password berhasil diubah"})
	}
}

func generateToken(cfg *config.Config, user *models.User) (string, error) {
	claims := &middleware.Claims{
		UserID: user.ID,
		Email:  user.Email,
		Role:   user.Role,
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(cfg.JWTExpiry)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWTSecret))
}
