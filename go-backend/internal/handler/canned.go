package handler

import (
	"net/http"
	"strconv"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerCannedResponseRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	cr := rg.Group("/canned-responses")
	{
		cr.GET("", listCanned(db))
		cr.POST("", createCanned(db))
		cr.PUT("/:id", updateCanned(db))
		cr.DELETE("/:id", deleteCanned(db))
	}
}

func listCanned(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var items []models.CannedResponse
		db.Where("user_id = ?", userID).Order("title ASC").Find(&items)
		c.JSON(http.StatusOK, gin.H{"responses": items})
	}
}

func createCanned(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			Title    string `json:"title" binding:"required"`
			Shortcut string `json:"shortcut"`
			Content  string `json:"content" binding:"required"`
			Category string `json:"category"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		item := models.CannedResponse{
			UserID: userID, Title: req.Title, Shortcut: req.Shortcut,
			Content: req.Content, Category: req.Category,
		}
		db.Create(&item)
		c.JSON(http.StatusCreated, gin.H{"response": item})
	}
}

func updateCanned(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var item models.CannedResponse
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&item).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Tidak ditemukan"})
			return
		}
		var req map[string]interface{}
		c.ShouldBindJSON(&req)
		db.Model(&item).Updates(req)
		c.JSON(http.StatusOK, gin.H{"response": item})
	}
}

func deleteCanned(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.CannedResponse{})
		c.JSON(http.StatusOK, gin.H{"message": "Dihapus"})
	}
}
