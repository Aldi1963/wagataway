package handler

import (
	"net/http"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerWebhookDeliveryLogRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	wd := rg.Group("/webhook-deliveries")
	{
		wd.GET("", listWebhookDeliveryLogs(db))
		wd.POST("/:id/retry", retryWebhookDeliveryLog(db))
	}
}

// GET /api/webhook-deliveries — filter ?device_id= & ?success=true|false
func listWebhookDeliveryLogs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		page, limit := getPageLimit(c)
		query := db.Where("user_id = ?", userID)
		if deviceID := c.Query("device_id"); deviceID != "" {
			query = query.Where("device_id = ?", deviceID)
		}
		if s := c.Query("success"); s == "true" || s == "false" {
			query = query.Where("success = ?", s == "true")
		}
		var total int64
		query.Model(&models.WebhookDeliveryLog{}).Count(&total)
		var items []models.WebhookDeliveryLog
		query.Order("created_at DESC").Offset((page - 1) * limit).Limit(limit).Find(&items)
		c.JSON(http.StatusOK, gin.H{
			"deliveries": items,
			"page":       page,
			"limit":      limit,
			"total":      total,
		})
	}
}

// retryWebhookDeliveryLog — kirim ulang payload, catat sebagai
// baris baru + increment RetryCount pada baris aslinya.
func retryWebhookDeliveryLog(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		var orig models.WebhookDeliveryLog
		if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&orig).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Log tidak ditemukan"})
			return
		}
		// Retry memakai webhook secret milik device agar header HMAC
		// X-Wagataway-Signature ikut terkirim seperti pengiriman aslinya.
		secret := ""
		if orig.DeviceID != 0 {
			var dev models.Device
			if err := db.Select("webhook_secret").Where("id = ?", orig.DeviceID).First(&dev).Error; err == nil {
				secret = dev.WebhookSecret
			}
		}
		statusCode, success, errMsg, _ := whatsapp.DeliverWebhookPayload(orig.URL, secret, orig.Event, []byte(orig.Payload))
		orig.RetryCount++
		db.Save(&orig)
		// Catat hasil retry sebagai baris baru untuk riwayat.
		entry := models.WebhookDeliveryLog{
			UserID:     userID,
			DeviceID:   orig.DeviceID,
			URL:        orig.URL,
			Event:      orig.Event,
			Payload:    orig.Payload,
			StatusCode: statusCode,
			Success:    success,
			ErrorMsg:   errMsg,
			RetryCount: orig.RetryCount,
		}
		db.Create(&entry)
		c.JSON(http.StatusOK, gin.H{
			"delivery": entry,
			"message":  "Retry berhasil dikirim",
		})
	}
}
