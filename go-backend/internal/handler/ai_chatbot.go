package handler

// CRUD knowledge base FAQ/katalog chatbot AI + log percakapan chatbot.
//
// Plan gating: tulis FAQ (POST/PUT/PATCH toggle) hanya untuk paket
// Pro/Master (service.ChatbotAllowed); baca (GET) terbuka agar panel bisa
// menampilkan daftar + banner upgrade. Log hanya ditulis server (pipeline
// whatsapp.checkAIReply), di sini read-only.

import (
	"net/http"
	"strconv"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerAIChatbotRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	cb := rg.Group("/ai-chatbot")
	{
		cb.GET("/status", aiChatbotStatus(db))
		cb.GET("/faqs", listAIChatbotFAQs(db))
		cb.POST("/faqs", createAIChatbotFAQ(db))
		cb.PUT("/faqs/:id", updateAIChatbotFAQ(db))
		cb.DELETE("/faqs/:id", deleteAIChatbotFAQ(db))
		cb.PATCH("/faqs/:id/toggle", toggleAIChatbotFAQ(db))
		cb.GET("/logs", listAIChatbotLogs(db))
	}
}

// chatbotWriteAllowed menolak tulis FAQ bila paket user bukan Pro/Master.
func chatbotWriteAllowed(db *gorm.DB, c *gin.Context) bool {
	allowed, planName := service.ChatbotAllowed(db, middleware.GetUserID(c))
	if allowed {
		return true
	}
	if planName == "" {
		planName = "Free"
	}
	c.JSON(http.StatusForbidden, gin.H{
		"message":  "Chatbot AI (FAQ/katalog) tersedia di paket Pro/Master. Paket Anda saat ini: " + planName + ".",
		"planName": planName,
	})
	return false
}

func aiChatbotStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		allowed, planName := service.ChatbotAllowed(udb, userID)
		var faqCount int64
		udb.Model(&models.AIChatbotFAQ{}).Where("user_id = ?", userID).Count(&faqCount)
		c.JSON(http.StatusOK, gin.H{
			"chatbotAllowed": allowed,
			"planName":       planName,
			"faqCount":       faqCount,
		})
	}
}

func listAIChatbotFAQs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var faqs []models.AIChatbotFAQ
		query := udb.Where("user_id = ?", userID).Order("priority DESC, id ASC")
		if deviceID := c.Query("deviceId"); deviceID != "" {
			query = query.Where("device_id IS NULL OR device_id = ?", deviceID)
		}
		query.Find(&faqs)
		c.JSON(http.StatusOK, gin.H{"faqs": faqs})
	}
}

func createAIChatbotFAQ(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		if !chatbotWriteAllowed(udb, c) {
			return
		}
		var req struct {
			DeviceID *uint  `json:"deviceId"`
			Question string `json:"question" binding:"required"`
			Answer   string `json:"answer" binding:"required"`
			Keywords string `json:"keywords"`
			Priority int    `json:"priority"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if req.DeviceID != nil && !verifyDeviceOwner(udb, *req.DeviceID, userID) {
			c.JSON(http.StatusForbidden, gin.H{"message": "Device tidak ditemukan"})
			return
		}
		faq := models.AIChatbotFAQ{
			UserID:   userID,
			DeviceID: req.DeviceID,
			Question: req.Question,
			Answer:   req.Answer,
			Keywords: req.Keywords,
			Priority: req.Priority,
			IsActive: true,
		}
		if err := udb.Create(&faq).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"faq": faq})
	}
}

func updateAIChatbotFAQ(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		if !chatbotWriteAllowed(udb, c) {
			return
		}
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var faq models.AIChatbotFAQ
		if err := udb.Where("id = ? AND user_id = ?", id, userID).First(&faq).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "FAQ tidak ditemukan"})
			return
		}
		var req map[string]interface{}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		delete(req, "userId")
		delete(req, "user_id")
		if devID, ok := req["deviceId"]; ok {
			var devUint uint
			switch v := devID.(type) {
			case float64:
				devUint = uint(v)
			}
			if devUint != 0 && !verifyDeviceOwner(udb, devUint, userID) {
				c.JSON(http.StatusForbidden, gin.H{"message": "Device tidak ditemukan"})
				return
			}
		}
		udb.Model(&faq).Updates(snakeKeys(req))
		c.JSON(http.StatusOK, gin.H{"faq": faq, "message": "Diperbarui"})
	}
}

func deleteAIChatbotFAQ(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		if !chatbotWriteAllowed(udb, c) {
			return
		}
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		result := udb.Where("id = ? AND user_id = ?", id, userID).Delete(&models.AIChatbotFAQ{})
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "FAQ tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "FAQ dihapus"})
	}
}

func toggleAIChatbotFAQ(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		if !chatbotWriteAllowed(udb, c) {
			return
		}
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var faq models.AIChatbotFAQ
		if err := udb.Where("id = ? AND user_id = ?", id, userID).First(&faq).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "FAQ tidak ditemukan"})
			return
		}
		newVal := !faq.IsActive
		udb.Model(&faq).Update("is_active", newVal)
		c.JSON(http.StatusOK, gin.H{"isActive": newVal})
	}
}

func listAIChatbotLogs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		limit := 50
		if v, err := strconv.Atoi(c.Query("limit")); err == nil && v > 0 && v <= 200 {
			limit = v
		}
		var logs []models.AIChatbotLog
		query := udb.Where("user_id = ?", userID).Order("created_at DESC, id DESC").Limit(limit)
		if deviceID := c.Query("deviceId"); deviceID != "" {
			query = query.Where("device_id = ?", deviceID)
		}
		if source := c.Query("source"); source != "" {
			query = query.Where("source = ?", source)
		}
		query.Find(&logs)
		c.JSON(http.StatusOK, gin.H{"logs": logs})
	}
}
