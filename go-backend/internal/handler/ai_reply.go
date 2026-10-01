package handler

// CRUD konfigurasi AI auto-reply per device + status konektivitas backend AI.

import (
	"net/http"
	"strconv"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerAIReplyRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	ar := rg.Group("/ai-reply")
	{
		ar.GET("", listAIReplyConfigs(db))
		ar.POST("", createAIReplyConfig(db))
		ar.PUT("/:id", updateAIReplyConfig(db))
		ar.DELETE("/:id", deleteAIReplyConfig(db))
		ar.PATCH("/:id/toggle", toggleAIReplyConfig(db))
		ar.GET("/status", aiReplyStatus(db))
	}
}

// verifyDeviceOwner memastikan device milik user yang sedang login.
func verifyDeviceOwner(db *gorm.DB, deviceID uint, userID uint) bool {
	var count int64
	db.Model(&models.Device{}).Where("id = ? AND user_id = ?", deviceID, userID).Count(&count)
	return count > 0
}

func listAIReplyConfigs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		var cfgs []models.AIReplyConfig
		query := db.Where("user_id = ?", userID).Order("created_at DESC")
		if deviceID := c.Query("deviceId"); deviceID != "" {
			query = query.Where("device_id = ?", deviceID)
		}
		query.Find(&cfgs)
		c.JSON(http.StatusOK, gin.H{"configs": cfgs})
	}
}

func createAIReplyConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		var req struct {
			DeviceID        uint   `json:"deviceId" binding:"required"`
			SystemPrompt    string `json:"systemPrompt"`
			TriggerKeywords string `json:"triggerKeywords"`
			IgnoreGroups    *bool  `json:"ignoreGroups"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if !verifyDeviceOwner(db, req.DeviceID, userID) {
			c.JSON(http.StatusForbidden, gin.H{"message": "Device tidak ditemukan"})
			return
		}

		ignoreGroups := true
		if req.IgnoreGroups != nil {
			ignoreGroups = *req.IgnoreGroups
		}
		cfg := models.AIReplyConfig{
			UserID:          userID,
			DeviceID:        req.DeviceID,
			SystemPrompt:    req.SystemPrompt,
			TriggerKeywords: req.TriggerKeywords,
			IgnoreGroups:    ignoreGroups,
			IsEnabled:       true,
		}
		if err := db.Create(&cfg).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"config": cfg})
	}
}

func updateAIReplyConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

		var cfg models.AIReplyConfig
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&cfg).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Config tidak ditemukan"})
			return
		}

		var req map[string]interface{}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		// Jangan izinkan pindah device ke milik orang lain / pindah user.
		delete(req, "userId")
		delete(req, "user_id")
		if devID, ok := req["deviceId"]; ok {
			var devUint uint
			switch v := devID.(type) {
			case float64:
				devUint = uint(v)
			}
			if devUint != 0 && !verifyDeviceOwner(db, devUint, userID) {
				c.JSON(http.StatusForbidden, gin.H{"message": "Device tidak ditemukan"})
				return
			}
		}
		db.Model(&cfg).Updates(snakeKeys(req))
		c.JSON(http.StatusOK, gin.H{"config": cfg, "message": "Diperbarui"})
	}
}

func deleteAIReplyConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		result := db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.AIReplyConfig{})
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Config tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Config dihapus"})
	}
}

func toggleAIReplyConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

		var cfg models.AIReplyConfig
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&cfg).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Config tidak ditemukan"})
			return
		}
		newVal := !cfg.IsEnabled
		db.Model(&cfg).Update("is_enabled", newVal)
		c.JSON(http.StatusOK, gin.H{"isEnabled": newVal})
	}
}

// aiReplyStatus memeriksa apakah backend AI dapat dihubungi.
func aiReplyStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		ok, detail := whatsapp.AICheckHealth(db)
		c.JSON(http.StatusOK, gin.H{
			"reachable": ok,
			"detail":    detail,
		})
	}
}
