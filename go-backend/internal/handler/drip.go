package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerDripRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	d := rg.Group("/drip")
	{
		d.GET("", listDripCampaigns(db))
		d.POST("", createDripCampaign(db))
		d.GET("/:id", getDripCampaign(db))
		d.PUT("/:id", updateDripCampaign(db))
		d.DELETE("/:id", deleteDripCampaign(db))
		d.POST("/:id/steps", addDripStep(db))
		d.PUT("/:id/steps/:stepId", updateDripStep(db))
		d.DELETE("/:id/steps/:stepId", deleteDripStep(db))
		d.POST("/:id/enroll", enrollDrip(db))
	}
}

func listDripCampaigns(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var campaigns []models.DripCampaign
		db.Where("user_id = ?", userID).Preload("Steps").
			Order("created_at DESC").Find(&campaigns)
		c.JSON(http.StatusOK, gin.H{"campaigns": campaigns})
	}
}

func createDripCampaign(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			Name        string `json:"name" binding:"required"`
			Description string `json:"description"`
			DeviceID    uint   `json:"deviceId" binding:"required"`
			TriggerType string `json:"triggerType"`
			TriggerVal  string `json:"triggerVal"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if req.TriggerType == "" {
			req.TriggerType = "manual"
		}
		campaign := models.DripCampaign{
			UserID: userID, DeviceID: req.DeviceID, Name: req.Name,
			Description: req.Description, TriggerType: req.TriggerType,
			TriggerVal: req.TriggerVal, IsActive: true,
		}
		db.Create(&campaign)
		c.JSON(http.StatusCreated, gin.H{"campaign": campaign})
	}
}


func getDripCampaign(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var campaign models.DripCampaign
		if err := db.Where("id = ? AND user_id = ?", id, userID).
			Preload("Steps", func(d *gorm.DB) *gorm.DB { return d.Order("step_order ASC") }).
			First(&campaign).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Campaign tidak ditemukan"})
			return
		}
		// Count enrollments
		var enrolled int64
		db.Model(&models.DripEnrollment{}).Where("campaign_id = ?", id).Count(&enrolled)
		c.JSON(http.StatusOK, gin.H{"campaign": campaign, "enrolled": enrolled})
	}
}

func updateDripCampaign(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var campaign models.DripCampaign
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&campaign).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Campaign tidak ditemukan"})
			return
		}
		var req map[string]interface{}
		c.ShouldBindJSON(&req)
		db.Model(&campaign).Updates(req)
		c.JSON(http.StatusOK, gin.H{"campaign": campaign, "message": "Diperbarui"})
	}
}

func deleteDripCampaign(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		result := db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.DripCampaign{})
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Campaign tidak ditemukan"})
			return
		}
		// Delete steps and enrollments
		db.Where("campaign_id = ?", id).Delete(&models.DripStep{})
		db.Where("campaign_id = ?", id).Delete(&models.DripEnrollment{})
		c.JSON(http.StatusOK, gin.H{"message": "Campaign dihapus"})
	}
}

func addDripStep(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var campaign models.DripCampaign
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&campaign).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Campaign tidak ditemukan"})
			return
		}
		var req struct {
			StepOrder  int    `json:"stepOrder"`
			DelayHours int    `json:"delayHours"`
			Type       string `json:"type"`
			Content    string `json:"content" binding:"required"`
			MediaURL   string `json:"mediaUrl"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Content wajib"})
			return
		}
		if req.Type == "" {
			req.Type = "text"
		}
		if req.DelayHours == 0 {
			req.DelayHours = 24
		}
		// Auto step order
		if req.StepOrder == 0 {
			var count int64
			db.Model(&models.DripStep{}).Where("campaign_id = ?", id).Count(&count)
			req.StepOrder = int(count) + 1
		}
		step := models.DripStep{
			CampaignID: uint(id), StepOrder: req.StepOrder,
			DelayHours: req.DelayHours, Type: req.Type,
			Content: req.Content, MediaURL: req.MediaURL,
		}
		db.Create(&step)
		c.JSON(http.StatusCreated, gin.H{"step": step})
	}
}

func updateDripStep(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		stepId, _ := strconv.ParseUint(c.Param("stepId"), 10, 32)
		var step models.DripStep
		if err := db.First(&step, stepId).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Step tidak ditemukan"})
			return
		}
		var req map[string]interface{}
		c.ShouldBindJSON(&req)
		db.Model(&step).Updates(req)
		c.JSON(http.StatusOK, gin.H{"step": step})
	}
}

func deleteDripStep(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		stepId, _ := strconv.ParseUint(c.Param("stepId"), 10, 32)
		db.Delete(&models.DripStep{}, stepId)
		c.JSON(http.StatusOK, gin.H{"message": "Step dihapus"})
	}
}

func enrollDrip(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var campaign models.DripCampaign
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&campaign).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Campaign tidak ditemukan"})
			return
		}
		var req struct {
			Phones []string `json:"phones" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Daftar nomor wajib"})
			return
		}

		enrolled := 0
		for _, phone := range req.Phones {
			if phone == "" {
				continue
			}
			// Get first step delay
			var firstStep models.DripStep
			db.Where("campaign_id = ? AND step_order = ?", id, 1).First(&firstStep)
			delay := 24
			if firstStep.ID != 0 {
				delay = firstStep.DelayHours
			}
			nextSend := time.Now().Add(time.Duration(delay) * time.Hour)

			enrollment := models.DripEnrollment{
				CampaignID:  uint(id),
				Phone:       phone,
				CurrentStep: 0,
				Status:      "active",
				NextSendAt:  &nextSend,
				EnrolledAt:  time.Now(),
			}
			if db.Create(&enrollment).Error == nil {
				enrolled++
			}
		}

		// Update campaign enrolled count
		db.Model(&campaign).Update("enrolled", gorm.Expr("enrolled + ?", enrolled))

		c.JSON(http.StatusOK, gin.H{
			"message":  "Berhasil enroll",
			"enrolled": enrolled,
		})
	}
}
