package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"
	"unicode/utf8"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerMessageRoutes(rg *gin.RouterGroup, db *gorm.DB, wm *whatsapp.Manager) {
	msgs := rg.Group("/messages")
	{
		msgs.GET("", listMessages(db))
		msgs.POST("/send", sendMessage(db, wm))
		msgs.POST("/send-bulk", sendBulkMessage(db, wm))
		msgs.GET("/bulk-stats", bulkStats(db))
		registerMessageExtraRoutes(msgs, db, wm)
	}
}

// viaSource menentukan sumber pengiriman untuk kolom "Via" di Riwayat Pesan:
// "api" bila request memakai X-API-Key (integrasi eksternal), "web" bila lewat dashboard.
func viaSource(c *gin.Context) string {
	if c.GetHeader("X-API-Key") != "" {
		return "api"
	}
	return "web"
}

func listMessages(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		page := 1
		limit := 20
		if p := c.Query("page"); p != "" {
			if n, err := strconv.Atoi(p); err == nil && n > 0 {
				page = n
			}
		}
		if l := c.Query("limit"); l != "" {
			if n, err := strconv.Atoi(l); err == nil && n > 0 && n <= 100 {
				limit = n
			}
		}

		var messages []models.Message
		var total int64

		db.Model(&models.Message{}).Where("user_id = ?", userID).Count(&total)
		db.Where("user_id = ?", userID).
			Order("created_at DESC").
			Offset((page - 1) * limit).
			Limit(limit).
			Find(&messages)

		c.JSON(http.StatusOK, gin.H{
			"messages": messages,
			"total":    total,
			"page":     page,
			"limit":    limit,
		})
	}
}

func sendMessage(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		var req struct {
			DeviceID       uint   `json:"deviceId" binding:"required"`
			To             string `json:"to" binding:"required"`
			Type           string `json:"type"`
			Content        string `json:"content" binding:"required"`
			MediaURL       string `json:"mediaUrl"`
			FileID         *uint  `json:"fileId"`
			Caption        string `json:"caption"`
			ReplyTo        string `json:"replyTo"`
			IdempotencyKey string `json:"idempotencyKey"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}

		if req.Type == "" {
			req.Type = "text"
		}

		if utf8.RuneCountInString(req.Content) > 10000 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Konten pesan maksimal 10000 karakter", "code": "VALIDATION_ERROR"})
			return
		}

		// Cek kepemilikan device
		var device models.Device
		if err := db.Where("id = ? AND user_id = ?", req.DeviceID, userID).First(&device).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		// File dari File Manager menggantikan mediaUrl (dibaca langsung dari disk).
		mediaURL := req.MediaURL
		if req.FileID != nil {
			var err error
			mediaURL, err = resolveFileMediaURL(db, userID, *req.FileID)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"message": "File tidak ditemukan", "code": "NOT_FOUND"})
				return
			}
		}

		// Idempotency: key yang sama tidak dikirim ulang.
		if req.IdempotencyKey != "" {
			var existing models.Message
			if err := db.Where("user_id = ? AND device_id = ? AND idempotency_key = ?",
				userID, req.DeviceID, req.IdempotencyKey).First(&existing).Error; err == nil {
				c.JSON(http.StatusOK, gin.H{"message": "Pesan sudah pernah dikirim (duplikat)", "duplicate": true, "data": existing})
				return
			}
		}

		// Create message record
		msg := models.Message{
			UserID:         userID,
			DeviceID:       req.DeviceID,
			To:             req.To,
			Type:           req.Type,
			Content:        req.Content,
			MediaURL:       mediaURL,
			Caption:        req.Caption,
			Status:         "pending",
			Via:            viaSource(c),
			IdempotencyKey: req.IdempotencyKey,
		}

		if err := db.Create(&msg).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan pesan", "code": "DB_ERROR"})
			return
		}

		// Send via WhatsApp
		campaignID := "single-" + time.Now().Format("20060102150405")
		go func() {
			waID, err := wm.SendMessageWithOptions(req.DeviceID, req.To, whatsapp.SendOptions{
				Type:     req.Type,
				Content:  req.Content,
				MediaURL: mediaURL,
				ReplyTo:  req.ReplyTo,
			})
			if err != nil {
				db.Model(&msg).Updates(map[string]interface{}{"status": "failed", "error_msg": err.Error()})
				recordReport(db, userID, req.DeviceID, campaignID, req.To, "", "failed", err.Error())
			} else {
				now := time.Now()
				db.Model(&msg).Updates(map[string]interface{}{"status": "sent", "message_id": waID, "sent_at": &now})
				recordReport(db, userID, req.DeviceID, campaignID, req.To, waID, "sent", "")
			}
		}()

		c.JSON(http.StatusOK, gin.H{"message": "Pesan sedang dikirim", "data": msg})
	}
}

func sendBulkMessage(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		var req struct {
			DeviceID   uint     `json:"deviceId"`
			DeviceIDs  []uint   `json:"deviceIds"`
			Recipients []string `json:"recipients" binding:"required"`
			Type       string   `json:"type"`
			Content    string   `json:"content" binding:"required"`
			MediaURL   string   `json:"mediaUrl"`
			FileID     *uint    `json:"fileId"`
			MinDelay   int      `json:"minDelay"`
			MaxDelay   int      `json:"maxDelay"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}

		if req.Type == "" {
			req.Type = "text"
		}
		if req.MinDelay == 0 {
			req.MinDelay = 3
		}
		if req.MaxDelay == 0 {
			req.MaxDelay = 8
		}

		if utf8.RuneCountInString(req.Content) > 10000 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Konten pesan maksimal 10000 karakter", "code": "VALIDATION_ERROR"})
			return
		}
		if len(req.Recipients) > 1000 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Maksimal 1000 penerima per blast", "code": "VALIDATION_ERROR"})
			return
		}
		if req.MinDelay < 0 || req.MinDelay > 3600 || req.MaxDelay < 0 || req.MaxDelay > 3600 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Delay harus antara 0 sampai 3600 detik", "code": "VALIDATION_ERROR"})
			return
		}
		if req.MaxDelay < req.MinDelay {
			c.JSON(http.StatusBadRequest, gin.H{"message": "MaxDelay tidak boleh lebih kecil dari MinDelay", "code": "VALIDATION_ERROR"})
			return
		}

		// Device pengirim: deviceIds (rotasi round-robin) atau deviceId tunggal (kompatibilitas lama).
		// Dedupe, buang ID 0.
		seenIDs := map[uint]bool{}
		var deviceIDs []uint
		for _, id := range append(req.DeviceIDs, req.DeviceID) {
			if id == 0 || seenIDs[id] {
				continue
			}
			seenIDs[id] = true
			deviceIDs = append(deviceIDs, id)
		}
		if len(deviceIDs) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Pilih minimal satu perangkat pengirim", "code": "VALIDATION_ERROR"})
			return
		}

		// Cek kepemilikan semua device
		var devices []models.Device
		db.Where("user_id = ? AND id IN ?", userID, deviceIDs).Find(&devices)
		if len(devices) != len(deviceIDs) {
			c.JSON(http.StatusNotFound, gin.H{"message": "Salah satu perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		// Minimal satu device harus sedang connected, kalau tidak blast langsung gagal.
		anyConnected := false
		for _, id := range deviceIDs {
			if wm.GetStatus(id) == "connected" {
				anyConnected = true
				break
			}
		}
		if !anyConnected {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Tidak ada perangkat pengirim yang terhubung", "code": "NO_DEVICE_CONNECTED"})
			return
		}

		// File dari File Manager menggantikan mediaUrl (dibaca langsung dari disk).
		mediaURL := req.MediaURL
		if req.FileID != nil {
			var err error
			mediaURL, err = resolveFileMediaURL(db, userID, *req.FileID)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"message": "File tidak ditemukan", "code": "NOT_FOUND"})
				return
			}
		}

		// Create bulk job
		idsJSON, _ := json.Marshal(deviceIDs)
		job := models.BulkJob{
			UserID:     userID,
			DeviceID:   deviceIDs[0],
			DeviceIDs:  string(idsJSON),
			Type:       req.Type,
			Content:    req.Content,
			MediaURL:   mediaURL,
			Status:     "pending",
			TotalCount: len(req.Recipients),
			MinDelay:   req.MinDelay,
			MaxDelay:   req.MaxDelay,
		}

		if err := db.Create(&job).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat bulk job", "code": "DB_ERROR"})
			return
		}

		// Create recipients
		for _, phone := range req.Recipients {
			recipient := models.BulkJobRecipient{
				BulkJobID: job.ID,
				Phone:     phone,
				Status:    "pending",
			}
			db.Create(&recipient)
		}

		// Process in background
		go wm.ProcessBulkJob(job.ID, db)

		c.JSON(http.StatusOK, gin.H{
			"message":   "Bulk message dijadwalkan",
			"job":       job,
			"deviceIds": deviceIDs,
		})
	}
}

// GET /api/messages/bulk-stats — ringkasan blast/bulk untuk kartu dashboard:
// jumlah job (campaign), penerima menunggu (pending), terkirim, dan gagal.
func bulkStats(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var jobs int64
		db.Model(&models.BulkJob{}).Where("user_id = ?", userID).Count(&jobs)
		type row struct {
			Status string
			Count  int64
		}
		var rows []row
		db.Model(&models.BulkJobRecipient{}).
			Select("status, COUNT(*) as count").
			Joins("JOIN bulk_jobs ON bulk_jobs.id = bulk_job_recipients.bulk_job_id").
			Where("bulk_jobs.user_id = ?", userID).
			Group("status").Scan(&rows)
		stats := gin.H{"jobs": jobs, "wait": int64(0), "sent": int64(0), "failed": int64(0)}
		for _, r := range rows {
			switch r.Status {
			case "pending":
				stats["wait"] = r.Count
			case "sent":
				stats["sent"] = r.Count
			case "failed":
				stats["failed"] = r.Count
			}
		}
		c.JSON(http.StatusOK, stats)
	}
}
