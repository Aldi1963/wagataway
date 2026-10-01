package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerScheduleRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	s := rg.Group("/schedule")
	{
		s.GET("", listSchedules(db))
		s.POST("", createSchedule(db))
		s.PUT("/:id", updateSchedule(db))
		s.DELETE("/:id", deleteSchedule(db))
		s.PATCH("/:id/cancel", cancelSchedule(db))
	}
}

func listSchedules(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		status := c.DefaultQuery("status", "")

		query := db.Where("user_id = ?", userID)
		if status != "" {
			query = query.Where("status = ?", status)
		}

		var schedules []models.ScheduledMessage
		query.Order("send_at ASC").Limit(100).Find(&schedules)
		c.JSON(http.StatusOK, gin.H{"schedules": schedules})
	}
}

func createSchedule(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		var req struct {
			DeviceID uint   `json:"deviceId" binding:"required"`
			To       string `json:"to" binding:"required"`
			Type     string `json:"type"`
			Content  string `json:"content" binding:"required"`
			MediaURL string `json:"mediaUrl"`
			SendAt   string `json:"sendAt" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if req.Type == "" {
			req.Type = "text"
		}

		sendAt, err := time.Parse(time.RFC3339, req.SendAt)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Format waktu tidak valid (gunakan RFC3339)"})
			return
		}
		if sendAt.Before(time.Now()) {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Waktu kirim harus di masa depan"})
			return
		}

		// Cek kepemilikan device
		var device models.Device
		if err := db.Where("id = ? AND user_id = ?", req.DeviceID, userID).First(&device).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		sched := models.ScheduledMessage{
			UserID: userID, DeviceID: req.DeviceID, To: req.To,
			Type: req.Type, Content: req.Content, MediaURL: req.MediaURL,
			Status: "pending", SendAt: sendAt,
		}
		db.Create(&sched)
		c.JSON(http.StatusCreated, gin.H{"schedule": sched})
	}
}

func updateSchedule(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var sched models.ScheduledMessage
		if err := db.Where("id = ? AND user_id = ? AND status = ?", id, userID, "pending").First(&sched).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Jadwal tidak ditemukan atau sudah terkirim"})
			return
		}
		var req struct {
			To       *string `json:"to"`
			Content  *string `json:"content"`
			MediaURL *string `json:"mediaUrl"`
			SendAt   *string `json:"sendAt"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		updates := map[string]interface{}{}
		if req.To != nil {
			updates["to"] = *req.To
		}
		if req.Content != nil {
			updates["content"] = *req.Content
		}
		if req.MediaURL != nil {
			updates["media_url"] = *req.MediaURL
		}
		if req.SendAt != nil {
			t, err := time.Parse(time.RFC3339, *req.SendAt)
			if err == nil {
				updates["send_at"] = t
			}
		}
		db.Model(&sched).Updates(updates)
		c.JSON(http.StatusOK, gin.H{"schedule": sched, "message": "Diperbarui"})
	}
}

func deleteSchedule(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		result := db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.ScheduledMessage{})
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Jadwal tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Jadwal dihapus"})
	}
}

func cancelSchedule(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		result := db.Model(&models.ScheduledMessage{}).
			Where("id = ? AND user_id = ? AND status = ?", id, userID, "pending").
			Update("status", "cancelled")
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Tidak bisa dibatalkan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Jadwal dibatalkan"})
	}
}

// registerScheduleAliasRoutes mendaftarkan alias jamak /api/schedules
// (memakai handler yang sama dengan /api/schedule) + pause/resume.
func registerScheduleAliasRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	s := rg.Group("/schedules")
	{
		s.GET("", listSchedules(db))
		s.DELETE("/:id", deleteSchedule(db))
		s.PATCH("/:id", patchScheduleState(db))
		s.PATCH("/:id/cancel", cancelSchedule(db))
	}
}

// patchScheduleState: PATCH /api/schedules/:id — body {action: pause|resume|cancel}.
// Scheduler hanya mengeksekusi status "pending", jadi pause/cancel
// benar-benar menghentikan eksekusi terjadwal.
func patchScheduleState(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

		var req struct {
			Action string `json:"action" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "action wajib diisi (pause|resume|cancel)", "code": "VALIDATION_ERROR"})
			return
		}

		var from, to string
		switch req.Action {
		case "pause":
			from, to = "pending", "paused"
		case "resume":
			from, to = "paused", "pending"
		case "cancel":
			from, to = "pending", "cancelled"
		default:
			c.JSON(http.StatusBadRequest, gin.H{"message": "action harus pause, resume, atau cancel", "code": "VALIDATION_ERROR"})
			return
		}

		result := db.Model(&models.ScheduledMessage{}).
			Where("id = ? AND user_id = ? AND status = ?", id, userID, from).
			Update("status", to)
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Jadwal tidak ditemukan atau status tidak sesuai", "code": "NOT_FOUND"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Jadwal " + req.Action, "status": to})
	}
}
