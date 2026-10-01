package handler

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"fmt"
	"math/big"
	"net/http"
	"strings"
	"time"
	"unicode"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// ── Fitur 3: API OTP via WhatsApp ────────────────────────────────────────────
// POST   /api/otp/send    → generate kode, simpan HASH-nya, kirim via WA
// POST   /api/otp/verify  → verifikasi kode (sekali pakai, max 5x salah)
// GET    /api/otp/history → riwayat OTP user (TANPA menampilkan kode)

const (
	otpMaxSendPerWindow = 5
	otpSendWindow       = 10 * time.Minute
	otpMaxAttempts      = 5
	otpDefaultTemplate  = "Kode OTP Anda: {code}"
)

func registerOtpRoutes(rg *gin.RouterGroup, db *gorm.DB, wm *whatsapp.Manager) {
	otp := rg.Group("/otp")
	{
		otp.POST("/send", handleOtpSend(db, wm))
		otp.POST("/verify", handleOtpVerify(db))
		otp.GET("/history", handleOtpHistory(db))
	}
}

// ── Helper murni (di-unit-test) ─────────────────────────────────────────────

// normalizeOTPPhone membersihkan nomor ke format internasional 62xxxxxxxxxx.
// Mengembalikan "" bila tidak valid.
func normalizeOTPPhone(phone string) string {
	var b strings.Builder
	for _, r := range phone {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	d := b.String()
	d = strings.TrimPrefix(d, "+")
	if strings.HasPrefix(d, "0") {
		d = "62" + d[1:]
	}
	if !strings.HasPrefix(d, "62") {
		return ""
	}
	if len(d) < 10 || len(d) > 15 {
		return ""
	}
	return d
}

// otpCodeHash mengembalikan SHA256 hex dari kode. Plaintext kode tidak
// pernah disimpan di DB.
func otpCodeHash(code string) string {
	sum := sha256.Sum256([]byte(code))
	return hex.EncodeToString(sum[:])
}

// generateOtpCode membuat kode numerik acak sepanjang n digit (crypto/rand).
// Digit pertama tidak nol agar panjang selalu tepat.
func generateOtpCode(n int) (string, error) {
	if n <= 0 {
		return "", fmt.Errorf("panjang kode harus > 0")
	}
	var sb strings.Builder
	for i := 0; i < n; i++ {
		max := big.NewInt(10)
		if i == 0 {
			max = big.NewInt(9) // 1..9
		}
		r, err := rand.Int(rand.Reader, max)
		if err != nil {
			return "", err
		}
		d := r.Int64()
		if i == 0 {
			d++ // 1..9
		}
		sb.WriteByte(byte('0' + d))
	}
	return sb.String(), nil
}

// otpHashesMatch membandingkan hash dengan constant-time compare
// (anti timing attack).
func otpHashesMatch(candidateHash, storedHash string) bool {
	if len(candidateHash) != len(storedHash) || len(storedHash) == 0 {
		return false
	}
	return subtle.ConstantTimeCompare([]byte(candidateHash), []byte(storedHash)) == 1
}

// renderOtpTemplate mengganti placeholder {code} dengan kode.
// Bila template tidak mengandung placeholder, kode ditempel di akhir.
func renderOtpTemplate(template, code string) string {
	if !strings.Contains(template, "{code}") {
		template = strings.TrimSpace(template) + " {code}"
	}
	return strings.ReplaceAll(template, "{code}", code)
}

// ── POST /api/otp/send ───────────────────────────────────────────────────────

func handleOtpSend(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		var req struct {
			Phone    string `json:"phone" binding:"required"`
			DeviceID *uint  `json:"deviceId"`
			Length   int    `json:"length"`
			TTLMenit int    `json:"ttlMenit"`
			Template string `json:"template"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}

		phone := normalizeOTPPhone(req.Phone)
		if phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Nomor telepon tidak valid (gunakan format 62812xxxxxxx)", "code": "VALIDATION_ERROR"})
			return
		}

		length := req.Length
		if length == 0 {
			length = 6
		}
		if length < 4 || length > 8 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Panjang kode harus 4–8 digit", "code": "VALIDATION_ERROR"})
			return
		}

		ttl := req.TTLMenit
		if ttl == 0 {
			ttl = 5
		}
		if ttl < 1 || ttl > 30 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "TTL harus 1–30 menit", "code": "VALIDATION_ERROR"})
			return
		}

		template := strings.TrimSpace(req.Template)
		if template == "" {
			template = otpDefaultTemplate
		}
		if len(template) > 500 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Template maksimal 500 karakter", "code": "VALIDATION_ERROR"})
			return
		}

		// Rate limit: maksimal 5x kirim per nomor per 10 menit.
		var recentCount int64
		windowStart := time.Now().Add(-otpSendWindow)
		if err := db.Model(&models.WaOtpCode{}).
			Where("user_id = ? AND phone = ? AND created_at > ?", userID, phone, windowStart).
			Count(&recentCount).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Gagal memeriksa batas kirim", "code": "DB_ERROR"})
			return
		}
		if recentCount >= otpMaxSendPerWindow {
			c.JSON(http.StatusTooManyRequests, gin.H{
				"success": false,
				"message": fmt.Sprintf("Batas pengiriman OTP tercapai (%dx per 10 menit untuk nomor ini). Coba lagi nanti.", otpMaxSendPerWindow),
				"code":    "RATE_LIMITED",
			})
			return
		}

		// Tentukan device: deviceId dari request (harus milik user & connected)
		// atau device connected pertama milik user (prioritas is_default).
		var device models.Device
		if req.DeviceID != nil {
			if err := db.Where("id = ? AND user_id = ?", *req.DeviceID, userID).First(&device).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
				return
			}
		} else {
			if err := db.Where("user_id = ? AND status = ?", userID, "connected").
				Order("is_default DESC, id ASC").First(&device).Error; err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Tidak ada perangkat yang terhubung. Hubungkan perangkat dulu.", "code": "NO_DEVICE"})
				return
			}
		}
		if device.Status != "connected" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Perangkat tidak terhubung", "code": "DEVICE_OFFLINE"})
			return
		}

		code, err := generateOtpCode(length)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Gagal membuat kode OTP", "code": "INTERNAL_ERROR"})
			return
		}

		// Hanguskan kode aktif sebelumnya untuk (user, phone) yang sama.
		db.Model(&models.WaOtpCode{}).
			Where("user_id = ? AND phone = ? AND status = ?", userID, phone, "active").
			Update("status", "invalidated")

		expiresAt := time.Now().Add(time.Duration(ttl) * time.Minute)
		rec := models.WaOtpCode{
			UserID:    userID,
			Phone:     phone,
			CodeHash:  otpCodeHash(code),
			Length:    length,
			ExpiresAt: expiresAt,
			Status:    "active",
		}
		if err := db.Create(&rec).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Gagal menyimpan OTP", "code": "DB_ERROR"})
			return
		}

		// Kirim via WA. Sengaja sinkron: kegagalan kirim dilaporkan ke caller
		// dan baris DB dibatalkan agar tidak ada kode aktif yang tak terkirim.
		// PENTING: kode plaintext tidak pernah di-log.
		text := renderOtpTemplate(template, code)
		if _, err := wm.SendMessageWithOptions(device.ID, phone, whatsapp.SendOptions{Type: "text", Content: text}); err != nil {
			db.Model(&rec).Update("status", "invalidated")
			log.Warn().Uint("userID", userID).Uint("deviceID", device.ID).Str("phone", phone).Err(err).Msg("OTP: kirim WA gagal")
			c.JSON(http.StatusBadGateway, gin.H{"success": false, "message": "Gagal mengirim OTP via WhatsApp: " + err.Error(), "code": "WA_SEND_FAILED"})
			return
		}

		log.Info().Uint("userID", userID).Uint("deviceID", device.ID).Str("phone", phone).Int("ttlMenit", ttl).Msg("OTP terkirim via WA")

		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"message":   "Kode OTP terkirim via WhatsApp",
			"phone":     phone,
			"deviceId":  device.ID,
			"expiresIn": ttl * 60, // detik
		})
	}
}

// ── POST /api/otp/verify ─────────────────────────────────────────────────────

func handleOtpVerify(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		var req struct {
			Phone string `json:"phone" binding:"required"`
			Code  string `json:"code" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "phone dan code wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}

		phone := normalizeOTPPhone(req.Phone)
		if phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Nomor telepon tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		code := strings.TrimSpace(req.Code)
		if code == "" {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Kode wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}

		var rec models.WaOtpCode
		if err := db.Where("user_id = ? AND phone = ? AND status = ?", userID, phone, "active").
			Order("created_at DESC").First(&rec).Error; err != nil {
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "Tidak ada kode OTP aktif untuk nomor ini. Minta kode baru."})
			return
		}

		if time.Now().After(rec.ExpiresAt) {
			db.Model(&rec).Update("status", "invalidated")
			log.Info().Uint("userID", userID).Str("phone", phone).Msg("OTP: verifikasi kode kedaluwarsa")
			c.JSON(http.StatusOK, gin.H{"success": false, "message": "Kode OTP kedaluwarsa. Minta kode baru."})
			return
		}

		if !otpHashesMatch(otpCodeHash(code), rec.CodeHash) {
			attempts := rec.Attempts + 1
			updates := map[string]interface{}{"attempts": attempts}
			msg := "Kode OTP salah."
			if attempts >= otpMaxAttempts {
				updates["status"] = "invalidated"
				msg = fmt.Sprintf("Kode OTP salah %dx. Kode hangus — minta kode baru.", otpMaxAttempts)
				log.Warn().Uint("userID", userID).Str("phone", phone).Msg("OTP: kode hangus setelah 5x salah")
			}
			db.Model(&rec).Updates(updates)
			c.JSON(http.StatusOK, gin.H{"success": false, "message": msg, "attemptsLeft": otpMaxAttempts - attempts})
			return
		}

		db.Model(&rec).Update("status", "used")
		log.Info().Uint("userID", userID).Str("phone", phone).Msg("OTP terverifikasi")
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Kode OTP terverifikasi"})
	}
}

// ── GET /api/otp/history ─────────────────────────────────────────────────────
// Riwayat OTP milik user. Kode TIDAK PERNAH disertakan di response.

func handleOtpHistory(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		var rows []models.WaOtpCode
		if err := db.Where("user_id = ?", userID).
			Order("created_at DESC").Limit(50).Find(&rows).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Gagal memuat riwayat", "code": "DB_ERROR"})
			return
		}

		items := make([]gin.H, 0, len(rows))
		for _, r := range rows {
			status := r.Status
			if status == "active" && time.Now().After(r.ExpiresAt) {
				status = "expired"
			}
			items = append(items, gin.H{
				"id":        r.ID,
				"phone":     r.Phone,
				"status":    status,
				"attempts":  r.Attempts,
				"length":    r.Length,
				"expiresAt": r.ExpiresAt,
				"createdAt": r.CreatedAt,
			})
		}
		c.JSON(http.StatusOK, gin.H{"success": true, "data": items})
	}
}
