package handler

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerRecurringScheduleRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	rs := rg.Group("/recurring-schedules")
	{
		rs.GET("", listRecurringSchedules(db))
		rs.POST("", createRecurringSchedule(db))
		rs.PUT("/:id", updateRecurringSchedule(db))
		rs.DELETE("/:id", deleteRecurringSchedule(db))
		rs.POST("/:id/toggle", toggleRecurringSchedule(db))
	}
}

var jakartaLoc, _ = time.LoadLocation("Asia/Jakarta")

func jakartaNow() time.Time {
	if jakartaLoc != nil {
		return time.Now().In(jakartaLoc)
	}
	return time.Now()
}

// computeNextRun menghitung NextRunAt dari frequency + time + day.
func computeNextRun(frequency, timeStr string, dayOfWeek, dayOfMonth *int) *time.Time {
	parts := strings.Split(timeStr, ":")
	if len(parts) != 2 {
		return nil
	}
	hh, err1 := strconv.Atoi(parts[0])
	mm, err2 := strconv.Atoi(parts[1])
	if err1 != nil || err2 != nil || hh < 0 || hh > 23 || mm < 0 || mm > 59 {
		return nil
	}
	now := jakartaNow()
	at := func(d time.Time) time.Time {
		return time.Date(d.Year(), d.Month(), d.Day(), hh, mm, 0, 0, d.Location())
	}
	var next time.Time
	switch frequency {
	case "weekly":
		dow := 1 // default Senin
		if dayOfWeek != nil {
			dow = *dayOfWeek % 7
		}
		d := now
		for i := 0; i < 8; i++ {
			cand := at(d)
			if int(cand.Weekday()) == dow && cand.After(now) {
				next = cand
				break
			}
			d = d.AddDate(0, 0, 1)
		}
	case "monthly":
		dom := 1
		if dayOfMonth != nil && *dayOfMonth >= 1 && *dayOfMonth <= 31 {
			dom = *dayOfMonth
		}
		y, m, _ := now.Date()
		daysIn := time.Date(y, m+1, 0, 0, 0, 0, 0, now.Location()).Day()
		dd := dom
		if dd > daysIn {
			dd = daysIn
		}
		cand := time.Date(y, m, dd, hh, mm, 0, 0, now.Location())
		if !cand.After(now) {
			y2, m2 := y, m+1
			if m2 > 12 {
				y2++
				m2 = 1
			}
			daysIn2 := time.Date(y2, time.Month(m2)+1, 0, 0, 0, 0, 0, now.Location()).Day()
			dd2 := dom
			if dd2 > daysIn2 {
				dd2 = daysIn2
			}
			cand = time.Date(y2, time.Month(m2), dd2, hh, mm, 0, 0, now.Location())
		}
		next = cand
	default: // daily
		cand := at(now)
		if !cand.After(now) {
			cand = cand.AddDate(0, 0, 1)
		}
		next = cand
	}
	if next.IsZero() {
		return nil
	}
	return &next
}

func deviceBelongsToUser(db *gorm.DB, deviceID, userID uint) bool {
	if deviceID == 0 {
		return true // device opsional
	}
	var count int64
	db.Model(&models.Device{}).Where("id = ? AND user_id = ?", deviceID, userID).Count(&count)
	return count > 0
}

func listRecurringSchedules(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		page, limit := getPageLimit(c)
		query := db.Where("user_id = ?", userID)
		if c.Query("active") == "true" {
			query = query.Where("is_active = ?", true)
		}
		var total int64
		query.Model(&models.RecurringSchedule{}).Count(&total)
		var items []models.RecurringSchedule
		query.Order("next_run_at ASC").Offset((page - 1) * limit).Limit(limit).Find(&items)
		c.JSON(http.StatusOK, gin.H{
			"schedules": items,
			"page":      page,
			"limit":     limit,
			"total":     total,
		})
	}
}

type recurringScheduleReq struct {
	Name       string `json:"name"`
	DeviceID   uint   `json:"deviceId"`
	Target     string `json:"target"`
	Message    string `json:"message"`
	MediaURL   string `json:"mediaUrl"`
	Frequency  string `json:"frequency"`
	Time       string `json:"time"`
	DayOfWeek  *int   `json:"dayOfWeek"`
	DayOfMonth *int   `json:"dayOfMonth"`
	IsActive   *bool  `json:"isActive"`
}

func validateRecurringReq(db *gorm.DB, userID uint, req recurringScheduleReq) string {
	if req.Name == "" {
		return "Nama jadwal wajib diisi"
	}
	if req.Target == "" {
		return "Nomor target wajib diisi"
	}
	if req.Message == "" {
		return "Pesan wajib diisi"
	}
	switch req.Frequency {
	case "daily", "weekly", "monthly":
	default:
		return "Frequency harus daily, weekly, atau monthly"
	}
	parts := strings.Split(req.Time, ":")
	if len(parts) != 2 {
		return "Format waktu harus HH:MM"
	}
	if !deviceBelongsToUser(db, req.DeviceID, userID) {
		return "Device tidak valid"
	}
	return ""
}

func createRecurringSchedule(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req recurringScheduleReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if msg := validateRecurringReq(db, userID, req); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": msg})
			return
		}
		s := models.RecurringSchedule{
			UserID:     userID,
			Name:       req.Name,
			DeviceID:   req.DeviceID,
			Target:     req.Target,
			Message:    req.Message,
			MediaURL:   req.MediaURL,
			Frequency:  req.Frequency,
			Time:       req.Time,
			DayOfWeek:  req.DayOfWeek,
			DayOfMonth: req.DayOfMonth,
			IsActive:   true,
			NextRunAt:  computeNextRun(req.Frequency, req.Time, req.DayOfWeek, req.DayOfMonth),
		}
		if req.IsActive != nil {
			s.IsActive = *req.IsActive
		}
		if err := db.Create(&s).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal membuat jadwal"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"schedule": s})
	}
}

func updateRecurringSchedule(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var s models.RecurringSchedule
		if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&s).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Jadwal tidak ditemukan"})
			return
		}
		var req recurringScheduleReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if msg := validateRecurringReq(db, userID, req); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": msg})
			return
		}
		s.Name = req.Name
		s.DeviceID = req.DeviceID
		s.Target = req.Target
		s.Message = req.Message
		s.MediaURL = req.MediaURL
		s.Frequency = req.Frequency
		s.Time = req.Time
		s.DayOfWeek = req.DayOfWeek
		s.DayOfMonth = req.DayOfMonth
		if req.IsActive != nil {
			s.IsActive = *req.IsActive
		}
		s.NextRunAt = computeNextRun(req.Frequency, req.Time, req.DayOfWeek, req.DayOfMonth)
		db.Save(&s)
		c.JSON(http.StatusOK, gin.H{"schedule": s})
	}
}

func deleteRecurringSchedule(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		res := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).Delete(&models.RecurringSchedule{})
		if res.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Jadwal tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Jadwal dihapus"})
	}
}

func toggleRecurringSchedule(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var s models.RecurringSchedule
		if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&s).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Jadwal tidak ditemukan"})
			return
		}
		s.IsActive = !s.IsActive
		if s.IsActive {
			s.NextRunAt = computeNextRun(s.Frequency, s.Time, s.DayOfWeek, s.DayOfMonth)
		}
		db.Save(&s)
		c.JSON(http.StatusOK, gin.H{"schedule": s})
	}
}
