package handler

import (
	"net/http"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
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
		auth.POST("/google", handleGoogleLogin(cfg, db))
		auth.GET("/me", middleware.AuthRequired(cfg), handleGetMe(db))
		auth.POST("/logout", handleLogout())
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
			c.JSON(http.StatusForbidden, gin.H{"message": "Akun Anda telah diblokir", "code": "ACCOUNT_BANNED"})
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

func handleGoogleLogin(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Credential string `json:"credential" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}

		// TODO: Verify Google ID token and extract user info
		// For now, placeholder response
		c.JSON(http.StatusNotImplemented, gin.H{"message": "Google OAuth belum diimplementasi", "code": "NOT_IMPLEMENTED"})
	}
}

func handleGetMe(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

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
