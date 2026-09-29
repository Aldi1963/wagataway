package handler

import (
	"net/http"
	"strconv"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerWebhookRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	wh := rg.Group("/webhooks")
	{
		wh.GET("", listWebhooks(db))
		wh.POST("", createWebhook(db))
		wh.PUT("/:id", updateWebhook(db))
		wh.DELETE("/:id", deleteWebhook(db))
		wh.GET("/:id/deliveries", listWebhookDeliveries(db))
		wh.POST("/:id/deliveries/:deliveryId/retry", retryWebhookDelivery(db))
	}
}

// getUserWebhook mengambil webhook milik user atau 404.
func getUserWebhook(c *gin.Context, db *gorm.DB) (models.Webhook, bool) {
	userID := middleware.GetUserID(c)
	id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
	var hook models.Webhook
	if err := db.Where("id = ? AND user_id = ?", id, userID).First(&hook).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Webhook tidak ditemukan"})
		return hook, false
	}
	return hook, true
}

// listWebhookDeliveries: 20 pengiriman terakhir sebuah webhook.
func listWebhookDeliveries(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		hook, ok := getUserWebhook(c, db)
		if !ok {
			return
		}
		var deliveries []models.WebhookDelivery
		db.Where("webhook_id = ?", hook.ID).Order("id DESC").Limit(20).Find(&deliveries)
		c.JSON(http.StatusOK, gin.H{"deliveries": deliveries})
	}
}

// retryWebhookDelivery: kirim ulang payload tersimpan dari satu delivery.
// Hasil percobaan dicatat sebagai baris delivery baru.
func retryWebhookDelivery(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		hook, ok := getUserWebhook(c, db)
		if !ok {
			return
		}
		did, _ := strconv.ParseUint(c.Param("deliveryId"), 10, 32)
		var delivery models.WebhookDelivery
		if err := db.Where("id = ? AND webhook_id = ?", did, hook.ID).First(&delivery).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Delivery tidak ditemukan"})
			return
		}
		statusCode, success, errMsg, durationMs := whatsapp.DeliverWebhookPayload(
			hook.URL, hook.Secret, delivery.Event, []byte(delivery.Payload),
		)
		retry := models.WebhookDelivery{
			WebhookID:  hook.ID,
			Event:      delivery.Event,
			StatusCode: statusCode,
			Success:    success,
			ErrorMsg:   errMsg,
			DurationMs: durationMs,
			Payload:    delivery.Payload,
		}
		db.Create(&retry)
		c.JSON(http.StatusOK, gin.H{"delivery": retry})
	}
}

func listWebhooks(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var hooks []models.Webhook
		db.Where("user_id = ?", userID).Find(&hooks)
		c.JSON(http.StatusOK, gin.H{"webhooks": hooks})
	}
}

func createWebhook(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			URL      string `json:"url" binding:"required"`
			Secret   string `json:"secret"`
			Events   string `json:"events"`
			DeviceID *uint  `json:"deviceId"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "URL wajib"})
			return
		}
		hook := models.Webhook{
			UserID: userID, URL: req.URL, Secret: req.Secret,
			Events: req.Events, DeviceID: req.DeviceID, IsActive: true,
		}
		db.Create(&hook)
		c.JSON(http.StatusCreated, gin.H{"webhook": hook})
	}
}

func updateWebhook(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var hook models.Webhook
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&hook).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Webhook tidak ditemukan"})
			return
		}
		var req map[string]interface{}
		c.ShouldBindJSON(&req)
		db.Model(&hook).Updates(snakeKeys(req))
		c.JSON(http.StatusOK, gin.H{"webhook": hook})
	}
}

func deleteWebhook(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.Webhook{})
		c.JSON(http.StatusOK, gin.H{"message": "Webhook dihapus"})
	}
}
