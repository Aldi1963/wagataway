package handler

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GET /api/chat/reminders?deviceId=1 — daftar pengingat aktif (belum lewat/belum selesai).
func listChatReminders(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		query := udb.Where("user_id = ? AND is_done = ?", userID, false)
		if devID, err := strconv.Atoi(c.Query("deviceId")); err == nil && devID > 0 {
			query = query.Where("device_id = ?", devID)
		}
		var items []models.ChatReminder
		query.Order("remind_at ASC").Limit(100).Find(&items)
		c.JSON(http.StatusOK, gin.H{"reminders": items})
	}
}

// POST /api/chat/reminders — buat pengingat follow-up.
// Body: { deviceId, phone, remindAt (ISO), note? }
func createChatReminder(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req struct {
			DeviceID uint   `json:"deviceId" binding:"required"`
			Phone    string `json:"phone" binding:"required"`
			RemindAt string `json:"remindAt" binding:"required"`
			Note     string `json:"note"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		remindAt, err := time.Parse("2006-01-02T15:04", strings.TrimSpace(req.RemindAt))
		if err != nil {
			if remindAt, err = time.Parse(time.RFC3339, strings.TrimSpace(req.RemindAt)); err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Format waktu tidak valid", "code": "VALIDATION_ERROR"})
				return
			}
		}
		if !remindAt.After(time.Now()) {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Waktu pengingat harus di masa depan", "code": "VALIDATION_ERROR"})
			return
		}
		note := strings.TrimSpace(req.Note)
		if len([]rune(note)) > 500 {
			note = string([]rune(note)[:500])
		}
		// Satu pengingat aktif per percakapan — buat baru menimpa yang lama.
		udb.Where("user_id = ? AND device_id = ? AND phone = ? AND is_done = ?",
			userID, req.DeviceID, req.Phone, false).Delete(&models.ChatReminder{})
		rem := models.ChatReminder{
			UserID:   userID,
			DeviceID: req.DeviceID,
			Phone:    strings.TrimSpace(req.Phone),
			Note:     note,
			RemindAt: remindAt,
		}
		if err := udb.Create(&rem).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan pengingat", "code": "DB_ERROR"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"reminder": rem})
	}
}

// DELETE /api/chat/reminders/:id — hapus/batalkan pengingat.
func deleteChatReminder(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil || id <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "ID tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		res := udb.Where("id = ? AND user_id = ?", id, userID).Delete(&models.ChatReminder{})
		if res.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Pengingat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Pengingat dihapus"})
	}
}
