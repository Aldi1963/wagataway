package handler

import (
	"net/http"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerMessageRoutes(rg *gin.RouterGroup, db *gorm.DB, wm *whatsapp.Manager) {
	msgs := rg.Group("/messages")
	{
		msgs.GET("", listMessages(db))
		msgs.POST("/send", sendMessage(db, wm))
		msgs.POST("/bulk", sendBulkMessage(db, wm))
	}
}

func listMessages(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		page := 1
		limit := 50

		var messages []models.Message
		var total int64

		db.Model(&models.Message{}).Where("user_id = ?", userID).Count(&total)
		db.Where("user_id = ?", userID).
			Order("created_at DESC").
			Offset((page - 1) * limit).
			Limit(limit).
			Find(&messages)

		c.JSON(http.StatusOK, gin.H{
			"messages": messages,
			"total":    total,
			"page":     page,
			"limit":    limit,
		})
	}
}

func sendMessage(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		var req struct {
			DeviceID uint   `json:"deviceId" binding:"required"`
			To       string `json:"to" binding:"required"`
			Type     string `json:"type"`
			Content  string `json:"content" binding:"required"`
			MediaURL string `json:"mediaUrl"`
			Caption  string `json:"caption"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}

		if req.Type == "" {
			req.Type = "text"
		}

		// Create message record
		msg := models.Message{
			UserID:   userID,
			DeviceID: req.DeviceID,
			To:       req.To,
			Type:     req.Type,
			Content:  req.Content,
			MediaURL: req.MediaURL,
			Caption:  req.Caption,
			Status:   "pending",
		}

		if err := db.Create(&msg).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan pesan", "code": "DB_ERROR"})
			return
		}

		// Send via WhatsApp
		go func() {
			err := wm.SendMessage(req.DeviceID, req.To, req.Type, req.Content, req.MediaURL)
			if err != nil {
				db.Model(&msg).Updates(map[string]interface{}{"status": "failed", "error_msg": err.Error()})
			} else {
				db.Model(&msg).Update("status", "sent")
			}
		}()

		c.JSON(http.StatusOK, gin.H{"message": "Pesan sedang dikirim", "data": msg})
	}
}

func sendBulkMessage(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		var req struct {
			DeviceID   uint     `json:"deviceId" binding:"required"`
			Recipients []string `json:"recipients" binding:"required"`
			Type       string   `json:"type"`
			Content    string   `json:"content" binding:"required"`
			MediaURL   string   `json:"mediaUrl"`
			MinDelay   int      `json:"minDelay"`
			MaxDelay   int      `json:"maxDelay"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}

		if req.Type == "" {
			req.Type = "text"
		}
		if req.MinDelay == 0 {
			req.MinDelay = 3
		}
		if req.MaxDelay == 0 {
			req.MaxDelay = 8
		}

		// Create bulk job
		job := models.BulkJob{
			UserID:     userID,
			DeviceID:   req.DeviceID,
			Type:       req.Type,
			Content:    req.Content,
			MediaURL:   req.MediaURL,
			Status:     "pending",
			TotalCount: len(req.Recipients),
			MinDelay:   req.MinDelay,
			MaxDelay:   req.MaxDelay,
		}

		if err := db.Create(&job).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat bulk job", "code": "DB_ERROR"})
			return
		}

		// Create recipients
		for _, phone := range req.Recipients {
			recipient := models.BulkJobRecipient{
				BulkJobID: job.ID,
				Phone:     phone,
				Status:    "pending",
			}
			db.Create(&recipient)
		}

		// Process in background
		go wm.ProcessBulkJob(job.ID, db)

		c.JSON(http.StatusOK, gin.H{
			"message": "Bulk message dijadwalkan",
			"job":     job,
		})
	}
}
