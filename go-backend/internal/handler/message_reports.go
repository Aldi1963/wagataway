package handler

import (
	"net/http"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerMessageReportRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	reports := rg.Group("/reports")
	{
		reports.GET("/campaigns/:id", getCampaignReport(db))
		reports.GET("/summary", getReportSummary(db))
	}
}

// GET /api/reports/campaigns/:id — detail per nomor untuk satu campaign.
func getCampaignReport(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		page, limit := getPageLimit(c)
		query := udb.Where("user_id = ? AND campaign_id = ?", userID, c.Param("id"))
		if status := c.Query("status"); status != "" {
			query = query.Where("status = ?", status)
		}
		var total int64
		query.Model(&models.MessageReport{}).Count(&total)
		var items []models.MessageReport
		query.Order("created_at DESC").Offset((page - 1) * limit).Limit(limit).Find(&items)
		c.JSON(http.StatusOK, gin.H{
			"reports": items,
			"page":    page,
			"limit":   limit,
			"total":   total,
		})
	}
}

// GET /api/reports/summary — ringkasan per campaign (total, sent, failed, read).
func getReportSummary(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		type row struct {
			CampaignID string `json:"campaignId"`
			Total      int64  `json:"total"`
			Sent       int64  `json:"sent"`
			Failed     int64  `json:"failed"`
			Read       int64  `json:"read"`
		}
		var rows []row
		udb.Model(&models.MessageReport{}).
			Select(`campaign_id,
				COUNT(*) AS total,
				SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent,
				SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed,
				SUM(CASE WHEN status = 'read' THEN 1 ELSE 0 END) AS read`).
			Where("user_id = ?", userID).
			Group("campaign_id").
			Order("campaign_id DESC").
			Find(&rows)
		c.JSON(http.StatusOK, gin.H{"summary": rows})
	}
}
