package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ── Kompatibilitas WAMP (ppob.clipku.com) ─────────────────────────────────────
// PPOB (WampService) POST ke {wamp_url}/send-message dan /send-media dengan
// field: api_key, sender, number, message (+ url, media_type, caption untuk
// media). Endpoint ini menerjemahkannya ke pengiriman via device milik
// pemilik API key. Tidak perlu ubah kode PPOB — cukup isi konfigurasi:
//   wamp_url        = https://wa.clipku.com
//   wamp_api_key    = API key dari Setting > API Key
//   wamp_sender     = ID / nomor / nama device pengirim
//   wamp_status_api = 1

func registerWampCompatRoutes(r *gin.Engine, db *gorm.DB, wm *whatsapp.Manager) {
	r.POST("/send-message", wampSend(db, wm, false))
	r.POST("/send-media", wampSend(db, wm, true))
}

func wampSend(db *gorm.DB, wm *whatsapp.Manager, isMedia bool) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			APIKey    string `form:"api_key" json:"api_key"`
			Sender    string `form:"sender" json:"sender"`
			Number    string `form:"number" json:"number"`
			Message   string `form:"message" json:"message"`
			URL       string `form:"url" json:"url"`
			MediaType string `form:"media_type" json:"media_type"`
			Caption   string `form:"caption" json:"caption"`
			ReplyTo   string `form:"reply_to" json:"reply_to"`
		}
		// Dukung form-encoded (default WampService) maupun JSON.
		_ = c.ShouldBind(&req)
		if req.APIKey == "" {
			req.APIKey = c.GetHeader("X-API-Key")
		}

		if req.APIKey == "" || req.Number == "" {
			c.JSON(http.StatusBadRequest, gin.H{"status": false, "message": "api_key dan number wajib diisi"})
			return
		}

		content := req.Message
		mediaURL := ""
		msgType := "text"
		if isMedia {
			if req.URL == "" {
				c.JSON(http.StatusBadRequest, gin.H{"status": false, "message": "url media wajib diisi"})
				return
			}
			mediaURL = req.URL
			msgType = "image"
			content = req.Caption
			if content == "" {
				content = req.Message
			}
		}
		if content == "" {
			c.JSON(http.StatusBadRequest, gin.H{"status": false, "message": "message/caption wajib diisi"})
			return
		}
		if utf8.RuneCountInString(content) > 10000 {
			c.JSON(http.StatusBadRequest, gin.H{"status": false, "message": "Pesan maksimal 10000 karakter"})
			return
		}

		// Validasi API key -> user.
		var ak models.ApiKey
		if err := db.Where("key_hash = ? AND is_active = ?", models.HashAPIKey(req.APIKey), true).First(&ak).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"status": false, "message": "API key tidak valid"})
			return
		}
		if ak.ExpiresAt != nil && time.Now().After(*ak.ExpiresAt) {
			c.JSON(http.StatusUnauthorized, gin.H{"status": false, "message": "API key kedaluwarsa"})
			return
		}
		now := time.Now()
		db.Model(&ak).Update("last_used", now)

		// Resolve sender -> device milik user.
		device, err := resolveWampSender(db, ak.UserID, req.Sender)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"status": false, "message": err.Error()})
			return
		}

		msg := models.Message{
			UserID:   ak.UserID,
			DeviceID: device.ID,
			To:       req.Number,
			Type:     msgType,
			Content:  content,
			MediaURL: mediaURL,
			Caption:  req.Caption,
			Status:   "pending",
		}
		if err := db.Create(&msg).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"status": false, "message": "Gagal menyimpan pesan"})
			return
		}

		campaignID := "wamp-" + time.Now().Format("20060102150405")
		go func() {
			waID, err := wm.SendMessageWithOptions(device.ID, req.Number, whatsapp.SendOptions{
				Type:     msgType,
				Content:  content,
				MediaURL: mediaURL,
				ReplyTo:  req.ReplyTo,
			})
			if err != nil {
				db.Model(&msg).Updates(map[string]interface{}{"status": "failed", "error_msg": err.Error()})
				recordReport(db, ak.UserID, device.ID, campaignID, req.Number, "", "failed", err.Error())
			} else {
				now := time.Now()
				db.Model(&msg).Updates(map[string]interface{}{"status": "sent", "message_id": waID, "sent_at": &now})
				recordReport(db, ak.UserID, device.ID, campaignID, req.Number, waID, "sent", "")
			}
		}()

		c.JSON(http.StatusOK, gin.H{"status": true, "message": "Pesan sedang dikirim", "id": msg.ID})
	}
}

// resolveWampSender mencari device milik user berdasarkan sender yang dikirim
// PPOB: bisa berupa ID device (angka), nomor HP, atau nama device. Bila kosong,
// pakai device default / yang pertama.
func resolveWampSender(db *gorm.DB, userID uint, sender string) (*models.Device, error) {
	var device models.Device
	s := strings.TrimSpace(sender)

	if s == "" {
		if err := db.Where("user_id = ? AND is_default = ?", userID, true).First(&device).Error; err != nil {
			if err := db.Where("user_id = ?", userID).Order("id").First(&device).Error; err != nil {
				return nil, fmt.Errorf("perangkat pengirim tidak ditemukan")
			}
		}
		return &device, nil
	}

	if id, err := strconv.ParseUint(s, 10, 64); err == nil {
		if err := db.Where("id = ? AND user_id = ?", uint(id), userID).First(&device).Error; err == nil {
			return &device, nil
		}
	}

	digits := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, s)
	if digits != "" {
		q := db.Where("user_id = ?", userID).Where("phone = ? OR phone = ?", digits, strings.TrimPrefix(digits, "62")).First(&device)
		if q.Error == nil {
			return &device, nil
		}
		// Coba juga dengan prefix 62 bila yang dikirim tanpa kode negara.
		if !strings.HasPrefix(digits, "62") {
			if err := db.Where("user_id = ? AND phone = ?", userID, "62"+digits).First(&device).Error; err == nil {
				return &device, nil
			}
		}
	}

	if err := db.Where("user_id = ? AND name = ?", userID, s).First(&device).Error; err == nil {
		return &device, nil
	}

	return nil, fmt.Errorf("perangkat pengirim tidak ditemukan")
}
