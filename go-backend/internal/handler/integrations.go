package handler

import (
	"encoding/json"
	"io"
	"math"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/quota"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/security"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ─────────────────────────────────────────────────────────────────────────
// Fitur 7: Integration Hub — webhook-inbox generik agar platform luar
// (Google Forms, WooCommerce, WordPress, Zapier, ...) bisa memicu pesan WA
// tanpa coding. Endpoint inbox bersifat publik dan diautentikasi via token
// acak di URL, bukan API key user.
// ─────────────────────────────────────────────────────────────────────────

const (
	inboxMaxBodyBytes = 1 << 20 // 1 MB
	inboxRatePerMin   = 60
)

// ── Registrasi route ─────────────────────────────────────────────────────

func registerIntegrationRoutes(rg *gin.RouterGroup, db *gorm.DB, wm *whatsapp.Manager) {
	ig := rg.Group("/integrations")
	{
		ig.GET("", listIntegrations(db))
		ig.POST("", createIntegration(db))
		ig.GET("/:id", getIntegration(db))
		ig.PUT("/:id", updateIntegration(db))
		ig.DELETE("/:id", deleteIntegration(db))
		ig.POST("/:id/regenerate", regenerateIntegrationToken(db))
		ig.GET("/:id/logs", listIntegrationLogs(db))
	}
}

// registerIntegrationInboxRoute mendaftarkan endpoint PUBLIK (tanpa auth user)
// di grup /api: POST /api/integrations/inbox/:token
func registerIntegrationInboxRoute(rg *gin.RouterGroup, db *gorm.DB, wm *whatsapp.Manager) {
	rg.POST("/integrations/inbox/:token", integrationInbox(db, wm))
}

// ── Representasi API ─────────────────────────────────────────────────────

type integrationOut struct {
	models.Integration
	TokenMasked string `json:"tokenMasked"`
	DeviceName  string `json:"deviceName,omitempty"`
	InboxURL    string `json:"-"`
}

func toIntegrationOut(in models.Integration, deviceName string) integrationOut {
	return integrationOut{
		Integration: in,
		TokenMasked: maskIntegrationToken(in.Token),
		DeviceName:  deviceName,
	}
}

// maskIntegrationToken menyensor token: ab12•••wxyz
func maskIntegrationToken(t string) string {
	if len(t) <= 8 {
		return "••••"
	}
	return t[:4] + "•••" + t[len(t)-4:]
}

// integrationOwned memuat integrasi milik user (nil bila tidak ada / bukan miliknya).
func integrationOwned(db *gorm.DB, userID, id uint) *models.Integration {
	var in models.Integration
	if err := db.Preload("Device", func(db *gorm.DB) *gorm.DB {
		return db.Select("id", "name", "status")
	}).Where("id = ? AND user_id = ?", id, userID).First(&in).Error; err != nil {
		return nil
	}
	return &in
}

// integrationDeviceOwned memastikan deviceId milik user.
func integrationDeviceOwned(db *gorm.DB, userID, deviceID uint) bool {
	var d models.Device
	return db.Select("id").Where("id = ? AND user_id = ?", deviceID, userID).First(&d).Error == nil
}

// ── CRUD (butuh auth) ────────────────────────────────────────────────────

func listIntegrations(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		var list []models.Integration
		db.Where("user_id = ?", userID).
			Preload("Device", func(db *gorm.DB) *gorm.DB { return db.Select("id", "name", "status") }).
			Order("created_at DESC").Find(&list)
		out := make([]integrationOut, 0, len(list))
		for _, in := range list {
			out = append(out, toIntegrationOut(in, in.Device.Name))
		}
		c.JSON(http.StatusOK, gin.H{"integrations": out})
	}
}

func createIntegration(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		var req struct {
			Name     string `json:"name"`
			Platform string `json:"platform"`
			DeviceID uint   `json:"deviceId"`
			Template string `json:"template"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		req.Name = strings.TrimSpace(req.Name)
		req.Platform = strings.TrimSpace(req.Platform)
		if req.Name == "" || req.Platform == "" || req.DeviceID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "nama, platform, dan deviceId wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}
		if !integrationDeviceOwned(db, userID, req.DeviceID) {
			c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		token, err := security.GenerateWebhookSecret() // 32 byte acak -> hex 64 char
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat token", "code": "TOKEN_ERROR"})
			return
		}
		in := models.Integration{
			UserID:   userID,
			Name:     req.Name,
			Platform: strings.ToLower(req.Platform),
			Token:    token,
			DeviceID: req.DeviceID,
			Template: req.Template,
			IsActive: true,
		}
		if err := db.Create(&in).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan integrasi", "code": "DB_ERROR"})
			return
		}
		var d models.Device
		_ = db.Select("id", "name").Where("id = ?", in.DeviceID).First(&d).Error
		c.JSON(http.StatusCreated, gin.H{
			"message":      "Integrasi dibuat",
			"integration":  toIntegrationOut(in, d.Name),
			"fullToken":    token, // hanya ditampilkan penuh di momen pembuatan
			"inboxPath":    "/api/integrations/inbox/" + token,
			"tokenWarning": "Simpan token ini — token penuh tidak ditampilkan lagi di daftar.",
		})
	}
}

func getIntegration(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "ID tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		in := integrationOwned(db, userID, uint(id))
		if in == nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Integrasi tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		// Detail boleh menampilkan token penuh ke pemilik (dipakai tombol "Salin URL").
		out := toIntegrationOut(*in, in.Device.Name)
		c.JSON(http.StatusOK, gin.H{
			"integration": out,
			"fullToken":   in.Token,
			"inboxPath":   "/api/integrations/inbox/" + in.Token,
		})
	}
}

func updateIntegration(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "ID tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		in := integrationOwned(db, userID, uint(id))
		if in == nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Integrasi tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		var req struct {
			Name     *string `json:"name"`
			DeviceID *uint   `json:"deviceId"`
			Template *string `json:"template"`
			IsActive *bool   `json:"isActive"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		updates := map[string]interface{}{}
		if req.Name != nil {
			if strings.TrimSpace(*req.Name) == "" {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Nama tidak boleh kosong", "code": "VALIDATION_ERROR"})
				return
			}
			updates["name"] = strings.TrimSpace(*req.Name)
		}
		if req.DeviceID != nil {
			if *req.DeviceID == 0 || !integrationDeviceOwned(db, userID, *req.DeviceID) {
				c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
				return
			}
			updates["device_id"] = *req.DeviceID
		}
		if req.Template != nil {
			updates["template"] = *req.Template
		}
		if req.IsActive != nil {
			updates["is_active"] = *req.IsActive
		}
		if len(updates) > 0 {
			if err := db.Model(in).Updates(updates).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan", "code": "DB_ERROR"})
				return
			}
		}
		updated := integrationOwned(db, userID, uint(id))
		c.JSON(http.StatusOK, gin.H{"message": "Integrasi diperbarui", "integration": toIntegrationOut(*updated, updated.Device.Name)})
	}
}

func deleteIntegration(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "ID tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		in := integrationOwned(db, userID, uint(id))
		if in == nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Integrasi tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		if err := db.Delete(in).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menghapus", "code": "DB_ERROR"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Integrasi dihapus"})
	}
}

func regenerateIntegrationToken(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "ID tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		in := integrationOwned(db, userID, uint(id))
		if in == nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Integrasi tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		token, err := security.GenerateWebhookSecret()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat token", "code": "TOKEN_ERROR"})
			return
		}
		if err := db.Model(in).Update("token", token).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan token", "code": "DB_ERROR"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message":      "Token baru dibuat — URL inbox lama tidak berlaku lagi",
			"fullToken":    token,
			"inboxPath":    "/api/integrations/inbox/" + token,
			"tokenWarning": "Simpan token ini — token penuh tidak ditampilkan lagi di daftar.",
		})
	}
}

func listIntegrationLogs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "ID tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		in := integrationOwned(db, userID, uint(id))
		if in == nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Integrasi tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		limit := 50
		if l, err := strconv.Atoi(c.DefaultQuery("limit", "50")); err == nil && l > 0 && l <= 200 {
			limit = l
		}
		var logs []models.IntegrationLog
		db.Where("integration_id = ?", in.ID).Order("id DESC").Limit(limit).Find(&logs)
		c.JSON(http.StatusOK, gin.H{"logs": logs})
	}
}

// ── Inbox publik ─────────────────────────────────────────────────────────

var (
	inboxTplVarRe = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}`)
)

// renderIntegrationTemplate mengganti {{path.ke.field}} dari payload.
// Field yang tidak ada diisi string kosong (tidak error).
func renderIntegrationTemplate(tpl string, payload map[string]interface{}) string {
	return inboxTplVarRe.ReplaceAllStringFunc(tpl, func(m string) string {
		sub := inboxTplVarRe.FindStringSubmatch(m)
		if len(sub) < 2 {
			return ""
		}
		return lookupPayloadPath(payload, strings.Split(strings.TrimSpace(sub[1]), "."))
	})
}

// lookupPayloadPath menelusuri map bertingkat; mengembalikan "" bila tidak ada.
func lookupPayloadPath(data interface{}, path []string) string {
	cur := data
	for _, p := range path {
		m, ok := cur.(map[string]interface{})
		if !ok {
			return ""
		}
		cur, ok = m[p]
		if !ok || cur == nil {
			return ""
		}
	}
	switch v := cur.(type) {
	case string:
		return v
	case float64:
		if v == math.Trunc(v) && math.Abs(v) < 1e15 {
			return strconv.FormatInt(int64(v), 10)
		}
		return strconv.FormatFloat(v, 'f', -1, 64)
	case bool:
		return strconv.FormatBool(v)
	case json.Number:
		return v.String()
	default:
		b, err := json.Marshal(cur)
		if err != nil {
			return ""
		}
		return string(b)
	}
}

// normalizeInboxPhone menormalisasi nomor tujuan ke digit internasional.
// "0857-xxx" -> "62857xxx"; "+62 857..." -> "62857..."; "62857..." tetap.
func normalizeInboxPhone(raw string) (string, bool) {
	s := strings.TrimSpace(raw)
	s = strings.TrimPrefix(s, "+")
	for _, r := range []string{" ", "-", ".", "(", ")"} {
		s = strings.ReplaceAll(s, r, "")
	}
	if strings.HasPrefix(s, "0") {
		s = "62" + s[1:]
	}
	if len(s) < 9 || len(s) > 16 {
		return "", false
	}
	for _, ch := range s {
		if ch < '0' || ch > '9' {
			return "", false
		}
	}
	return s, true
}

// ── Sensor payload untuk log ─────────────────────────────────────────────

var inboxSensitiveKeys = []string{"token", "secret", "password", "api_key", "apikey", "authorization", "auth", "pin", "otp"}

func isSensitiveKey(k string) bool {
	lk := strings.ToLower(k)
	for _, s := range inboxSensitiveKeys {
		if strings.Contains(lk, s) {
			return true
		}
	}
	return false
}

// redactSensitivePayload menyalin payload dan menyensor nilai kunci sensitif.
func redactSensitivePayload(payload map[string]interface{}) map[string]interface{} {
	out := make(map[string]interface{}, len(payload))
	for k, v := range payload {
		if isSensitiveKey(k) {
			out[k] = "•••"
			continue
		}
		if m, ok := v.(map[string]interface{}); ok {
			out[k] = redactSensitivePayload(m)
			continue
		}
		out[k] = v
	}
	return out
}

// summarizePayload mengembalikan ringkasan JSON payload (sudah disensor, maks ~2KB).
func summarizePayload(payload map[string]interface{}) string {
	b, err := json.Marshal(redactSensitivePayload(payload))
	if err != nil {
		return "{}"
	}
	const max = 2048
	if len(b) > max {
		return string(b[:max]) + "…(dipotong)"
	}
	return string(b)
}

// ── Rate limit per token (60/menit) ──────────────────────────────────────

type inboxBucket struct {
	count int
	start time.Time
}

var inboxLimiter = struct {
	sync.Mutex
	m map[string]*inboxBucket
}{m: make(map[string]*inboxBucket)}

func inboxTokenAllowed(token string) bool {
	now := time.Now()
	inboxLimiter.Lock()
	defer inboxLimiter.Unlock()
	b, ok := inboxLimiter.m[token]
	if !ok || now.Sub(b.start) >= time.Minute {
		inboxLimiter.m[token] = &inboxBucket{count: 1, start: now}
		return true
	}
	if b.count >= inboxRatePerMin {
		return false
	}
	b.count++
	return true
}

// resetInboxLimiter hanya untuk unit test.
func resetInboxLimiter() {
	inboxLimiter.Lock()
	defer inboxLimiter.Unlock()
	inboxLimiter.m = make(map[string]*inboxBucket)
}

// ── Handler inbox ────────────────────────────────────────────────────────

func integrationInbox(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := strings.TrimSpace(c.Param("token"))
		if token == "" || len(token) > 128 {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Token integrasi tidak valid", "code": "INVALID_TOKEN"})
			return
		}

		// Rate limit per token: 60/menit.
		if !inboxTokenAllowed(token) {
			c.JSON(http.StatusTooManyRequests, gin.H{"success": false, "message": "Batas 60 permintaan/menit terlampaui, coba lagi nanti", "code": "RATE_LIMITED"})
			return
		}

		// Cari integrasi TANPA membocorkan integrasi lain: token salah -> 404 generik.
		var in models.Integration
		if err := db.Where("token = ?", token).First(&in).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Token integrasi tidak valid", "code": "INVALID_TOKEN"})
			return
		}
		if !in.IsActive {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Integrasi ini sedang nonaktif", "code": "INTEGRATION_DISABLED"})
			return
		}

		// Body fleksibel: JSON apa pun dari platform luar (maks 1 MB).
		raw, err := io.ReadAll(io.LimitReader(c.Request.Body, inboxMaxBodyBytes))
		if err != nil || len(raw) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Body JSON wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}
		var payload map[string]interface{}
		if err := json.Unmarshal(raw, &payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Body harus JSON yang valid", "code": "VALIDATION_ERROR"})
			return
		}

		logEntry := models.IntegrationLog{
			IntegrationID: in.ID,
			Status:        "failed",
			PayloadJSON:   summarizePayload(payload),
		}
		fail := func(code int, msg, codeStr, errMsg string) {
			logEntry.ErrorMsg = errMsg
			if logEntry.ErrorMsg == "" {
				logEntry.ErrorMsg = msg
			}
			_ = db.Create(&logEntry).Error
			c.JSON(code, gin.H{"success": false, "message": msg, "code": codeStr})
		}

		// "to" wajib.
		toRaw, _ := payload["to"].(string)
		to, ok := normalizeInboxPhone(toRaw)
		if !ok {
			fail(http.StatusBadRequest, "Field \"to\" wajib diisi dengan nomor WA yang valid (mis. 62812xxxxxxx)", "VALIDATION_ERROR", "nomor tujuan tidak valid: "+toRaw)
			return
		}
		logEntry.To = to

		// Isi pesan: pakai "message" bila ada, kalau tidak render template.
		var text string
		if m, ok := payload["message"].(string); ok && strings.TrimSpace(m) != "" {
			text = strings.TrimSpace(m)
		} else if strings.TrimSpace(in.Template) != "" {
			text = strings.TrimSpace(renderIntegrationTemplate(in.Template, payload))
		}
		if text == "" {
			fail(http.StatusBadRequest, "Tidak ada pesan: isi field \"message\" atau atur template di integrasi", "VALIDATION_ERROR", "pesan kosong (tanpa message & template)")
			return
		}
		if len([]rune(text)) > 10000 {
			fail(http.StatusBadRequest, "Pesan terlalu panjang (maks 10000 karakter)", "VALIDATION_ERROR", "pesan > 10000 karakter")
			return
		}

		// Device harus milik user pembuat integrasi & sedang terhubung.
		var device models.Device
		if err := db.Where("id = ? AND user_id = ?", in.DeviceID, in.UserID).First(&device).Error; err != nil {
			fail(http.StatusInternalServerError, "Perangkat pengirim integrasi tidak tersedia", "DEVICE_UNAVAILABLE", "device tidak ditemukan")
			return
		}
		if wm.GetStatus(device.ID) != "connected" {
			fail(http.StatusServiceUnavailable, "Perangkat pengirim sedang tidak terhubung, coba lagi nanti", "DEVICE_OFFLINE", "device tidak connected")
			return
		}

		// Kuota pesan bulanan (Fitur 3): tolak 429 bila habis.
		if qr, qerr := quota.Check(db, in.UserID); qerr == nil && !qr.Allowed {
			fail(http.StatusTooManyRequests, quota.ExceededMessage(qr), "QUOTA_EXCEEDED", "kuota pesan habis")
			return
		}

		// Catat pesan (konsisten dengan riwayat pesan biasa) lalu kirim.
		msg := models.Message{
			UserID:   in.UserID,
			DeviceID: device.ID,
			To:       to,
			Type:     "text",
			Content:  text,
			Status:   "pending",
			Via:      "integration",
		}
		if err := db.Create(&msg).Error; err != nil {
			fail(http.StatusInternalServerError, "Gagal menyimpan pesan", "DB_ERROR", err.Error())
			return
		}

		campaignID := "integration-" + time.Now().Format("20060102150405")
		waID, err := wm.SendMessageWithOptions(device.ID, to, whatsapp.SendOptions{Type: "text", Content: text})
		if err != nil {
			db.Model(&msg).Updates(map[string]interface{}{"status": "failed", "error_msg": err.Error()})
			recordReport(db, in.UserID, device.ID, campaignID, to, "", "failed", err.Error())
			fail(http.StatusBadGateway, "Gagal mengirim pesan WhatsApp", "SEND_FAILED", err.Error())
			return
		}
		now := time.Now()
		db.Model(&msg).Updates(map[string]interface{}{"status": "sent", "message_id": waID, "sent_at": &now})
		recordReport(db, in.UserID, device.ID, campaignID, to, waID, "sent", "")

		logEntry.Status = "sent"
		logEntry.ErrorMsg = ""
		_ = db.Create(&logEntry).Error

		c.JSON(http.StatusOK, gin.H{
			"success":   true,
			"message":   "Pesan terkirim",
			"to":        to,
			"messageId": waID,
		})
	}
}
