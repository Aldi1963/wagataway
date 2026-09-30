package handler

import (
	"net/http"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerFollowupRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	fu := rg.Group("/followups")
	{
		fu.GET("", listFollowups(db))
		fu.POST("", createFollowup(db))
		fu.PUT("/:id", updateFollowup(db))
		fu.DELETE("/:id", deleteFollowup(db))
		fu.POST("/:id/toggle", toggleFollowup(db))
	}
}

func listFollowups(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		page, limit := getPageLimit(c)
		query := db.Where("user_id = ?", userID)
		var total int64
		query.Model(&models.Followup{}).Count(&total)
		var items []models.Followup
		query.Order("created_at DESC").Offset((page - 1) * limit).Limit(limit).Find(&items)
		c.JSON(http.StatusOK, gin.H{
			"followups": items,
			"page":      page,
			"limit":     limit,
			"total":     total,
		})
	}
}

type followupReq struct {
	Name              string `json:"name"`
	DeviceID          uint   `json:"deviceId"`
	TargetPhone       string `json:"targetPhone"`
	Message           string `json:"message"`
	TriggerAfterHours int    `json:"triggerAfterHours"`
	IsActive          *bool  `json:"isActive"`
}

func validateFollowupReq(db *gorm.DB, userID uint, req followupReq) string {
	if req.Name == "" {
		return "Nama follow-up wajib diisi"
	}
	if req.TargetPhone == "" {
		return "Nomor target wajib diisi"
	}
	if req.Message == "" {
		return "Pesan wajib diisi"
	}
	if req.TriggerAfterHours < 1 {
		return "Trigger harus minimal 1 jam"
	}
	if !deviceBelongsToUser(db, req.DeviceID, userID) {
		return "Device tidak valid"
	}
	return ""
}

func createFollowup(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req followupReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if msg := validateFollowupReq(db, userID, req); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": msg})
			return
		}
		f := models.Followup{
			UserID:            userID,
			Name:              req.Name,
			DeviceID:          req.DeviceID,
			TargetPhone:       req.TargetPhone,
			Message:           req.Message,
			TriggerAfterHours: req.TriggerAfterHours,
			IsActive:          true,
		}
		if req.IsActive != nil {
			f.IsActive = *req.IsActive
		}
		if err := db.Create(&f).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal membuat follow-up"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"followup": f})
	}
}

func updateFollowup(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var f models.Followup
		if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&f).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Follow-up tidak ditemukan"})
			return
		}
		var req followupReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if msg := validateFollowupReq(db, userID, req); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": msg})
			return
		}
		f.Name = req.Name
		f.DeviceID = req.DeviceID
		f.TargetPhone = req.TargetPhone
		f.Message = req.Message
		f.TriggerAfterHours = req.TriggerAfterHours
		if req.IsActive != nil {
			f.IsActive = *req.IsActive
		}
		db.Save(&f)
		c.JSON(http.StatusOK, gin.H{"followup": f})
	}
}

func deleteFollowup(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		res := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).Delete(&models.Followup{})
		if res.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Follow-up tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Follow-up dihapus"})
	}
}

func toggleFollowup(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var f models.Followup
		if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&f).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Follow-up tidak ditemukan"})
			return
		}
		f.IsActive = !f.IsActive
		db.Save(&f)
		c.JSON(http.StatusOK, gin.H{"followup": f})
	}
}
