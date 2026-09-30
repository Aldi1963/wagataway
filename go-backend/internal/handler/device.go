package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/security"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerDeviceRoutes(rg *gin.RouterGroup, db *gorm.DB, wm *whatsapp.Manager) {
	devices := rg.Group("/devices")
	{
		devices.GET("", listDevices(db))
		devices.POST("", createDevice(db))
		devices.GET("/:id", getDevice(db))
		devices.PUT("/:id", updateDevice(db, wm))
		devices.DELETE("/:id", deleteDevice(db, wm))
		devices.POST("/:id/connect", connectDevice(db, wm))
		devices.POST("/:id/disconnect", disconnectDevice(db, wm))
		devices.GET("/:id/qr", getDeviceQR(db, wm))
		devices.POST("/:id/pair-code", requestPairCode(db, wm))
		devices.GET("/:id/status", getDeviceStatus(db, wm))
	}
}

func listDevices(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		var devices []models.Device
		if err := db.Where("user_id = ?", userID).Order("created_at DESC").Find(&devices).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memuat perangkat", "code": "DB_ERROR"})
			return
		}

		// sentCount per device — satu query GROUP BY (hindari N+1)
		type sentAgg struct {
			DeviceID uint
			Count    int64
		}
		var aggs []sentAgg
		if err := db.Model(&models.Message{}).
			Select("device_id, COUNT(*) AS count").
			Where("user_id = ?", userID).
			Group("device_id").
			Scan(&aggs).Error; err == nil {
			m := make(map[uint]int64, len(aggs))
			for _, a := range aggs {
				m[a.DeviceID] = a.Count
			}
			for i := range devices {
				devices[i].SentCount = m[devices[i].ID]
			}
		}

		c.JSON(http.StatusOK, gin.H{"devices": devices})
	}
}

func createDevice(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		var req struct {
			Name       string `json:"name" binding:"required"`
			WebhookURL string `json:"webhookUrl"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Nama perangkat wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}

		// Webhook URL boleh kosong; bila diisi harus aman dari SSRF
		if strings.TrimSpace(req.WebhookURL) != "" {
			if err := security.ValidateOutboundURL(req.WebhookURL); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Webhook URL tidak valid: " + err.Error(), "code": "VALIDATION_ERROR"})
				return
			}
		}

		device := models.Device{
			UserID:     userID,
			Name:       req.Name,
			WebhookURL: req.WebhookURL,
			Status:     "disconnected",
		}

		if err := db.Create(&device).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat perangkat", "code": "CREATE_ERROR"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"device": device})
	}
}

func getDevice(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

		var device models.Device
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&device).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"device": device})
	}
}

func updateDevice(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

		var device models.Device
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&device).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		var req struct {
			Name            *string `json:"name"`
			AutoOnline      *bool   `json:"autoOnline"`
			WebhookURL      *string `json:"webhookUrl"`
			ReadReceipts    *bool   `json:"readReceipts"`
			RejectCall      *bool   `json:"rejectCall"`
			TypingIndicator *bool   `json:"typingIndicator"`
			MaxRetries      *int    `json:"maxRetries"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}

		updates := map[string]interface{}{}
		if req.Name != nil {
			updates["name"] = *req.Name
		}
		if req.AutoOnline != nil {
			updates["auto_online"] = *req.AutoOnline
		}
		if req.WebhookURL != nil {
			if strings.TrimSpace(*req.WebhookURL) != "" {
				if err := security.ValidateOutboundURL(*req.WebhookURL); err != nil {
					c.JSON(http.StatusBadRequest, gin.H{"message": "Webhook URL tidak valid: " + err.Error(), "code": "VALIDATION_ERROR"})
					return
				}
			}
			updates["webhook_url"] = *req.WebhookURL
		}
		if req.ReadReceipts != nil {
			updates["read_receipts"] = *req.ReadReceipts
		}
		if req.RejectCall != nil {
			updates["reject_call"] = *req.RejectCall
		}
		if req.TypingIndicator != nil {
			updates["typing_indicator"] = *req.TypingIndicator
		}
		if req.MaxRetries != nil {
			updates["max_retries"] = *req.MaxRetries
		}

		db.Model(&device).Updates(updates)

		// Terapkan perubahan flag ke sesi WhatsApp aktif tanpa restart
		if req.AutoOnline != nil || req.ReadReceipts != nil || req.RejectCall != nil || req.TypingIndicator != nil {
			wm.RefreshDeviceFlags(uint(id))
		}

		c.JSON(http.StatusOK, gin.H{"device": device, "message": "Perangkat berhasil diperbarui"})
	}
}

func deleteDevice(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

		var device models.Device
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&device).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		// Disconnect WA session if active
		wm.Disconnect(uint(id))

		// Soft delete
		db.Delete(&device)

		c.JSON(http.StatusOK, gin.H{"message": "Perangkat berhasil dihapus"})
	}
}

func connectDevice(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

		var device models.Device
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&device).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		if err := wm.Connect(uint(id), userID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menghubungkan perangkat", "code": "CONNECT_ERROR"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Menghubungkan perangkat...", "status": "connecting"})
	}
}

func disconnectDevice(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

		var device models.Device
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&device).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		wm.Disconnect(uint(id))

		db.Model(&device).Update("status", "disconnected")

		c.JSON(http.StatusOK, gin.H{"message": "Perangkat berhasil diputuskan", "status": "disconnected"})
	}
}

func getDeviceQR(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

		var device models.Device
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&device).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		qr, expiresAt := wm.GetQR(uint(id))
		if qr == "" {
			c.JSON(http.StatusNotFound, gin.H{"message": "QR code tidak tersedia", "code": "NO_QR"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"qr":        qr,
			"expiresAt": expiresAt,
		})
	}
}

func getDeviceStatus(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

		var device models.Device
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&device).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		status := wm.GetStatus(uint(id))
		c.JSON(http.StatusOK, gin.H{"status": status})
	}
}
