package handler

import (
	"net/http"
	"strconv"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerContactRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	contacts := rg.Group("/contacts")
	{
		contacts.GET("", listContacts(db))
		contacts.POST("", createContact(db))
		contacts.PUT("/:id", updateContact(db))
		contacts.DELETE("/:id", deleteContact(db))
		contacts.POST("/import", importContacts(db))
	}
}

func listContacts(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		search := c.Query("search")
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 200 {
			limit = 50
		}

		query := db.Where("user_id = ?", userID)
		if search != "" {
			query = query.Where("name ILIKE ? OR phone ILIKE ?", "%"+search+"%", "%"+search+"%")
		}

		var total int64
		query.Model(&models.Contact{}).Count(&total)

		var contacts []models.Contact
		query.Order("created_at DESC").Offset((page - 1) * limit).Limit(limit).Find(&contacts)

		c.JSON(http.StatusOK, gin.H{
			"contacts": contacts,
			"total":    total,
			"page":     page,
			"limit":    limit,
		})
	}
}

func createContact(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			Name  string `json:"name" binding:"required"`
			Phone string `json:"phone" binding:"required"`
			Email string `json:"email"`
			Notes string `json:"notes"`
			Tags  string `json:"tags"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}

		contact := models.Contact{
			UserID: userID,
			Name:   req.Name,
			Phone:  req.Phone,
			Email:  req.Email,
			Notes:  req.Notes,
			Tags:   req.Tags,
		}
		if err := db.Create(&contact).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan kontak", "code": "DB_ERROR"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"contact": contact})
	}
}

func updateContact(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

		var contact models.Contact
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&contact).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Kontak tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		var req struct {
			Name  *string `json:"name"`
			Phone *string `json:"phone"`
			Email *string `json:"email"`
			Notes *string `json:"notes"`
			Tags  *string `json:"tags"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}

		updates := map[string]interface{}{}
		if req.Name != nil {
			updates["name"] = *req.Name
		}
		if req.Phone != nil {
			updates["phone"] = *req.Phone
		}
		if req.Email != nil {
			updates["email"] = *req.Email
		}
		if req.Notes != nil {
			updates["notes"] = *req.Notes
		}
		if req.Tags != nil {
			updates["tags"] = *req.Tags
		}
		db.Model(&contact).Updates(updates)

		c.JSON(http.StatusOK, gin.H{"contact": contact, "message": "Kontak diperbarui"})
	}
}

func deleteContact(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

		result := db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.Contact{})
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Kontak tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Kontak dihapus"})
	}
}

func importContacts(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			Contacts []struct {
				Name  string `json:"name"`
				Phone string `json:"phone"`
				Email string `json:"email"`
				Tags  string `json:"tags"`
			} `json:"contacts" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}

		imported := 0
		for _, r := range req.Contacts {
			if r.Phone == "" {
				continue
			}
			contact := models.Contact{UserID: userID, Name: r.Name, Phone: r.Phone, Email: r.Email, Tags: r.Tags}
			if db.Create(&contact).Error == nil {
				imported++
			}
		}
		c.JSON(http.StatusOK, gin.H{"message": "Import selesai", "imported": imported})
	}
}
