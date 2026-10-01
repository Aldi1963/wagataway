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

func registerChatLabelRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	labels := rg.Group("/chat-labels")
	{
		labels.GET("", listChatLabels(db))
		labels.POST("", createChatLabel(db))
		labels.PUT("/:id", updateChatLabel(db))
		labels.DELETE("/:id", deleteChatLabel(db))
	}
	assign := rg.Group("/chat-assignments")
	{
		assign.GET("", listChatAssignments(db))
		assign.POST("", upsertChatAssignment(db))
		assign.DELETE("/:id", deleteChatAssignment(db))
	}
}

func getPageLimit(c *gin.Context) (int, int) {
	page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if page < 1 {
		page = 1
	}
	if limit < 1 || limit > 200 {
		limit = 20
	}
	return page, limit
}

func listChatLabels(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var labels []models.ChatLabel
		udb.Where("user_id = ?", userID).Order("name ASC").Find(&labels)
		c.JSON(http.StatusOK, gin.H{"labels": labels})
	}
}

func createChatLabel(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req struct {
			Name  string `json:"name" binding:"required"`
			Color string `json:"color"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Nama label wajib diisi"})
			return
		}
		label := models.ChatLabel{UserID: userID, Name: req.Name, Color: req.Color}
		if label.Color == "" {
			label.Color = "#243370"
		}
		if err := udb.Create(&label).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal membuat label"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"label": label})
	}
}

func updateChatLabel(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var label models.ChatLabel
		if err := udb.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&label).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Label tidak ditemukan"})
			return
		}
		var req struct {
			Name  string `json:"name"`
			Color string `json:"color"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if req.Name != "" {
			label.Name = req.Name
		}
		if req.Color != "" {
			label.Color = req.Color
		}
		udb.Save(&label)
		c.JSON(http.StatusOK, gin.H{"label": label})
	}
}

func deleteChatLabel(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		// Lepaskan label dari assignment yang memakainya
		var label models.ChatLabel
		if err := udb.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&label).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Label tidak ditemukan"})
			return
		}
		udb.Model(&models.ChatAssignment{}).Where("label_id = ? AND user_id = ?", label.ID, userID).Update("label_id", nil)
		udb.Delete(&label)
		c.JSON(http.StatusOK, gin.H{"message": "Label dihapus"})
	}
}

func listChatAssignments(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		page, limit := getPageLimit(c)
		query := udb.Where("chat_assignments.user_id = ?", userID)
		if labelID := c.Query("label_id"); labelID != "" {
			query = query.Where("chat_assignments.label_id = ?", labelID)
		}
		var total int64
		query.Model(&models.ChatAssignment{}).Count(&total)
		var items []models.ChatAssignment
		query.Preload("Label").Order("updated_at DESC").
			Offset((page - 1) * limit).Limit(limit).Find(&items)
		c.JSON(http.StatusOK, gin.H{
			"assignments": items,
			"page":        page,
			"limit":       limit,
			"total":       total,
		})
	}
}

func upsertChatAssignment(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req struct {
			ChatJID    string `json:"chatJid" binding:"required"`
			LabelID    *uint  `json:"labelId"`
			AssignedTo string `json:"assignedTo"`
			Note       string `json:"note"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Chat JID wajib diisi"})
			return
		}
		// Pastikan label milik user bila diisi
		if req.LabelID != nil {
			var count int64
			udb.Model(&models.ChatLabel{}).Where("id = ? AND user_id = ?", *req.LabelID, userID).Count(&count)
			if count == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Label tidak valid"})
				return
			}
		}
		var assignment models.ChatAssignment
		err := udb.Where("user_id = ? AND chat_jid = ?", userID, req.ChatJID).First(&assignment).Error
		if err == gorm.ErrRecordNotFound {
			assignment = models.ChatAssignment{
				UserID:     userID,
				ChatJID:    req.ChatJID,
				LabelID:    req.LabelID,
				AssignedTo: req.AssignedTo,
				Note:       req.Note,
			}
			if err := udb.Create(&assignment).Error; err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal menyimpan assignment"})
				return
			}
		} else if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal menyimpan assignment"})
			return
		} else {
			assignment.LabelID = req.LabelID
			assignment.AssignedTo = req.AssignedTo
			assignment.Note = req.Note
			udb.Save(&assignment)
		}
		udb.Preload("Label").First(&assignment, assignment.ID)
		c.JSON(http.StatusOK, gin.H{"assignment": assignment})
	}
}

func deleteChatAssignment(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		res := udb.Where("id = ? AND user_id = ?", c.Param("id"), userID).Delete(&models.ChatAssignment{})
		if res.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Assignment tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Assignment dihapus"})
	}
}
