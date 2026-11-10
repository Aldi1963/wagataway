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

func registerNotificationRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	n := rg.Group("/notifications")
	{
		n.GET("", listNotifications(db))
		n.PUT("/:id/read", markNotifRead(db))
		n.PUT("/read-all", markAllNotifRead(db))
		n.DELETE("/:id", deleteNotification(db))
	}
}

func listNotifications(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var notifs []models.Notification
		udb.Where("user_id = ? OR user_id IS NULL", userID).
			Order("created_at DESC").Limit(50).Find(&notifs)

		var unread int64
		udb.Model(&models.Notification{}).
			Where("(user_id = ? OR user_id IS NULL) AND is_read = ?", userID, false).
			Count(&unread)

		c.JSON(http.StatusOK, gin.H{"notifications": notifs, "unreadCount": unread})
	}
}

func markNotifRead(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		udb.Model(&models.Notification{}).Where("id = ? AND user_id = ?", id, userID).Update("is_read", true)
		c.JSON(http.StatusOK, gin.H{"message": "Ditandai dibaca"})
	}
}

func markAllNotifRead(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		udb.Model(&models.Notification{}).
			Where("(user_id = ? OR user_id IS NULL) AND is_read = ?", userID, false).
			Update("is_read", true)
		c.JSON(http.StatusOK, gin.H{"message": "Semua ditandai dibaca"})
	}
}

func deleteNotification(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		udb.Where("id = ? AND user_id = ?", id, userID).Delete(&models.Notification{})
		c.JSON(http.StatusOK, gin.H{"message": "Notifikasi dihapus"})
	}
}
