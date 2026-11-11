package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ── Template pesan resmi ────────────────────────────────────────────────────
// Alur persetujuan: draft → pending (diajukan) → approved / rejected.
// PERSETUJUAN META BERADA DI LUAR KENDALI KODE: endpoint approve/reject di
// sini hanya MENCATAT keputusan yang dibuat di Meta Business Manager (atau
// oleh admin) — bukan persetujuan otomatis dari Meta. Template hanya boleh
// dikirim bila statusnya approved. Pengiriman memakai device WA yang
// terhubung (transport yang sudah ada); konfigurasi WABA/Cloud API
// (meta_waba_*) disiapkan di gateway_settings.go untuk pemakaian mendatang.

const (
	templateStatusDraft    = "draft"
	templateStatusPending  = "pending"
	templateStatusApproved = "approved"
	templateStatusRejected = "rejected"
)

var (
	templateStatuses = map[string]bool{
		templateStatusDraft: true, templateStatusPending: true,
		templateStatusApproved: true, templateStatusRejected: true,
	}
	// Kategori resmi Meta + "umum" untuk template internal lama.
	templateCategories = map[string]bool{
		"utility": true, "marketing": true, "authentication": true, "umum": true,
	}
	templateLanguages = map[string]bool{"id": true, "en": true}
	// {{nama}} atau {{1}} — nama boleh huruf/angka/garis bawah/titik.
	templateVarRe = regexp.MustCompile(`\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}`)
)

func registerTemplateRoutes(rg *gin.RouterGroup, db *gorm.DB, wm *whatsapp.Manager) {
	t := rg.Group("/templates")
	{
		t.GET("", listTemplates(db))
		t.POST("", createTemplate(db))
		t.GET("/meta-config", getTemplateMetaConfig(db))
		t.GET("/:id/history", listTemplateHistory(db))
		t.POST("/:id/submit", submitTemplate(db))
		t.POST("/:id/approve", approveTemplate(db))
		t.POST("/:id/reject", rejectTemplate(db))
		t.POST("/:id/send", sendTemplate(db, wm))
		t.PUT("/:id", updateTemplate(db))
		t.DELETE("/:id", deleteTemplate(db))
	}
}

// extractTemplateVariables mengambil nama variabel unik dari isi template,
// sesuai urutan kemunculan pertama. {{1}} ikut tercatat sebagai "1".
func extractTemplateVariables(content string) []string {
	var out []string
	seen := map[string]bool{}
	for _, m := range templateVarRe.FindAllStringSubmatch(content, -1) {
		if len(m) < 2 || seen[m[1]] {
			continue
		}
		seen[m[1]] = true
		out = append(out, m[1])
	}
	return out
}

// renderMessageTemplate mengganti variabel di isi template.
//   - {{nama}} diambil dari vars["nama"].
//   - {{1}}, {{2}}, ... (gaya Meta) diambil dari vars[nama-variabel-ke-n]
//     sesuai urutan deklarasi template; bila tidak ada deklarasi, dari
//     vars["1"], vars["2"], ...
// Mengembalikan hasil render + daftar variabel yang nilainya belum diisi.
func renderMessageTemplate(content string, vars map[string]string, declared []string) (string, []string) {
	var missing []string
	seenMissing := map[string]bool{}
	rendered := templateVarRe.ReplaceAllStringFunc(content, func(m string) string {
		sub := templateVarRe.FindStringSubmatch(m)
		if len(sub) < 2 {
			return m
		}
		name := sub[1]
		if v, ok := vars[name]; ok {
			return v
		}
		// Variabel posisi gaya Meta: {{1}} = variabel deklarasi pertama.
		if n, err := strconv.Atoi(name); err == nil && n >= 1 {
			if n <= len(declared) {
				if v, ok := vars[declared[n-1]]; ok {
					return v
				}
			}
		}
		if !seenMissing[name] {
			seenMissing[name] = true
			missing = append(missing, name)
		}
		return m
	})
	sort.Strings(missing)
	return rendered, missing
}

func parseTemplateStringSlice(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return nil
	}
	var out []string
	if err := json.Unmarshal([]byte(raw), &out); err != nil {
		return nil
	}
	return out
}

func parseTemplateStringMap(raw string) map[string]string {
	out := map[string]string{}
	if strings.TrimSpace(raw) == "" {
		return out
	}
	_ = json.Unmarshal([]byte(raw), &out)
	return out
}

func validTemplateJSON(raw string, wantObject bool) bool {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return true
	}
	if wantObject {
		var m map[string]string
		return json.Unmarshal([]byte(raw), &m) == nil
	}
	var arr []string
	return json.Unmarshal([]byte(raw), &arr) == nil
}

func normalizeTemplateCategory(c string) string {
	c = strings.ToLower(strings.TrimSpace(c))
	if c == "" {
		return "umum"
	}
	return c
}

func loadTemplateForUser(udb *gorm.DB, userID uint, id uint64) (models.MessageTemplate, error) {
	var tpl models.MessageTemplate
	err := udb.Where("id = ? AND user_id = ?", id, userID).First(&tpl).Error
	return tpl, err
}

func actorNameFor(db *gorm.DB, userID uint) string {
	var u models.User
	if err := db.Select("id", "name").Where("id = ?", userID).First(&u).Error; err != nil {
		return "Pengguna"
	}
	if strings.TrimSpace(u.Name) == "" {
		return "Pengguna"
	}
	return u.Name
}

func recordTemplateApproval(db *gorm.DB, tpl models.MessageTemplate, userID uint, action, from, to, reason string) {
	_ = db.Create(&models.MessageTemplateApproval{
		TemplateID: tpl.ID, UserID: userID, ActorName: actorNameFor(db, userID),
		Action: action, FromStatus: from, ToStatus: to, Reason: reason,
	}).Error
}

type templateInput struct {
	Name          string `json:"name"`
	Category      string `json:"category"`
	Language      string `json:"language"`
	Content       string `json:"content"`
	Variables     string `json:"variables"`
	ExampleValues string `json:"exampleValues"`
}

func (in *templateInput) validate() string {
	if strings.TrimSpace(in.Name) == "" || strings.TrimSpace(in.Content) == "" {
		return "Nama dan isi template wajib diisi"
	}
	if len(in.Name) > 255 || len(in.Content) > 10000 {
		return "Nama maksimal 255 karakter, isi maksimal 10000 karakter"
	}
	if in.Category != "" && !templateCategories[normalizeTemplateCategory(in.Category)] {
		return "Kategori harus utility, marketing, authentication, atau umum"
	}
	if in.Language != "" && !templateLanguages[strings.ToLower(strings.TrimSpace(in.Language))] {
		return "Bahasa harus id atau en"
	}
	if !validTemplateJSON(in.Variables, false) {
		return "Variables harus array JSON, mis. [\"nama\", \"kode\"]"
	}
	if !validTemplateJSON(in.ExampleValues, true) {
		return "ExampleValues harus objek JSON, mis. {\"nama\": \"Budi\"}"
	}
	return ""
}

func listTemplates(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		q := udb.Where("user_id = ?", userID)
		if st := strings.ToLower(strings.TrimSpace(c.Query("status"))); st != "" {
			if !templateStatuses[st] {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Status tidak valid"})
				return
			}
			q = q.Where("status = ?", st)
		}
		var templates []models.MessageTemplate
		q.Order("created_at DESC").Find(&templates)
		c.JSON(http.StatusOK, gin.H{"templates": templates})
	}
}

func createTemplate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req templateInput
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if msg := req.validate(); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": msg})
			return
		}
		lang := strings.ToLower(strings.TrimSpace(req.Language))
		if lang == "" {
			lang = "id"
		}
		vars := req.Variables
		if strings.TrimSpace(vars) == "" {
			if extracted := extractTemplateVariables(req.Content); len(extracted) > 0 {
				b, _ := json.Marshal(extracted)
				vars = string(b)
			}
		}
		tpl := models.MessageTemplate{
			UserID: userID, Name: strings.TrimSpace(req.Name),
			Category: normalizeTemplateCategory(req.Category), Language: lang,
			Content: req.Content, Variables: vars, ExampleValues: req.ExampleValues,
			Status: templateStatusDraft,
		}
		if err := udb.Create(&tpl).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan template"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"template": tpl})
	}
}

func updateTemplate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		tpl, err := loadTemplateForUser(udb, userID, id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Template tidak ditemukan"})
			return
		}
		var req templateInput
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if msg := req.validate(); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": msg})
			return
		}
		// Perubahan isi/bahasa/kategori/nama membatalkan persetujuan yang
		// sudah ada: template kembali ke draft dan harus diajukan ulang.
		contentChanged := strings.TrimSpace(req.Name) != tpl.Name ||
			normalizeTemplateCategory(req.Category) != tpl.Category ||
			(strings.ToLower(strings.TrimSpace(req.Language)) != "" &&
				strings.ToLower(strings.TrimSpace(req.Language)) != tpl.Language) ||
			req.Content != tpl.Content
		oldStatus := tpl.Status
		updates := map[string]interface{}{
			"name": strings.TrimSpace(req.Name),
			"category": normalizeTemplateCategory(req.Category),
			"content": req.Content,
			"variables": req.Variables,
			"example_values": req.ExampleValues,
		}
		if strings.TrimSpace(req.Language) != "" {
			updates["language"] = strings.ToLower(strings.TrimSpace(req.Language))
		}
		if strings.TrimSpace(req.Variables) == "" {
			if extracted := extractTemplateVariables(req.Content); len(extracted) > 0 {
				b, _ := json.Marshal(extracted)
				updates["variables"] = string(b)
			}
		}
		if contentChanged && (oldStatus == templateStatusApproved || oldStatus == templateStatusPending) {
			updates["status"] = templateStatusDraft
			updates["rejection_reason"] = ""
		}
		if err := udb.Model(&tpl).Updates(updates).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memperbarui template"})
			return
		}
		if contentChanged && (oldStatus == templateStatusApproved || oldStatus == templateStatusPending) {
			recordTemplateApproval(db, tpl, userID, "edited", oldStatus, templateStatusDraft,
				"Isi template diubah — persetujuan sebelumnya batal, ajukan ulang.")
		}
		_ = udb.Where("id = ? AND user_id = ?", id, userID).First(&tpl).Error
		c.JSON(http.StatusOK, gin.H{"template": tpl})
	}
}

func deleteTemplate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		if _, err := loadTemplateForUser(udb, userID, id); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Template tidak ditemukan"})
			return
		}
		udb.Where("template_id = ?", id).Delete(&models.MessageTemplateApproval{})
		udb.Where("id = ? AND user_id = ?", id, userID).Delete(&models.MessageTemplate{})
		c.JSON(http.StatusOK, gin.H{"message": "Template dihapus"})
	}
}

// submitTemplate: draft/rejected → pending (mengajukan ke Meta).
func submitTemplate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		tpl, err := loadTemplateForUser(udb, userID, id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Template tidak ditemukan"})
			return
		}
		if tpl.Status != templateStatusDraft && tpl.Status != templateStatusRejected {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Hanya template draft atau ditolak yang bisa diajukan"})
			return
		}
		old := tpl.Status
		if err := udb.Model(&tpl).Updates(map[string]interface{}{
			"status": templateStatusPending, "rejection_reason": "",
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal mengajukan template"})
			return
		}
		recordTemplateApproval(db, tpl, userID, "submitted", old, templateStatusPending,
			"Diajukan untuk persetujuan Meta.")
		c.JSON(http.StatusOK, gin.H{"message": "Template diajukan", "template": tpl})
	}
}

// approveTemplate: pending → approved. MENCATAT keputusan Meta — bukan
// persetujuan otomatis. Panggil setelah Meta menyetujui template ini.
func approveTemplate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		tpl, err := loadTemplateForUser(udb, userID, id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Template tidak ditemukan"})
			return
		}
		if tpl.Status != templateStatusPending {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Hanya template yang sedang diajukan yang bisa disetujui"})
			return
		}
		if err := udb.Model(&tpl).Update("status", templateStatusApproved).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyetujui template"})
			return
		}
		recordTemplateApproval(db, tpl, userID, "approved", templateStatusPending,
			templateStatusApproved, "Disetujui Meta — dicatat di aplikasi.")
		c.JSON(http.StatusOK, gin.H{"message": "Template disetujui", "template": tpl})
	}
}

// rejectTemplate: pending → rejected, wajib alasan penolakan.
func rejectTemplate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		tpl, err := loadTemplateForUser(udb, userID, id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Template tidak ditemukan"})
			return
		}
		if tpl.Status != templateStatusPending {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Hanya template yang sedang diajukan yang bisa ditolak"})
			return
		}
		var req struct {
			Reason string `json:"reason"`
		}
		_ = c.ShouldBindJSON(&req)
		reason := strings.TrimSpace(req.Reason)
		if reason == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Alasan penolakan wajib diisi"})
			return
		}
		if err := udb.Model(&tpl).Updates(map[string]interface{}{
			"status": templateStatusRejected, "rejection_reason": reason,
		}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menolak template"})
			return
		}
		recordTemplateApproval(db, tpl, userID, "rejected", templateStatusPending,
			templateStatusRejected, reason)
		c.JSON(http.StatusOK, gin.H{"message": "Template ditolak", "template": tpl})
	}
}

func listTemplateHistory(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		if _, err := loadTemplateForUser(udb, userID, id); err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Template tidak ditemukan"})
			return
		}
		var history []models.MessageTemplateApproval
		udb.Where("template_id = ?", id).Order("created_at DESC, id DESC").Find(&history)
		c.JSON(http.StatusOK, gin.H{"history": history})
	}
}

// getTemplateMetaConfig: status konfigurasi WABA untuk halaman template.
// Token tidak pernah dikembalikan — hanya penanda sudah terisi.
func getTemplateMetaConfig(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		phoneNumberID, namespace, tokenSet, enabled := metaWabaConfigFromSettings(db)
		c.JSON(http.StatusOK, gin.H{
			"phoneNumberId": phoneNumberID,
			"namespace":     namespace,
			"tokenSet":      tokenSet,
			"enabled":       enabled,
			"configured":    phoneNumberID != "" && tokenSet,
		})
	}
}

// sendTemplate: kirim pesan memakai template yang SUDAH DISETUJUI.
// Variabel diisi dari body; yang belum diisi ditolak (400) beserta daftarnya.
// Pengiriman memakai device WA yang terhubung — transport yang sama dengan
// /messages/send (kuota + riwayat pesan ikut tercatat).
func sendTemplate(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		tpl, err := loadTemplateForUser(udb, userID, id)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Template tidak ditemukan"})
			return
		}
		if tpl.Status != templateStatusApproved {
			c.JSON(http.StatusForbidden, gin.H{
				"message": "Template belum disetujui — hanya template berstatus disetujui yang bisa dikirim",
				"code":    "TEMPLATE_NOT_APPROVED",
			})
			return
		}
		var req struct {
			DeviceID       uint              `json:"deviceId" binding:"required"`
			To             string            `json:"to" binding:"required"`
			Variables      map[string]string `json:"variables"`
			IdempotencyKey string            `json:"idempotencyKey"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		to := strings.TrimSpace(req.To)
		if to == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Nomor tujuan wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}
		var device models.Device
		if err := udb.Where("id = ? AND user_id = ?", req.DeviceID, userID).First(&device).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		declared := parseTemplateStringSlice(tpl.Variables)
		if len(declared) == 0 {
			declared = extractTemplateVariables(tpl.Content)
		}
		vars := req.Variables
		if vars == nil {
			vars = map[string]string{}
		}
		content, missing := renderMessageTemplate(tpl.Content, vars, declared)
		if len(missing) > 0 {
			c.JSON(http.StatusBadRequest, gin.H{
				"message": fmt.Sprintf("Variabel belum diisi: %s", strings.Join(missing, ", ")),
				"code":    "MISSING_VARIABLES",
				"missing": missing,
			})
			return
		}
		if len(content) > 10000 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Hasil render template melebihi 10000 karakter", "code": "VALIDATION_ERROR"})
			return
		}
		if !requireMessageQuota(c, udb, userID, 1) {
			return
		}
		if req.IdempotencyKey != "" {
			var existing models.Message
			if err := udb.Where("user_id = ? AND device_id = ? AND idempotency_key = ?",
				userID, req.DeviceID, req.IdempotencyKey).First(&existing).Error; err == nil {
				c.JSON(http.StatusOK, gin.H{"message": "Pesan sudah pernah dikirim (duplikat)", "duplicate": true, "data": existing})
				return
			}
		}
		msg := models.Message{
			UserID: userID, DeviceID: req.DeviceID, To: to, Type: "text",
			Content: content, Status: "pending", Via: "template",
			IdempotencyKey: req.IdempotencyKey,
		}
		if err := udb.Create(&msg).Error; err != nil {
			if req.IdempotencyKey != "" && strings.Contains(err.Error(), "duplicate key") {
				var existing models.Message
				if err2 := udb.Where("user_id = ? AND device_id = ? AND idempotency_key = ?",
					userID, req.DeviceID, req.IdempotencyKey).First(&existing).Error; err2 == nil {
					c.JSON(http.StatusOK, gin.H{"message": "Pesan sudah pernah dikirim (duplikat)", "duplicate": true, "data": existing})
					return
				}
			}
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan pesan", "code": "DB_ERROR"})
			return
		}
		campaignID := "template-" + strconv.FormatUint(uint64(tpl.ID), 10) + "-" + time.Now().Format("20060102150405")
		go func() {
			waID, err := wm.SendMessageWithOptions(req.DeviceID, to, whatsapp.SendOptions{
				Type: "text", Content: content,
			})
			if err != nil {
				udb.Model(&msg).Updates(map[string]interface{}{"status": "failed", "error_msg": err.Error()})
				recordReport(udb, userID, req.DeviceID, campaignID, to, "", "failed", err.Error())
			} else {
				now := time.Now()
				udb.Model(&msg).Updates(map[string]interface{}{"status": "sent", "message_id": waID, "sent_at": &now})
				recordReport(udb, userID, req.DeviceID, campaignID, to, waID, "sent", "")
			}
		}()
		c.JSON(http.StatusOK, gin.H{"message": "Pesan template sedang dikirim", "data": msg, "rendered": content})
	}
}
