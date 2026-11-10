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

func registerStatsRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	rg.GET("/stats/overview", statsOverview(db))
}

func statsOverview(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

		// ── Pesan per hari (14 hari terakhir, hari kosong = 0) ──
		type dayCount struct {
			Day   string
			Count int64
		}
		var dayRows []dayCount
		since := time.Now().AddDate(0, 0, -13)
		udb.Model(&models.Message{}).
			Select("TO_CHAR(created_at, 'YYYY-MM-DD') AS day, COUNT(*) AS count").
			Where("user_id = ? AND created_at >= ?", userID, since).
			Group("day").Order("day ASC").Scan(&dayRows)
		byDay := make(map[string]int64, 14)
		for _, r := range dayRows {
			byDay[r.Day] = r.Count
		}
		messagesPerDay := make([]gin.H, 0, 14)
		for i := 13; i >= 0; i-- {
			d := time.Now().AddDate(0, 0, -i).Format("2006-01-02")
			messagesPerDay = append(messagesPerDay, gin.H{"date": d, "count": byDay[d]})
		}

		// ── Pesan per status ──
		type statusCount struct {
			Status string
			Count  int64
		}
		var msgRows []statusCount
		udb.Model(&models.Message{}).Select("status, COUNT(*) AS count").
			Where("user_id = ?", userID).Group("status").Scan(&msgRows)
		msgStatus := make(map[string]int64)
		for _, r := range msgRows {
			msgStatus[r.Status] = r.Count
		}

		// ── Perangkat per status ──
		var devRows []statusCount
		udb.Model(&models.Device{}).Select("status, COUNT(*) AS count").
			Where("user_id = ?", userID).Group("status").Scan(&devRows)
		devStatus := make(map[string]int64)
		for _, r := range devRows {
			devStatus[r.Status] = r.Count
		}

		// ── Total ──
		var contacts, devices, messages int64
		udb.Model(&models.Contact{}).Where("user_id = ?", userID).Count(&contacts)
		udb.Model(&models.Device{}).Where("user_id = ?", userID).Count(&devices)
		udb.Model(&models.Message{}).Where("user_id = ?", userID).Count(&messages)

		c.JSON(http.StatusOK, gin.H{
			"messagesPerDay": messagesPerDay,
			"messagesByStatus": gin.H{
				"sent":    msgStatus["sent"],
				"failed":  msgStatus["failed"],
				"pending": msgStatus["pending"],
			},
			"devicesByStatus": gin.H{
				"connected":    devStatus["connected"],
				"connecting":   devStatus["connecting"],
				"disconnected": devStatus["disconnected"],
			},
			"totals": gin.H{
				"contacts": contacts,
				"devices":  devices,
				"messages": messages,
			},
		})
	}
}
