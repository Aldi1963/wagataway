package handler

import (
	"net/http"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerGroupRuleRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	gr := rg.Group("/group-rules")
	{
		gr.GET("", listGroupRules(db))
		gr.POST("", createGroupRule(db))
		gr.PUT("/:id", updateGroupRule(db))
		gr.DELETE("/:id", deleteGroupRule(db))
		gr.POST("/:id/toggle", toggleGroupRule(db))
	}
}

func listGroupRules(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		page, limit := getPageLimit(c)
		query := db.Where("user_id = ?", userID)
		if deviceID := c.Query("device_id"); deviceID != "" {
			query = query.Where("device_id = ?", deviceID)
		}
		var total int64
		query.Model(&models.GroupRule{}).Count(&total)
		var items []models.GroupRule
		query.Order("created_at DESC").Offset((page - 1) * limit).Limit(limit).Find(&items)
		c.JSON(http.StatusOK, gin.H{
			"rules": items,
			"page":  page,
			"limit": limit,
			"total": total,
		})
	}
}

type groupRuleReq struct {
	DeviceID   uint   `json:"deviceId"`
	GroupJID   string `json:"groupJid"`
	WelcomeMsg string `json:"welcomeMsg"`
	AntiLink   bool   `json:"antiLink"`
	AntiSpam   bool   `json:"antiSpam"`
	IsActive   *bool  `json:"isActive"`
}

func createGroupRule(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		var req groupRuleReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if req.DeviceID == 0 || req.GroupJID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Device dan Group JID wajib diisi"})
			return
		}
		if !deviceBelongsToUser(db, req.DeviceID, userID) {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Device tidak valid"})
			return
		}
		rule := models.GroupRule{
			UserID:     userID,
			DeviceID:   req.DeviceID,
			GroupJID:   req.GroupJID,
			WelcomeMsg: req.WelcomeMsg,
			AntiLink:   req.AntiLink,
			AntiSpam:   req.AntiSpam,
			IsActive:   true,
		}
		if req.IsActive != nil {
			rule.IsActive = *req.IsActive
		}
		if err := db.Create(&rule).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal membuat aturan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"rule": rule})
	}
}

func updateGroupRule(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		var rule models.GroupRule
		if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&rule).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Aturan tidak ditemukan"})
			return
		}
		var req groupRuleReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if req.DeviceID != 0 {
			if !deviceBelongsToUser(db, req.DeviceID, userID) {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Device tidak valid"})
				return
			}
			rule.DeviceID = req.DeviceID
		}
		if req.GroupJID != "" {
			rule.GroupJID = req.GroupJID
		}
		rule.WelcomeMsg = req.WelcomeMsg
		rule.AntiLink = req.AntiLink
		rule.AntiSpam = req.AntiSpam
		if req.IsActive != nil {
			rule.IsActive = *req.IsActive
		}
		db.Save(&rule)
		c.JSON(http.StatusOK, gin.H{"rule": rule})
	}
}

func deleteGroupRule(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		res := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).Delete(&models.GroupRule{})
		if res.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Aturan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Aturan dihapus"})
	}
}

func toggleGroupRule(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		var rule models.GroupRule
		if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&rule).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Aturan tidak ditemukan"})
			return
		}
		rule.IsActive = !rule.IsActive
		db.Save(&rule)
		c.JSON(http.StatusOK, gin.H{"rule": rule})
	}
}
