package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type publicPlan struct {
	ID          uint     `json:"id"`
	Name        string   `json:"name"`
	Slug        string   `json:"slug"`
	Description string   `json:"description"`
	Price       int64    `json:"price"`
	Duration    int      `json:"duration"`
	MaxDevices  int      `json:"maxDevices"`
	MaxMessages int      `json:"maxMessages"`
	MaxContacts int      `json:"maxContacts"`
	Features    []string `json:"features"`
}

// GET /api/public/plans — daftar paket aktif untuk landing page (tanpa auth)
func publicPlans(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var plans []models.Plan
		db.Where("is_active = ?", true).Order("sort_order ASC").Find(&plans)

		out := make([]publicPlan, 0, len(plans))
		for _, p := range plans {
			var features []string
			if p.Features != "" {
				_ = json.Unmarshal([]byte(p.Features), &features)
			}
			if features == nil {
				features = []string{}
			}
			out = append(out, publicPlan{
				ID:          p.ID,
				Name:        p.Name,
				Slug:        p.Slug,
				Description: p.Description,
				Price:       p.Price,
				Duration:    p.Duration,
				MaxDevices:  p.MaxDevices,
				MaxMessages: p.MaxMessages,
				MaxContacts: p.MaxContacts,
				Features:    features,
			})
		}
		c.JSON(http.StatusOK, gin.H{"plans": out})
	}
}

// GET /api/public/stats — statistik publik untuk landing page (tanpa auth)
func publicStats(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var devices int64
		db.Model(&models.Device{}).Count(&devices)

		var messagesTotal int64
		db.Model(&models.Message{}).Count(&messagesTotal)

		now := time.Now()
		startOfDay := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
		var messagesToday int64
		db.Model(&models.Message{}).Where("created_at >= ?", startOfDay).Count(&messagesToday)

		c.JSON(http.StatusOK, gin.H{
			"devices":       devices,
			"messagesToday": messagesToday,
			"messagesTotal": messagesTotal,
		})
	}
}
