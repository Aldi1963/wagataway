package handler

import (
	"net/http"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerAnalyticsRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	a := rg.Group("/analytics")
	{
		a.GET("/overview", analyticsOverview(db))
		a.GET("/messages", analyticsMessages(db))
	}
}

func analyticsOverview(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		today := time.Now().Truncate(24 * time.Hour)

		var totalMsg int64
		udb.Model(&models.Message{}).Where("user_id = ?", userID).Count(&totalMsg)

		var todayMsg int64
		udb.Model(&models.Message{}).Where("user_id = ? AND created_at >= ?", userID, today).Count(&todayMsg)

		var sentMsg int64
		udb.Model(&models.Message{}).Where("user_id = ? AND status = ?", userID, "sent").Count(&sentMsg)

		var failedMsg int64
		udb.Model(&models.Message{}).Where("user_id = ? AND status = ?", userID, "failed").Count(&failedMsg)

		var totalContacts int64
		udb.Model(&models.Contact{}).Where("user_id = ?", userID).Count(&totalContacts)

		var activeDevices int64
		udb.Model(&models.Device{}).Where("user_id = ? AND status = ?", userID, "connected").Count(&activeDevices)

		c.JSON(http.StatusOK, gin.H{
			"totalMessages":  totalMsg,
			"todayMessages":  todayMsg,
			"sentMessages":   sentMsg,
			"failedMessages": failedMsg,
			"totalContacts":  totalContacts,
			"activeDevices":  activeDevices,
			"deliveryRate":   safePercent(sentMsg, sentMsg+failedMsg),
		})
	}
}

func analyticsMessages(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		days := 7
		if q := c.Query("days"); q == "30" {
			days = 30
		}
		type DayStat struct {
			Date   string `json:"date"`
			Sent   int64  `json:"sent"`
			Failed int64  `json:"failed"`
		}

		stats := make([]DayStat, days)
		for i := 0; i < days; i++ {
			day := time.Now().AddDate(0, 0, -(days-1-i)).Truncate(24 * time.Hour)
			nextDay := day.Add(24 * time.Hour)

			var sent, failed int64
			udb.Model(&models.Message{}).Where("user_id = ? AND status = ? AND created_at >= ? AND created_at < ?", userID, "sent", day, nextDay).Count(&sent)
			udb.Model(&models.Message{}).Where("user_id = ? AND status = ? AND created_at >= ? AND created_at < ?", userID, "failed", day, nextDay).Count(&failed)

			stats[i] = DayStat{
				Date:   day.Format("2006-01-02"),
				Sent:   sent,
				Failed: failed,
			}
		}

		c.JSON(http.StatusOK, gin.H{"stats": stats, "days": days})
	}
}

func safePercent(num, denom int64) float64 {
	if denom == 0 {
		return 0
	}
	return float64(num) / float64(denom) * 100
}
