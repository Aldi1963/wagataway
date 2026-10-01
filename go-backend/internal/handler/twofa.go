package handler

import (
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/pquerna/otp"
	"github.com/pquerna/otp/totp"
	"github.com/rs/zerolog/log"
	"github.com/skip2/go-qrcode"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const twoFAIssuer = "WaGataway"
const twoFAPendingTTL = 5 * time.Minute

// registerTwoFARoutes menggantikan stub di stubs.go dengan implementasi nyata.
func registerTwoFARoutes(rg *gin.RouterGroup, cfg *config.Config, db *gorm.DB) {
	twofa := rg.Group("/2fa")
	twofa.Use(middleware.AuthRequired(cfg))
	{
		twofa.GET("/status", handleTwoFAStatus(db))
		twofa.POST("/setup", handleTwoFASetup(db))
		twofa.POST("/enable", handleTwoFAEnable(db))
		twofa.POST("/disable", handleTwoFADisable(db))
		twofa.POST("/backup-codes/regenerate", handleTwoFARegenerateCodes(db))
	}
}

// generateTwoFAPendingToken membuat token sementara 5 menit untuk tahap
// verifikasi kode 2FA saat login. Token ini ditolak middleware AuthRequired.
func generateTwoFAPendingToken(cfg *config.Config, userID uint) (string, error) {
	claims := &middleware.Claims{
		UserID:  userID,
		Purpose: "2fa_pending",
		RegisteredClaims: jwt.RegisteredClaims{
			ExpiresAt: jwt.NewNumericDate(time.Now().Add(twoFAPendingTTL)),
			IssuedAt:  jwt.NewNumericDate(time.Now()),
		},
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(cfg.JWTSecret))
}

func handleTwoFAStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var user models.User
		if err := db.Select("id", "two_fa_enabled").First(&user, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Pengguna tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"enabled": user.TwoFAEnabled})
	}
}

// handleTwoFASetup membuat secret TOTP baru (belum aktif) + QR code.
func handleTwoFASetup(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Pengguna tidak ditemukan"})
			return
		}
		if user.TwoFAEnabled {
			c.JSON(http.StatusConflict, gin.H{"message": "2FA sudah aktif", "code": "2FA_ALREADY_ENABLED"})
			return
		}

		key, err := totp.Generate(totp.GenerateOpts{
			Issuer:      twoFAIssuer,
			AccountName: user.Email,
		})
		if err != nil {
			log.Error().Err(err).Msg("gagal generate TOTP")
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat secret 2FA"})
			return
		}

		user.TwoFASecret = key.Secret()
		if err := db.Save(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan secret 2FA"})
			return
		}

		qrPNG, err := qrcode.Encode(key.URL(), qrcode.Medium, 256)
		if err != nil {
			log.Error().Err(err).Msg("gagal render QR 2FA")
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat QR code"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"secret":      key.Secret(),
			"otpauth_url": key.URL(),
			"qr":          "data:image/png;base64," + base64.StdEncoding.EncodeToString(qrPNG),
		})
	}
}

type twoFACodeRequest struct {
	Code string `json:"code" binding:"required"`
}

// validateTOTPCode menerima kode 6 digit dengan toleransi skew ±1 periode.
func validateTOTPCode(secret, code string) bool {
	code = strings.TrimSpace(code)
	ok, err := totp.ValidateCustom(code, secret, time.Now().UTC(), totp.ValidateOpts{
		Period:    30,
		Skew:      1,
		Digits:    otp.DigitsSix,
		Algorithm: otp.AlgorithmSHA1,
	})
	return err == nil && ok
}

// generateBackupCodes membuat 10 kode cadangan; mengembalikan plaintext
// (tampil sekali) dan hash bcrypt untuk disimpan.
func generateBackupCodes() (plain []string, hashed []string, err error) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	plain = make([]string, 0, 10)
	hashed = make([]string, 0, 10)
	for i := 0; i < 10; i++ {
		b := make([]byte, 8)
		if _, err = rand.Read(b); err != nil {
			return nil, nil, err
		}
		var sb strings.Builder
		for _, v := range b {
			sb.WriteByte(alphabet[int(v)%len(alphabet)])
		}
		code := sb.String()
		hash, err := bcrypt.GenerateFromPassword([]byte(code), 10)
		if err != nil {
			return nil, nil, err
		}
		plain = append(plain, code)
		hashed = append(hashed, string(hash))
	}
	return plain, hashed, nil
}

func storeBackupCodes(db *gorm.DB, user *models.User, hashed []string) error {
	raw, err := json.Marshal(hashed)
	if err != nil {
		return err
	}
	user.TwoFABackupCodes = string(raw)
	return db.Save(user).Error
}

// tryBackupCode memeriksa kode cadangan; bila cocok, kode dipakai sekali
// (dihapus dari daftar) dan mengembalikan true.
func tryBackupCode(db *gorm.DB, user *models.User, code string) bool {
	if user.TwoFABackupCodes == "" {
		return false
	}
	var hashes []string
	if err := json.Unmarshal([]byte(user.TwoFABackupCodes), &hashes); err != nil {
		return false
	}
	code = strings.ToUpper(strings.TrimSpace(code))
	for i, h := range hashes {
		if bcrypt.CompareHashAndPassword([]byte(h), []byte(code)) == nil {
			remaining := append(hashes[:i], hashes[i+1:]...)
			raw, _ := json.Marshal(remaining)
			user.TwoFABackupCodes = string(raw)
			db.Save(user)
			return true
		}
	}
	return false
}

// handleTwoFAEnable mengaktifkan 2FA setelah kode TOTP terverifikasi.
func handleTwoFAEnable(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req twoFACodeRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Kode wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}
		userID := middleware.GetUserID(c)
		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Pengguna tidak ditemukan"})
			return
		}
		if user.TwoFAEnabled {
			c.JSON(http.StatusConflict, gin.H{"message": "2FA sudah aktif", "code": "2FA_ALREADY_ENABLED"})
			return
		}
		if user.TwoFASecret == "" || !validateTOTPCode(user.TwoFASecret, req.Code) {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Kode 2FA salah", "code": "INVALID_2FA_CODE"})
			return
		}

		plain, hashed, err := generateBackupCodes()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat kode cadangan"})
			return
		}
		user.TwoFAEnabled = true
		if err := storeBackupCodes(db, &user, hashed); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal mengaktifkan 2FA"})
			return
		}
		log.Info().Uint("user", userID).Msg("2FA diaktifkan")
		c.JSON(http.StatusOK, gin.H{
			"enabled":      true,
			"backup_codes": plain,
		})
	}
}

type twoFADisableRequest struct {
	Password string `json:"password" binding:"required"`
	Code     string `json:"code" binding:"required"`
}

// handleTwoFADisable menonaktifkan 2FA (butuh password + kode TOTP).
func handleTwoFADisable(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req twoFADisableRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Password dan kode wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}
		userID := middleware.GetUserID(c)
		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Pengguna tidak ditemukan"})
			return
		}
		if bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)) != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Password salah", "code": "INVALID_PASSWORD"})
			return
		}
		if !validateTOTPCode(user.TwoFASecret, req.Code) && !tryBackupCode(db, &user, req.Code) {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Kode 2FA salah", "code": "INVALID_2FA_CODE"})
			return
		}
		user.TwoFAEnabled = false
		user.TwoFASecret = ""
		user.TwoFABackupCodes = ""
		db.Save(&user)
		log.Info().Uint("user", userID).Msg("2FA dinonaktifkan")
		c.JSON(http.StatusOK, gin.H{"enabled": false})
	}
}

// handleTwoFARegenerateCodes membuat ulang kode cadangan (butuh kode TOTP valid).
func handleTwoFARegenerateCodes(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req twoFACodeRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Kode wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}
		userID := middleware.GetUserID(c)
		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Pengguna tidak ditemukan"})
			return
		}
		if !user.TwoFAEnabled {
			c.JSON(http.StatusBadRequest, gin.H{"message": "2FA belum aktif", "code": "2FA_NOT_ENABLED"})
			return
		}
		if !validateTOTPCode(user.TwoFASecret, req.Code) {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Kode 2FA salah", "code": "INVALID_2FA_CODE"})
			return
		}
		plain, hashed, err := generateBackupCodes()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat kode cadangan"})
			return
		}
		if err := storeBackupCodes(db, &user, hashed); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan kode cadangan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"backup_codes": plain})
	}
}

type twoFAVerifyRequest struct {
	Token string `json:"token" binding:"required"`
	Code  string `json:"code" binding:"required"`
}

// handleTwoFAVerify adalah tahap kedua login untuk akun ber-2FA:
// menukar token sementara + kode TOTP/kode cadangan menjadi token penuh.
func handleTwoFAVerify(cfg *config.Config, db *gorm.DB, waManager *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req twoFAVerifyRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Token dan kode wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}

		claims := &middleware.Claims{}
		token, err := jwt.ParseWithClaims(req.Token, claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(cfg.JWTSecret), nil
		})
		if err != nil || !token.Valid || claims.Purpose != "2fa_pending" {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Sesi verifikasi tidak valid atau kadaluarsa, silakan login ulang", "code": "INVALID_2FA_SESSION"})
			return
		}

		var user models.User
		if err := db.First(&user, claims.UserID).Error; err != nil || !user.TwoFAEnabled {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Verifikasi 2FA tidak valid", "code": "INVALID_2FA_SESSION"})
			return
		}

		// Kode 2FA salah juga dihitung ke proteksi brute-force.
		if user.LockedUntil != nil && user.LockedUntil.After(time.Now()) {
			c.JSON(http.StatusTooManyRequests, gin.H{"message": "Terlalu banyak percobaan gagal. Coba lagi nanti.", "code": "ACCOUNT_LOCKED"})
			return
		}

		if !validateTOTPCode(user.TwoFASecret, req.Code) && !tryBackupCode(db, &user, req.Code) {
			registerFailedAttempt(db, &user)
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Kode 2FA salah", "code": "INVALID_2FA_CODE"})
			return
		}
		if user.FailedAttempts != 0 || user.LockedUntil != nil {
			user.FailedAttempts = 0
			user.LockedUntil = nil
			db.Save(&user)
		}

		fullToken, jti, err := generateToken(cfg, &user)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat token", "code": "TOKEN_ERROR"})
			return
		}
		issueSession(db, user.ID, jti, c)

		trackLogin(db, waManager, &user, c)

		c.JSON(http.StatusOK, gin.H{
			"token": fullToken,
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
