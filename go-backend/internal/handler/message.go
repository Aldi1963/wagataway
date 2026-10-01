package handler

import (
	"encoding/json"
	"net/http"
	"strconv"
	"time"
	"unicode/utf8"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerMessageRoutes(rg *gin.RouterGroup, db *gorm.DB, wm *whatsapp.Manager) {
	msgs := rg.Group("/messages")
	{
		msgs.GET("", middleware.RequireScope("messages:read"), listMessages(db))
		msgs.POST("/send", middleware.RequireScope("messages:send"), sendMessage(db, wm))
		msgs.POST("/send-bulk", middleware.RequireScope("messages:send"), sendBulkMessage(db, wm))
		msgs.POST("/check-recipients", middleware.RequireScope("messages:send"), checkRecipients(db, wm))
		msgs.GET("/bulk-jobs", middleware.RequireScope("messages:read"), listBulkJobs(db))
		msgs.GET("/bulk-stats", middleware.RequireScope("messages:read"), bulkStats(db))
		registerMessageExtraRoutes(msgs, db, wm)
		registerPollRoutes(rg, db, wm)
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
		udb := rls.Scoped(db, userID)

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

		udb.Model(&models.Message{}).Where("user_id = ?", userID).Count(&total)
		udb.Where("user_id = ?", userID).
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
		udb := rls.Scoped(db, userID)

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
		if err := udb.Where("id = ? AND user_id = ?", req.DeviceID, userID).First(&device).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		// Kuota pesan bulanan (Fitur 3): tolak 429 bila habis.
		if !requireMessageQuota(c, udb, userID, 1) {
			return
		}

		// File dari File Manager menggantikan mediaUrl (dibaca langsung dari disk).
		mediaURL := req.MediaURL
		if req.FileID != nil {
			var err error
			mediaURL, err = resolveFileMediaURL(udb, userID, *req.FileID)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"message": "File tidak ditemukan", "code": "NOT_FOUND"})
				return
			}
		}

		// Idempotency: key yang sama tidak dikirim ulang.
		if req.IdempotencyKey != "" {
			var existing models.Message
			if err := udb.Where("user_id = ? AND device_id = ? AND idempotency_key = ?",
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

		if err := udb.Create(&msg).Error; err != nil {
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
				udb.Model(&msg).Updates(map[string]interface{}{"status": "failed", "error_msg": err.Error()})
				recordReport(udb, userID, req.DeviceID, campaignID, req.To, "", "failed", err.Error())
			} else {
				now := time.Now()
				udb.Model(&msg).Updates(map[string]interface{}{"status": "sent", "message_id": waID, "sent_at": &now})
				recordReport(udb, userID, req.DeviceID, campaignID, req.To, waID, "sent", "")
			}
		}()

		c.JSON(http.StatusOK, gin.H{"message": "Pesan sedang dikirim", "data": msg})
	}
}

func sendBulkMessage(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

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
			// AutoClean (Fitur 4): bila true, nomor yang tidak terdaftar di WA
			// dicoret otomatis SEBELUM blast — validasi berjalan sebelum job
			// dibuat dan sebelum distribusi round-robin ke device pengirim.
			// Default false agar perilaku lama tidak berubah.
			AutoClean bool `json:"autoClean"`
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
		udb.Where("user_id = ? AND id IN ?", userID, deviceIDs).Find(&devices)
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
			mediaURL, err = resolveFileMediaURL(udb, userID, *req.FileID)
			if err != nil {
				c.JSON(http.StatusNotFound, gin.H{"message": "File tidak ditemukan", "code": "NOT_FOUND"})
				return
			}
		}

		// Fitur 4 — pembersih nomor otomatis: coret nomor yang tidak terdaftar di
		// WA SEBELUM job dibuat dan SEBELUM distribusi round-robin ke device.
		// Memakai device utama (deviceIDs[0]) untuk validasi. Default nonaktif.
		recipients := req.Recipients
		cleaned := gin.H{
			"applied":    false,
			"total":      len(recipients),
			"valid":      len(recipients),
			"excluded":   0,
			"duplicates": 0,
		}
		var skippedJSON string
		if req.AutoClean {
			valid, excluded, dupCount, err := wm.FilterRegisteredNumbers(deviceIDs[0], recipients)
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal validasi nomor: " + err.Error(), "code": "WA_ERROR"})
				return
			}
			if len(valid) == 0 {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Semua nomor tidak terdaftar di WhatsApp — blast dibatalkan", "code": "NO_VALID_NUMBERS"})
				return
			}
			skippedBytes, _ := json.Marshal(excluded)
			skippedJSON = string(skippedBytes)
			recipients = valid
			cleaned = gin.H{
				"applied":         true,
				"total":           len(req.Recipients),
				"valid":           len(valid),
				"excluded":        len(excluded),
				"duplicates":      dupCount,
				"excludedNumbers": excluded,
			}
		}

		// Kuota pesan bulanan (Fitur 3): hitung per pesan di muka.
		// Ditolak 429 bila used + jumlah penerima > limit.
		if !requireMessageQuota(c, udb, userID, int64(len(recipients))) {
			return
		}

		// Create bulk job
		idsJSON, _ := json.Marshal(deviceIDs)
		job := models.BulkJob{
			UserID:         userID,
			DeviceID:       deviceIDs[0],
			DeviceIDs:      string(idsJSON),
			Type:           req.Type,
			Content:        req.Content,
			MediaURL:       mediaURL,
			Status:         "pending",
			TotalCount:     len(recipients),
			MinDelay:       req.MinDelay,
			MaxDelay:       req.MaxDelay,
			AutoClean:      req.AutoClean,
			SkippedCount:   len(req.Recipients) - len(recipients),
			SkippedNumbers: skippedJSON,
		}

		if err := udb.Create(&job).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat bulk job", "code": "DB_ERROR"})
			return
		}

		// Create recipients
		for _, phone := range recipients {
			recipient := models.BulkJobRecipient{
				BulkJobID: job.ID,
				Phone:     phone,
				Status:    "pending",
			}
			udb.Create(&recipient)
		}

		// Process in background
		go wm.ProcessBulkJob(job.ID, udb)

		c.JSON(http.StatusOK, gin.H{
			"message":   "Bulk message dijadwalkan",
			"job":       job,
			"deviceIds": deviceIDs,
			"cleaned":   cleaned,
		})
	}
}

// GET /api/messages/bulk-stats — ringkasan blast/bulk untuk kartu dashboard:
// jumlah job (campaign), penerima menunggu (pending), terkirim, dan gagal.
func bulkStats(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var jobs int64
		udb.Model(&models.BulkJob{}).Where("user_id = ?", userID).Count(&jobs)
		type row struct {
			Status string
			Count  int64
		}
		var rows []row
		udb.Model(&models.BulkJobRecipient{}).
			Select("bulk_job_recipients.status, COUNT(*) as count").
			Joins("JOIN bulk_jobs ON bulk_jobs.id = bulk_job_recipients.bulk_job_id").
			Where("bulk_jobs.user_id = ?", userID).
			Group("bulk_job_recipients.status").Scan(&rows)
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

// checkRecipients — pratinjau pembersih nomor SEBELUM blast dikirim (Fitur 4).
// POST /api/messages/check-recipients — body: {deviceId, numbers[]} (maks 1000).
// Mengembalikan nomor valid vs nomor yang akan dicoret (tidak terdaftar di WA)
// agar UI bisa menampilkan konfirmasi "N nomor valid, M nomor dicoret. Lanjutkan?"
func checkRecipients(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

		var req struct {
			DeviceID uint     `json:"deviceId" binding:"required"`
			Numbers  []string `json:"numbers" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid (deviceId & numbers wajib)", "code": "VALIDATION_ERROR"})
			return
		}
		if len(req.Numbers) == 0 || len(req.Numbers) > 1000 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "numbers butuh 1-1000 nomor", "code": "VALIDATION_ERROR"})
			return
		}
		if !checkDeviceOwnership(c, udb, userID, req.DeviceID) {
			return
		}

		valid, excluded, dupCount, err := wm.FilterRegisteredNumbers(req.DeviceID, req.Numbers)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal validasi nomor: " + err.Error(), "code": "WA_ERROR"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"total":           len(req.Numbers),
			"valid":           valid,
			"validCount":      len(valid),
			"excluded":        excluded,
			"excludedCount":   len(excluded),
			"duplicates":      dupCount,
			"excludedNumbers": excluded,
		})
	}
}

// listBulkJobs — riwayat campaign blast untuk audit (Fitur 4).
// GET /api/messages/bulk-jobs?limit=20 — menampilkan jumlah nomor yang dicoret
// (skippedCount) + daftarnya (skippedNumbers) per campaign.
func listBulkJobs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		limit := 20
		if l, err := strconv.Atoi(c.DefaultQuery("limit", "20")); err == nil && l > 0 && l <= 100 {
			limit = l
		}

		var jobs []models.BulkJob
		udb.Where("user_id = ?", userID).Order("id DESC").Limit(limit).Find(&jobs)

		out := make([]gin.H, 0, len(jobs))
		for _, j := range jobs {
			var skipped []string
			if j.SkippedNumbers != "" {
				_ = json.Unmarshal([]byte(j.SkippedNumbers), &skipped)
			}
			content := j.Content
			if len([]rune(content)) > 80 {
				content = string([]rune(content)[:80]) + "…"
			}
			out = append(out, gin.H{
				"id":              j.ID,
				"status":          j.Status,
				"totalCount":      j.TotalCount,
				"sentCount":       j.SentCount,
				"failedCount":     j.FailedCount,
				"autoClean":       j.AutoClean,
				"skippedCount":    j.SkippedCount,
				"skippedNumbers":  skipped,
				"contentPreview":  content,
				"createdAt":       j.CreatedAt,
			})
		}
		c.JSON(http.StatusOK, gin.H{"jobs": out})
	}
}
