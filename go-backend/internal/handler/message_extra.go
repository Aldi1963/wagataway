package handler

import (
	"net/http"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// registerMessageExtraRoutes mendaftarkan endpoint pesan lanjutan.
// Dipanggil dari registerMessageRoutes di message.go.
func registerMessageExtraRoutes(msgs *gin.RouterGroup, db *gorm.DB, wm *whatsapp.Manager) {
	msgs.GET("/:id/status", middleware.RequireScope("messages:read"), getMessageStatus(db))
	msgs.DELETE("/:id", middleware.RequireScope("messages:send"), revokeMessage(db, wm))
	msgs.POST("/send-poll", middleware.RequireScope("messages:send"), sendPollMessageHandler(db, wm))
	msgs.POST("/send-interactive", middleware.RequireScope("messages:send"), sendInteractiveMessageHandler(db, wm))
	msgs.POST("/send-sticker", middleware.RequireScope("messages:send"), sendStickerMessageHandler(db, wm))
	msgs.POST("/send-voice-note", middleware.RequireScope("messages:send"), sendVoiceNoteMessageHandler(db, wm))
	msgs.POST("/send-location", middleware.RequireScope("messages:send"), sendLocationMessageHandler(db, wm))
}

// checkDeviceOwnership memastikan device milik user; 404 bila bukan.
func checkDeviceOwnership(c *gin.Context, db *gorm.DB, userID, deviceID uint) bool {
	var device models.Device
	if err := db.Where("id = ? AND user_id = ?", deviceID, userID).First(&device).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
		return false
	}
	return true
}

// queueSend menyimpan record lalu mengirim via goroutine (pola async),
// mengisi WA message ID + sentAt saat sukses. onSent dipanggil dengan WA
// message ID bila pengiriman sukses (boleh nil).
func queueSend(db *gorm.DB, wm *whatsapp.Manager, userID uint, msg *models.Message, opts whatsapp.SendOptions, onSent func(waID string)) {
	if err := db.Create(msg).Error; err != nil {
		return
	}
	campaignID := "single-" + time.Now().Format("20060102150405")
	go func() {
		waID, err := wm.SendMessageWithOptions(msg.DeviceID, msg.To, opts)
		if err != nil {
			db.Model(msg).Updates(map[string]interface{}{"status": "failed", "error_msg": err.Error()})
			recordReport(db, userID, msg.DeviceID, campaignID, msg.To, "", "failed", err.Error())
		} else {
			now := time.Now()
			db.Model(msg).Updates(map[string]interface{}{"status": "sent", "message_id": waID, "sent_at": &now})
			recordReport(db, userID, msg.DeviceID, campaignID, msg.To, waID, "sent", "")
			if onSent != nil {
				onSent(waID)
			}
		}
	}()
}

// getMessageStatus mengembalikan satu pesan milik user beserta statusnya.
func getMessageStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

		var msg models.Message
		if err := udb.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&msg).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Pesan tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"data": msg})
	}
}

// revokeMessage menarik pesan yang sudah terkirim (hapus untuk semua orang).
func revokeMessage(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

		var msg models.Message
		if err := udb.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&msg).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Pesan tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		if msg.MessageID == "" {
			c.JSON(http.StatusBadRequest, gin.H{
				"message": "Pesan belum memiliki WA message ID (belum terkirim)",
				"code":    "VALIDATION_ERROR",
			})
			return
		}

		if err := wm.RevokeMessage(msg.DeviceID, msg.To, msg.MessageID); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal menarik pesan: " + err.Error(), "code": "REVOKE_FAILED"})
			return
		}

		udb.Model(&msg).Update("status", "revoked")
		c.JSON(http.StatusOK, gin.H{"message": "Pesan ditarik", "data": msg})
	}
}

// sendPollMessageHandler: POST /api/messages/send-poll
func sendPollMessageHandler(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

		var req struct {
			DeviceID           uint     `json:"deviceId" binding:"required"`
			To                 string   `json:"to" binding:"required"`
			Question           string   `json:"question" binding:"required"`
			Options            []string `json:"options" binding:"required"`
			AllowMultiple      bool     `json:"allowMultiple"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		if len(req.Options) < 2 || len(req.Options) > 12 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Poll butuh 2-12 opsi", "code": "VALIDATION_ERROR"})
			return
		}
		if utf8.RuneCountInString(req.Question) > 1000 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Pertanyaan maksimal 1000 karakter", "code": "VALIDATION_ERROR"})
			return
		}
		if !checkDeviceOwnership(c, udb, userID, req.DeviceID) {
			return
		}

		// Kuota pesan bulanan (Fitur 3): tolak 429 bila habis.
		if !requireMessageQuota(c, udb, userID, 1) {
			return
		}

		msg := &models.Message{
			UserID:   userID,
			DeviceID: req.DeviceID,
			To:       req.To,
			Type:     "poll",
			Content:  req.Question,
			Status:   "pending",
			Via:      viaSource(c),
		}
		// Metadata poll (Fitur 6): WA message ID diisi saat pengiriman sukses.
		poll := &models.Poll{
			UserID:        userID,
			DeviceID:      req.DeviceID,
			Question:      req.Question,
			To:            req.To,
			IsGroup:       strings.Contains(req.To, "@g.us"),
			AllowMultiple: req.AllowMultiple,
		}
		poll.SetOptions(req.Options)
		if err := udb.Create(poll).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan metadata poll", "code": "DB_ERROR"})
			return
		}

		queueSend(udb, wm, userID, msg, whatsapp.SendOptions{
			Type:                 "poll",
			Content:              req.Question,
			PollOptions:          req.Options,
			AllowMultipleAnswers: req.AllowMultiple,
		}, func(waID string) {
			now := time.Now()
			udb.Model(poll).Updates(map[string]interface{}{"message_id": waID, "sent_at": &now})
		})

		c.JSON(http.StatusOK, gin.H{"message": "Poll sedang dikirim", "data": msg, "pollId": poll.ID})
	}
}

// sendInteractiveMessageHandler: POST /api/messages/send-interactive
func sendInteractiveMessageHandler(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

		var req struct {
			DeviceID uint   `json:"deviceId" binding:"required"`
			To       string `json:"to" binding:"required"`
			Body     string `json:"body" binding:"required"`
			Buttons  []struct {
				ID    string `json:"id" binding:"required"`
				Title string `json:"title" binding:"required"`
			} `json:"buttons" binding:"required"`
			Footer string `json:"footer"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		if len(req.Buttons) < 1 || len(req.Buttons) > 3 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Butuh 1-3 tombol", "code": "VALIDATION_ERROR"})
			return
		}
		if utf8.RuneCountInString(req.Body) > 2000 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Body maksimal 2000 karakter", "code": "VALIDATION_ERROR"})
			return
		}
		if !checkDeviceOwnership(c, udb, userID, req.DeviceID) {
			return
		}

		// Kuota pesan bulanan (Fitur 3): tolak 429 bila habis.
		if !requireMessageQuota(c, udb, userID, 1) {
			return
		}

		buttons := make([]whatsapp.Button, 0, len(req.Buttons))
		for _, b := range req.Buttons {
			buttons = append(buttons, whatsapp.Button{ID: b.ID, Title: b.Title})
		}

		msg := &models.Message{
			UserID:   userID,
			DeviceID: req.DeviceID,
			To:       req.To,
			Type:     "interactive",
			Content:  req.Body,
			Status:   "pending",
			Via:      viaSource(c),
		}
		queueSend(udb, wm, userID, msg, whatsapp.SendOptions{
			Type:    "interactive",
			Content: req.Body,
			Buttons: buttons,
			Footer:  req.Footer,
		}, nil)

		c.JSON(http.StatusOK, gin.H{"message": "Pesan interaktif sedang dikirim", "data": msg})
	}
}

// sendStickerMessageHandler: POST /api/messages/send-sticker
func sendStickerMessageHandler(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

		var req struct {
			DeviceID uint   `json:"deviceId" binding:"required"`
			To       string `json:"to" binding:"required"`
			MediaURL string `json:"mediaUrl" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid (mediaUrl wajib)", "code": "VALIDATION_ERROR"})
			return
		}
		if !checkDeviceOwnership(c, udb, userID, req.DeviceID) {
			return
		}

		// Kuota pesan bulanan (Fitur 3): tolak 429 bila habis.
		if !requireMessageQuota(c, udb, userID, 1) {
			return
		}

		msg := &models.Message{
			UserID:   userID,
			DeviceID: req.DeviceID,
			To:       req.To,
			Type:     "sticker",
			MediaURL: req.MediaURL,
			Status:   "pending",
			Via:      viaSource(c),
		}
		queueSend(udb, wm, userID, msg, whatsapp.SendOptions{Type: "sticker", MediaURL: req.MediaURL}, nil)

		c.JSON(http.StatusOK, gin.H{"message": "Stiker sedang dikirim", "data": msg})
	}
}

// sendVoiceNoteMessageHandler: POST /api/messages/send-voice-note
func sendVoiceNoteMessageHandler(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

		var req struct {
			DeviceID uint   `json:"deviceId" binding:"required"`
			To       string `json:"to" binding:"required"`
			MediaURL string `json:"mediaUrl" binding:"required"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid (mediaUrl wajib)", "code": "VALIDATION_ERROR"})
			return
		}
		if !checkDeviceOwnership(c, udb, userID, req.DeviceID) {
			return
		}

		// Kuota pesan bulanan (Fitur 3): tolak 429 bila habis.
		if !requireMessageQuota(c, udb, userID, 1) {
			return
		}

		msg := &models.Message{
			UserID:   userID,
			DeviceID: req.DeviceID,
			To:       req.To,
			Type:     "voicenote",
			MediaURL: req.MediaURL,
			Status:   "pending",
			Via:      viaSource(c),
		}
		queueSend(udb, wm, userID, msg, whatsapp.SendOptions{Type: "voicenote", MediaURL: req.MediaURL}, nil)

		c.JSON(http.StatusOK, gin.H{"message": "Voice note sedang dikirim", "data": msg})
	}
}

// sendLocationMessageHandler: POST /api/messages/send-location
func sendLocationMessageHandler(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

		var req struct {
			DeviceID  uint    `json:"deviceId" binding:"required"`
			To        string  `json:"to" binding:"required"`
			Latitude  float64 `json:"latitude" binding:"required"`
			Longitude float64 `json:"longitude" binding:"required"`
			Name      string  `json:"name"`
			Address   string  `json:"address"`
			Live      bool    `json:"live"`
		}

		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid (latitude & longitude wajib)", "code": "VALIDATION_ERROR"})
			return
		}
		if req.Latitude < -90 || req.Latitude > 90 || req.Longitude < -180 || req.Longitude > 180 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Koordinat tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		if !checkDeviceOwnership(c, udb, userID, req.DeviceID) {
			return
		}

		// Kuota pesan bulanan (Fitur 3): tolak 429 bila habis.
		if !requireMessageQuota(c, udb, userID, 1) {
			return
		}

		msg := &models.Message{
			UserID:   userID,
			DeviceID: req.DeviceID,
			To:       req.To,
			Type:     "location",
			Content:  req.Name,
			Status:   "pending",
			Via:      viaSource(c),
		}
		queueSend(udb, wm, userID, msg, whatsapp.SendOptions{
			Type:         "location",
			Latitude:     req.Latitude,
			Longitude:    req.Longitude,
			LocName:      req.Name,
			LocAddress:   req.Address,
			LiveLocation: req.Live,
		}, nil)

		c.JSON(http.StatusOK, gin.H{"message": "Lokasi sedang dikirim", "data": msg})
	}
}
