package handler

import (
	"net/http"
	"strconv"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerContactGroupRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	g := rg.Group("/contact-groups")
	{
		g.GET("", listContactGroups(db))
		g.POST("", createContactGroup(db))
		g.PUT("/:id", updateContactGroup(db))
		g.DELETE("/:id", deleteContactGroup(db))
		g.GET("/:id/members", listGroupMembers(db))
		g.POST("/:id/members", addGroupMembers(db))
		g.DELETE("/:id/members/:memberId", removeGroupMember(db))
	}
}

func listContactGroups(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var groups []models.ContactGroup
		db.Where("user_id = ?", userID).Order("name ASC").Find(&groups)
		c.JSON(http.StatusOK, gin.H{"groups": groups})
	}
}

func createContactGroup(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			Name        string `json:"name" binding:"required"`
			Description string `json:"description"`
			Color       string `json:"color"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Nama grup wajib"})
			return
		}
		group := models.ContactGroup{
			UserID: userID, Name: req.Name,
			Description: req.Description, Color: req.Color,
		}
		db.Create(&group)
		c.JSON(http.StatusCreated, gin.H{"group": group})
	}
}

func updateContactGroup(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var group models.ContactGroup
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&group).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Grup tidak ditemukan"})
			return
		}
		var req map[string]interface{}
		c.ShouldBindJSON(&req)
		db.Model(&group).Updates(req)
		c.JSON(http.StatusOK, gin.H{"group": group})
	}
}

func deleteContactGroup(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		db.Where("group_id = ?", id).Delete(&models.ContactGroupMember{})
		db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.ContactGroup{})
		c.JSON(http.StatusOK, gin.H{"message": "Grup dihapus"})
	}
}

func listGroupMembers(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var members []models.ContactGroupMember
		db.Where("group_id = ?", id).Preload("Contact").Find(&members)
		c.JSON(http.StatusOK, gin.H{"members": members})
	}
}

func addGroupMembers(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var req struct {
			ContactIDs []uint `json:"contactIds" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "contactIds wajib"})
			return
		}
		added := 0
		for _, cid := range req.ContactIDs {
			m := models.ContactGroupMember{GroupID: uint(id), ContactID: cid}
			if db.Create(&m).Error == nil {
				added++
			}
		}
		db.Model(&models.ContactGroup{}).Where("id = ?", id).
			Update("member_count", gorm.Expr("member_count + ?", added))
		c.JSON(http.StatusOK, gin.H{"added": added})
	}
}

func removeGroupMember(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		memberId, _ := strconv.ParseUint(c.Param("memberId"), 10, 32)
		result := db.Where("id = ? AND group_id = ?", memberId, id).Delete(&models.ContactGroupMember{})
		if result.RowsAffected > 0 {
			db.Model(&models.ContactGroup{}).Where("id = ?", id).
				Update("member_count", gorm.Expr("member_count - 1"))
		}
		c.JSON(http.StatusOK, gin.H{"message": "Member dihapus"})
	}
}
