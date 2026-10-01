package handler

import (
	"net/http"
	"strconv"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerTemplateRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	t := rg.Group("/templates")
	{
		t.GET("", listTemplates(db))
		t.POST("", createTemplate(db))
		t.PUT("/:id", updateTemplate(db))
		t.DELETE("/:id", deleteTemplate(db))
	}
}

func listTemplates(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var templates []models.MessageTemplate
		udb.Where("user_id = ?", userID).Order("created_at DESC").Find(&templates)
		c.JSON(http.StatusOK, gin.H{"templates": templates})
	}
}

func createTemplate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req struct {
			Name      string `json:"name" binding:"required"`
			Category  string `json:"category"`
			Content   string `json:"content" binding:"required"`
			Variables string `json:"variables"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		tpl := models.MessageTemplate{
			UserID: userID, Name: req.Name, Category: req.Category,
			Content: req.Content, Variables: req.Variables,
		}
		udb.Create(&tpl)
		c.JSON(http.StatusCreated, gin.H{"template": tpl})
	}
}

func updateTemplate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var tpl models.MessageTemplate
		if err := udb.Where("id = ? AND user_id = ?", id, userID).First(&tpl).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Template tidak ditemukan"})
			return
		}
		var req map[string]interface{}
		c.ShouldBindJSON(&req)
		udb.Model(&tpl).Updates(snakeKeys(req))
		c.JSON(http.StatusOK, gin.H{"template": tpl})
	}
}

func deleteTemplate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		result := udb.Where("id = ? AND user_id = ?", id, userID).Delete(&models.MessageTemplate{})
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Template tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Template dihapus"})
	}
}
