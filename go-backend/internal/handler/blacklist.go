package handler

import (
	"net/http"
	"strconv"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerBlacklistRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	bl := rg.Group("/blacklist")
	{
		bl.GET("", listBlacklist(db))
		bl.POST("", addBlacklist(db))
		bl.DELETE("/:id", removeBlacklist(db))
	}
}

func listBlacklist(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var items []models.Blacklist
		db.Where("user_id = ?", userID).Order("created_at DESC").Find(&items)
		c.JSON(http.StatusOK, gin.H{"blacklist": items})
	}
}

func addBlacklist(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			Phone  string `json:"phone" binding:"required"`
			Reason string `json:"reason"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Nomor wajib diisi"})
			return
		}
		item := models.Blacklist{UserID: userID, Phone: req.Phone, Reason: req.Reason}
		db.Create(&item)
		c.JSON(http.StatusCreated, gin.H{"blacklist": item})
	}
}

func removeBlacklist(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		result := db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.Blacklist{})
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Dihapus dari blacklist"})
	}
}
