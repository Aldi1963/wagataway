package handler

import (
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/chatbackup"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// registerChatBackupRoutes — cadangan percakapan otomatis + manual (Item 11).
// Grup protected + scope "chat": semua endpoint hanya melihat backup milik
// user yang login (filter user_id + RLS), file tidak pernah disajikan lewat
// URL statis.
func registerChatBackupRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	g := rg.Group("/chat/backups", middleware.RequireScope("chat"))
	{
		g.GET("", listChatBackups(db))
		g.POST("", runChatBackupNow(db))
		g.GET("/:id/download", downloadChatBackup(db))
		g.DELETE("/:id", deleteChatBackup(db))
	}
}

// GET /api/chat/backups?deviceId=1 — daftar backup milik user, terbaru dulu.
func listChatBackups(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		query := udb.Where("user_id = ?", userID)
		if devID, err := strconv.Atoi(c.Query("deviceId")); err == nil && devID > 0 {
			query = query.Where("device_id = ?", devID)
		}
		var backups []models.ChatBackup
		query.Order("created_at DESC").Limit(100).Find(&backups)
		if backups == nil {
			backups = []models.ChatBackup{}
		}
		c.JSON(http.StatusOK, gin.H{"backups": backups})
	}
}

type runBackupRequest struct {
	DeviceID uint `json:"deviceId"`
}

// POST /api/chat/backups {deviceId} — buat cadangan sekarang untuk satu
// device milik user. Body camelCase agar ter-bind ke model Go.
func runChatBackupNow(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req runBackupRequest
		if err := c.ShouldBindJSON(&req); err != nil || req.DeviceID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "deviceId wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}
		// Device harus milik user yang login.
		var dev models.Device
		if err := udb.Where("user_id = ?", userID).First(&dev, req.DeviceID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Device tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		now := time.Now()
		rec, err := chatbackup.Run(db, userID, req.DeviceID, now)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat cadangan: " + err.Error(), "code": "BACKUP_FAILED"})
			return
		}
		chatbackup.Prune(db, userID, req.DeviceID, now)
		c.JSON(http.StatusCreated, gin.H{"backup": rec})
	}
}

// GET /api/chat/backups/:id/download — unduh file cadangan milik user.
func downloadChatBackup(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil || id <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "ID backup tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		var rec models.ChatBackup
		if err := udb.Where("user_id = ?", userID).First(&rec, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Backup tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		if rec.Status != "ready" || rec.FilePath == "" {
			c.JSON(http.StatusConflict, gin.H{"message": "File cadangan belum tersedia", "code": "NOT_READY"})
			return
		}
		// Path traversal guard: file harus berada di bawah direktori cadangan.
		abs, err := filepath.Abs(rec.FilePath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Path cadangan tidak valid", "code": "BACKUP_FAILED"})
			return
		}
		base, _ := filepath.Abs(chatbackup.Dir)
		if abs != base && !strings.HasPrefix(abs, base+string(os.PathSeparator)) {
			c.JSON(http.StatusForbidden, gin.H{"message": "Path cadangan tidak diizinkan", "code": "FORBIDDEN"})
			return
		}
		if _, err := os.Stat(abs); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "File cadangan tidak ditemukan di server", "code": "NOT_FOUND"})
			return
		}
		c.Header("Content-Type", "application/json")
		c.Header("Content-Disposition", "attachment; filename="+strconv.Quote(rec.FileName))
		c.File(abs)
	}
}

// DELETE /api/chat/backups/:id — hapus baris + file cadangan milik user.
func deleteChatBackup(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, err := strconv.Atoi(c.Param("id"))
		if err != nil || id <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "ID backup tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		var rec models.ChatBackup
		if err := udb.Where("user_id = ?", userID).First(&rec, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Backup tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		if rec.FilePath != "" {
			if abs, err := filepath.Abs(rec.FilePath); err == nil {
				if base, _ := filepath.Abs(chatbackup.Dir); abs != base && strings.HasPrefix(abs, base+string(os.PathSeparator)) {
					os.Remove(abs)
				}
			}
		}
		udb.Delete(&rec)
		c.JSON(http.StatusOK, gin.H{"message": "Backup dihapus"})
	}
}
