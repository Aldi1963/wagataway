package handler

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strconv"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerLinkManageRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	l := rg.Group("/links")
	{
		l.GET("", listLinks(db))
		l.POST("", createLink(db))
		l.PUT("/:id", updateLink(db))
		l.DELETE("/:id", deleteLink(db))
		l.GET("/:id/stats", linkStats(db))
	}
}

func registerLinkRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	rg.GET("/l/:code", redirectLink(db))
}

func listLinks(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var links []models.ShortLink
		db.Where("user_id = ?", userID).Order("created_at DESC").Find(&links)
		c.JSON(http.StatusOK, gin.H{"links": links})
	}
}

func createLink(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			TargetURL string `json:"targetUrl" binding:"required"`
			Title     string `json:"title"`
			Code      string `json:"code"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "URL tujuan wajib"})
			return
		}
		if req.Code == "" {
			req.Code = generateShortCode()
		}
		// Check uniqueness
		var count int64
		db.Model(&models.ShortLink{}).Where("code = ?", req.Code).Count(&count)
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"message": "Kode sudah dipakai"})
			return
		}

		link := models.ShortLink{
			UserID: userID, Code: req.Code,
			TargetURL: req.TargetURL, Title: req.Title, IsActive: true,
		}
		db.Create(&link)
		c.JSON(http.StatusCreated, gin.H{"link": link})
	}
}

func updateLink(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var link models.ShortLink
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&link).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Link tidak ditemukan"})
			return
		}
		var req map[string]interface{}
		c.ShouldBindJSON(&req)
		db.Model(&link).Updates(req)
		c.JSON(http.StatusOK, gin.H{"link": link})
	}
}

func deleteLink(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.ShortLink{})
		c.JSON(http.StatusOK, gin.H{"message": "Link dihapus"})
	}
}

func linkStats(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var link models.ShortLink
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&link).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Link tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"link":       link,
			"clickCount": link.ClickCount,
		})
	}
}

func redirectLink(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		code := c.Param("code")
		var link models.ShortLink
		if err := db.Where("code = ? AND is_active = ?", code, true).First(&link).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Link tidak ditemukan"})
			return
		}
		// Increment click
		db.Model(&link).Update("click_count", gorm.Expr("click_count + 1"))
		c.Redirect(http.StatusMovedPermanently, link.TargetURL)
	}
}

func generateShortCode() string {
	b := make([]byte, 4)
	rand.Read(b)
	return hex.EncodeToString(b)
}
