package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"net/smtp"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

const resetTokenTTL = 30 * time.Minute

func hashResetToken(token string) string {
	sum := sha256.Sum256([]byte(token))
	return hex.EncodeToString(sum[:])
}

// issueResetToken membuat token reset sekali pakai untuk seorang user:
// membatalkan token lama yang belum dipakai, menyimpan HANYA hash token
// (bukan token mentah) dengan TTL 30 menit, lalu mengembalikan token mentah
// SEKALI ke pemanggil. Pemanggil wajib TIDAK mencatat token mentah itu ke
// log server, ke admin_activity_logs, atau menyimpannya di mana pun.
func issueResetToken(db *gorm.DB, userID uint) (string, time.Time, error) {
	now := time.Now()
	db.Model(&models.PasswordResetToken{}).
		Where("user_id = ? AND used_at IS NULL", userID).
		Update("used_at", now)

	raw := make([]byte, 32)
	if _, err := rand.Read(raw); err != nil {
		return "", time.Time{}, err
	}
	token := hex.EncodeToString(raw)
	expiresAt := now.Add(resetTokenTTL)
	if err := db.Create(&models.PasswordResetToken{
		UserID:    userID,
		TokenHash: hashResetToken(token),
		ExpiresAt: expiresAt,
	}).Error; err != nil {
		return "", time.Time{}, err
	}
	return token, expiresAt, nil
}

// handleForgotPassword membuat token reset sekali pakai dan mengirim link via email.
// Selalu balas sukses agar tidak membocorkan email terdaftar atau tidak.
func handleForgotPassword(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Email string `json:"email"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Email) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Email wajib diisi", "code": "EMAIL_REQUIRED"})
			return
		}
		email := strings.ToLower(strings.TrimSpace(req.Email))

		var user models.User
		if err := db.Where("email = ?", email).First(&user).Error; err == nil && user.Status == "active" {
			token, _, err := issueResetToken(db, user.ID)
			if err != nil {
				log.Error().Err(err).Msg("gagal membuat token reset")
			} else {
				resetURL := strings.TrimRight(cfg.AppURL, "/") + "/reset-password?token=" + token
				if err := sendResetEmail(cfg, user.Email, user.Name, resetURL); err != nil {
					// JANGAN catat resetURL/token ke log: link berisi token
					// mentah sekali pakai — siapa pun yang membaca log bisa
					// mengambil alih akun. Catat hanya email + status gagal.
					log.Error().Err(err).Str("email", user.Email).Msg("gagal kirim email reset password (SMTP belum dikonfigurasi?)")
				}
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Jika email terdaftar, link reset password telah dikirim. Link berlaku 30 menit.",
		})
	}
}

// handleResetPassword menukar token yang valid dengan password baru.
func handleResetPassword(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Token    string `json:"token"`
			Password string `json:"password"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || req.Token == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Token tidak valid", "code": "TOKEN_REQUIRED"})
			return
		}
		if len(req.Password) < 6 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Password minimal 6 karakter", "code": "WEAK_PASSWORD"})
			return
		}

		var prt models.PasswordResetToken
		if err := db.Where("token_hash = ? AND used_at IS NULL AND expires_at > ?", hashResetToken(req.Token), time.Now()).First(&prt).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Link reset tidak valid atau sudah kedaluwarsa", "code": "TOKEN_INVALID"})
			return
		}

		hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memproses password", "code": "HASH_FAILED"})
			return
		}

		now := time.Now()
		err = db.Transaction(func(tx *gorm.DB) error {
			if err := tx.Model(&models.User{}).Where("id = ?", prt.UserID).Update("password", string(hashed)).Error; err != nil {
				return err
			}
			// Cabut SEMUA sesi user: reset password berarti kredensial lama
			// sudah tidak dipercaya (bocor/lupa) — token yang beredar dari
			// sesi lama tidak boleh tetap berlaku sampai kedaluwarsa.
			if err := revokeAllSessionsExcept(tx, prt.UserID, ""); err != nil {
				return err
			}
			// Tandai semua token user ini sudah terpakai
			return tx.Model(&models.PasswordResetToken{}).
				Where("user_id = ? AND used_at IS NULL", prt.UserID).
				Update("used_at", now).Error
		})
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal mereset password", "code": "DB_ERROR"})
			return
		}

		_ = cfg
		c.JSON(http.StatusOK, gin.H{"message": "Password berhasil direset. Silakan masuk dengan password baru."})
	}
}

// sendResetEmail mengirim email link reset via SMTP bila dikonfigurasi.
func sendResetEmail(cfg *config.Config, to, name, resetURL string) error {
	if cfg.SMTPHost == "" {
		return fmt.Errorf("SMTP belum dikonfigurasi")
	}
	from := cfg.SMTPFrom
	if from == "" {
		from = "WaGataway <noreply@wagataway.com>"
	}
	subject := "Reset Password WaGataway"
	body := fmt.Sprintf("Halo %s,\r\n\r\n"+
		"Kami menerima permintaan reset password untuk akun WaGataway Anda.\r\n"+
		"Klik link berikut untuk membuat password baru (berlaku 30 menit):\r\n\r\n"+
		"%s\r\n\r\n"+
		"Jika Anda tidak meminta ini, abaikan email ini.\r\n\r\n"+
		"Salam,\r\nTim WaGataway\r\n", name, resetURL)

	msg := []byte(fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\nMIME-Version: 1.0\r\nContent-Type: text/plain; charset=UTF-8\r\n\r\n%s", from, to, subject, body))

	addr := fmt.Sprintf("%s:%s", cfg.SMTPHost, cfg.SMTPPort)
	var auth smtp.Auth
	if cfg.SMTPUser != "" {
		auth = smtp.PlainAuth("", cfg.SMTPUser, cfg.SMTPPass, cfg.SMTPHost)
	}
	return smtp.SendMail(addr, auth, cfg.SMTPUser, []string{to}, msg)
}
