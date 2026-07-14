package handler

import (
	"net/http"
	"strconv"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerAutoReplyRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	ar := rg.Group("/auto-reply")
	{
		ar.GET("", listAutoReplies(db))
		ar.POST("", createAutoReply(db))
		ar.PUT("/:id", updateAutoReply(db))
		ar.DELETE("/:id", deleteAutoReply(db))
		ar.PATCH("/:id/toggle", toggleAutoReply(db))
	}
}

func listAutoReplies(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var rules []models.AutoReply
		db.Where("user_id = ?", userID).Order("priority DESC, created_at DESC").Find(&rules)
		c.JSON(http.StatusOK, gin.H{"rules": rules})
	}
}

func createAutoReply(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			Name         string `json:"name" binding:"required"`
			Keyword      string `json:"keyword" binding:"required"`
			MatchType    string `json:"matchType"`
			ReplyType    string `json:"replyType"`
			ReplyContent string `json:"replyContent" binding:"required"`
			MediaURL     string `json:"mediaUrl"`
			DeviceID     *uint  `json:"deviceId"`
			Priority     int    `json:"priority"`
			ScheduleFrom string `json:"scheduleFrom"`
			ScheduleTo   string `json:"scheduleTo"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if req.MatchType == "" {
			req.MatchType = "contains"
		}
		if req.ReplyType == "" {
			req.ReplyType = "text"
		}

		rule := models.AutoReply{
			UserID:       userID,
			DeviceID:     req.DeviceID,
			Name:         req.Name,
			Keyword:      req.Keyword,
			MatchType:    req.MatchType,
			ReplyType:    req.ReplyType,
			ReplyContent: req.ReplyContent,
			MediaURL:     req.MediaURL,
			Priority:     req.Priority,
			ScheduleFrom: req.ScheduleFrom,
			ScheduleTo:   req.ScheduleTo,
			IsActive:     true,
		}
		if err := db.Create(&rule).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"rule": rule})
	}
}

func updateAutoReply(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

		var rule models.AutoReply
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&rule).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Rule tidak ditemukan"})
			return
		}

		var req map[string]interface{}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		db.Model(&rule).Updates(req)
		c.JSON(http.StatusOK, gin.H{"rule": rule, "message": "Diperbarui"})
	}
}

func deleteAutoReply(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		result := db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.AutoReply{})
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Rule tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Rule dihapus"})
	}
}

func toggleAutoReply(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

		var rule models.AutoReply
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&rule).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Rule tidak ditemukan"})
			return
		}
		db.Model(&rule).Update("is_active", !rule.IsActive)
		c.JSON(http.StatusOK, gin.H{"isActive": !rule.IsActive})
	}
}
