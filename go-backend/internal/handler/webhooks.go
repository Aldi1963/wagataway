package handler

import (
	"net/http"
	"strconv"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
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
		db.Model(&hook).Updates(req)
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
