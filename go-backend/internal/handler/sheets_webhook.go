package handler

// ─────────────────────────────────────────────────────────────────────────
// Item 8: Google Sheets + webhook dua arah.
//
// Fondasi yang sudah ada (diaudit dulu, dipakai ulang — bukan dibangun ulang):
//   - Outbound webhook: models.Webhook + whatsapp.Manager.fireWebhooks
//     (HMAC X-Wagataway-Signature, log webhook_deliveries, retry).
//     Event yang sudah dipicu: message.received/sent/failed; event baru
//     subscription.activated dipicu dari billing (lihat billing_notify.go);
//     order.created terdaftar sebagai event yang bisa diikuti dan akan
//     dipicu begitu pembuatan order (saat ini route-nya masih stub) hidup.
//   - Inbound: Integration Hub (token di URL + template {{path}}).
//   - Kredensial: pola AIConnection — AES-256-GCM (security.Encrypt),
//     nilai penuh tidak pernah diserialisasi, hanya hint.
// Yang baru di file ini:
//   - Google Sheets: koneksi service account (terenkripsi) + ekspor/impor
//     kontak & ekspor order + riwayat sinkronisasi.
//   - Inbound webhook: endpoint POST /api/inbound-webhooks/:id/hook yang
//     diverifikasi HMAC-SHA256 (atau header X-Webhook-Secret) lalu memetakan
//     payload ke aksi kirim pesan WA (field "to" + "message"/template).
//   - Uji kirim webhook keluar: POST /webhooks/:id/test.
// ─────────────────────────────────────────────────────────────────────────

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/quota"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/security"
	"github.com/Aldi1963/wagataway/internal/service"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// SupportedWebhookEvents adalah daftar event yang bisa diikuti webhook
// keluar (dipakai UI + validasi). message.* sudah dipicu Manager;
// subscription.activated dipicu dari billing; order.created dipicu begitu
// pembuatan order hidup (saat ini route order masih stub).
var SupportedWebhookEvents = []string{
	"message.received",
	"message.sent",
	"message.failed",
	"order.created",
	"subscription.activated",
	"webhook.test",
}

func isSupportedWebhookEvent(e string) bool {
	for _, s := range SupportedWebhookEvents {
		if s == e {
			return true
		}
	}
	return false
}

// normalizeEvents menerima events sebagai string JSON, array JSON, atau
// string event tunggal, dan mengembalikan string JSON array (atau "" bila
// kosong = semua event). Event tak dikenal ditolak.
func normalizeEvents(raw json.RawMessage) (string, error) {
	s := strings.TrimSpace(string(raw))
	if s == "" || s == "null" {
		return "", nil
	}
	var arr []string
	if strings.HasPrefix(s, "[") {
		if err := json.Unmarshal(raw, &arr); err != nil {
			return "", fmt.Errorf("events harus array string")
		}
	} else {
		var one string
		if err := json.Unmarshal(raw, &one); err != nil {
			return "", fmt.Errorf("events harus string atau array string")
		}
		if one != "" {
			arr = []string{one}
		}
	}
	for _, e := range arr {
		if !isSupportedWebhookEvent(e) {
			return "", fmt.Errorf("event tidak dikenal: %s", e)
		}
	}
	if len(arr) == 0 {
		return "", nil
	}
	b, _ := json.Marshal(arr)
	return string(b), nil
}

func registerSheetsWebhookRoutes(rg *gin.RouterGroup, db *gorm.DB, wm *whatsapp.Manager) {
	sh := rg.Group("/sheets")
	{
		sh.GET("/connection", getSheetsConnection(db))
		sh.PUT("/connection", upsertSheetsConnection(db))
		sh.DELETE("/connection", deleteSheetsConnection(db))
		sh.POST("/test", testSheetsConnection(db))
		sh.POST("/sync", runSheetsSync(db))
		sh.GET("/syncs", listSheetsSyncs(db))
	}
	ib := rg.Group("/inbound-webhooks")
	{
		ib.GET("", listInboundWebhooks(db))
		ib.POST("", createInboundWebhook(db))
		ib.GET("/:id", getInboundWebhook(db))
		ib.PUT("/:id", updateInboundWebhook(db))
		ib.DELETE("/:id", deleteInboundWebhook(db))
		ib.POST("/:id/regenerate", regenerateInboundWebhookSecret(db))
		ib.GET("/:id/logs", listInboundWebhookLogs(db))
	}
}

// registerInboundWebhookRoute mendaftarkan endpoint PUBLIK (tanpa auth user)
// di grup /api: POST /api/inbound-webhooks/:id/hook
// JANGAN pindahkan ke grup protected: platform luar tidak punya sesi user.
func registerInboundWebhookRoute(rg *gin.RouterGroup, db *gorm.DB, wm *whatsapp.Manager) {
	rg.POST("/inbound-webhooks/:id/hook", inboundWebhookHook(db, wm))
}

// ── Google Sheets: koneksi ────────────────────────────────────────────────

type sheetsConnectionOut struct {
	Configured          bool   `json:"configured"`
	SpreadsheetID       string `json:"spreadsheetId,omitempty"`
	ServiceAccountEmail string `json:"serviceAccountEmail,omitempty"`
	IsActive            bool   `json:"isActive"`
}

func loadSheetsConnection(db *gorm.DB, userID uint) (*models.SheetsConnection, error) {
	var conn models.SheetsConnection
	if err := db.Where("user_id = ?", userID).First(&conn).Error; err != nil {
		return nil, err
	}
	return &conn, nil
}

func getSheetsConnection(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		conn, err := loadSheetsConnection(rls.Scoped(db, userID), userID)
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"connection": sheetsConnectionOut{Configured: false}})
			return
		}
		c.JSON(http.StatusOK, gin.H{"connection": sheetsConnectionOut{
			Configured: true, SpreadsheetID: conn.SpreadsheetID,
			ServiceAccountEmail: conn.ServiceAccountEmail, IsActive: conn.IsActive,
		}})
	}
}

func upsertSheetsConnection(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req struct {
			SpreadsheetID      string `json:"spreadsheetId"`
			ServiceAccountJSON string `json:"serviceAccountJson"`
			IsActive           *bool  `json:"isActive"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		req.SpreadsheetID = strings.TrimSpace(req.SpreadsheetID)
		if req.SpreadsheetID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "ID spreadsheet wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}
		conn, err := loadSheetsConnection(udb, userID)
		isNew := err != nil
		if isNew {
			conn = &models.SheetsConnection{UserID: userID}
		}
		// Service account JSON wajib saat pertama kali; bila sudah ada
		// koneksi, boleh dikosongkan (hanya ganti spreadsheet / status).
		if strings.TrimSpace(req.ServiceAccountJSON) != "" {
			sa, err := service.ParseServiceAccount([]byte(req.ServiceAccountJSON))
			if err != nil {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Service account tidak valid: " + err.Error(), "code": "VALIDATION_ERROR"})
				return
			}
			enc, err := security.Encrypt(strings.TrimSpace(req.ServiceAccountJSON))
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal mengenkripsi service account (AI_KEYS_SECRET/JWT_SECRET belum di-set?)", "code": "ENCRYPT_ERROR"})
				return
			}
			conn.ServiceAccountEnc = enc
			conn.ServiceAccountEmail = sa.ClientEmail
		} else if isNew {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Tempel JSON service account Google (lihat panduan di halaman)", "code": "VALIDATION_ERROR"})
			return
		}
		conn.SpreadsheetID = req.SpreadsheetID
		if req.IsActive != nil {
			conn.IsActive = *req.IsActive
		} else if isNew {
			conn.IsActive = true
		}
		if isNew {
			if err := udb.Create(conn).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan koneksi Sheets", "code": "DB_ERROR"})
				return
			}
		} else if err := udb.Save(conn).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan koneksi Sheets", "code": "DB_ERROR"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Koneksi Google Sheets disimpan", "connection": sheetsConnectionOut{
			Configured: true, SpreadsheetID: conn.SpreadsheetID,
			ServiceAccountEmail: conn.ServiceAccountEmail, IsActive: conn.IsActive,
		}})
	}
}

func deleteSheetsConnection(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		udb.Where("user_id = ?", userID).Delete(&models.SheetsConnection{})
		c.JSON(http.StatusOK, gin.H{"message": "Koneksi Google Sheets dihapus"})
	}
}

// sheetsClientForUser memuat koneksi + membangun klien Sheets. Fail-closed:
// tanpa koneksi aktif / kredensial tak bisa didekripsi -> error jelas.
func sheetsClientForUser(db *gorm.DB, userID uint) (*service.SheetsClient, *models.SheetsConnection, error) {
	conn, err := loadSheetsConnection(db, userID)
	if err != nil {
		return nil, nil, fmt.Errorf("Google Sheets belum dikonfigurasi — isi ID spreadsheet + JSON service account dulu")
	}
	if !conn.IsActive {
		return nil, nil, fmt.Errorf("koneksi Google Sheets sedang nonaktif")
	}
	raw, err := security.Decrypt(conn.ServiceAccountEnc)
	if err != nil {
		return nil, nil, fmt.Errorf("service account tersimpan tidak bisa didekripsi — simpan ulang JSON service account")
	}
	sa, err := service.ParseServiceAccount([]byte(raw))
	if err != nil {
		return nil, nil, fmt.Errorf("service account tersimpan tidak valid — simpan ulang: %w", err)
	}
	return service.NewSheetsClient(sa), conn, nil
}

func testSheetsConnection(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		client, conn, err := sheetsClientForUser(udb, userID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": err.Error(), "code": "SHEETS_NOT_CONFIGURED"})
			return
		}
		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()
		title, err := client.GetSpreadsheetTitle(ctx, conn.SpreadsheetID)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"message": "Tes koneksi gagal: " + err.Error(), "code": "SHEETS_TEST_FAILED"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Terhubung ke spreadsheet", "title": title, "serviceAccountEmail": conn.ServiceAccountEmail})
	}
}

// ── Google Sheets: sinkronisasi ────────────────────────────────────────────

const (
	sheetsMaxRows = 5000
	contactsSheet = "Kontak"
	ordersSheet   = "Order"
)

var contactsHeaderRow = []interface{}{"Nama", "Telepon", "Email", "Catatan", "Tag"}
var ordersHeaderRow = []interface{}{"ID Order", "Pembeli", "Telepon", "Produk", "Jumlah", "Total", "Status", "Dibuat"}

func listSheetsSyncs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var syncs []models.SheetsSync
		udb.Where("user_id = ?", userID).Order("id DESC").Limit(20).Find(&syncs)
		c.JSON(http.StatusOK, gin.H{"syncs": syncs})
	}
}

func runSheetsSync(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req struct {
			Kind      string `json:"kind"`
			Direction string `json:"direction"`
			SheetName string `json:"sheetName"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		req.Kind = strings.ToLower(strings.TrimSpace(req.Kind))
		req.Direction = strings.ToLower(strings.TrimSpace(req.Direction))
		if req.Kind != "contacts" && req.Kind != "orders" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "kind harus contacts atau orders", "code": "VALIDATION_ERROR"})
			return
		}
		if req.Direction != "export" && req.Direction != "import" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "direction harus export atau import", "code": "VALIDATION_ERROR"})
			return
		}
		if req.Kind == "orders" && req.Direction == "import" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Impor order belum didukung — yang tersedia: ekspor order, ekspor/impor kontak", "code": "VALIDATION_ERROR"})
			return
		}
		sheetName := strings.TrimSpace(req.SheetName)
		if sheetName == "" {
			if req.Kind == "contacts" {
				sheetName = contactsSheet
			} else {
				sheetName = ordersSheet
			}
		}
		client, conn, err := sheetsClientForUser(udb, userID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": err.Error(), "code": "SHEETS_NOT_CONFIGURED"})
			return
		}
		rec := models.SheetsSync{
			UserID: userID, Kind: req.Kind, Direction: req.Direction,
			SpreadsheetID: conn.SpreadsheetID, SheetName: sheetName, Status: "running",
		}
		udb.Create(&rec)
		ctx, cancel := context.WithTimeout(c.Request.Context(), 120*time.Second)
		defer cancel()
		var total, ok, failed int
		var runErr error
		switch {
		case req.Kind == "contacts" && req.Direction == "export":
			total, ok, failed, runErr = exportContactsToSheets(ctx, udb, client, conn.SpreadsheetID, sheetName, userID)
		case req.Kind == "contacts" && req.Direction == "import":
			total, ok, failed, runErr = importContactsFromSheets(ctx, udb, client, conn.SpreadsheetID, sheetName, userID)
		default: // orders export
			total, ok, failed, runErr = exportOrdersToSheets(ctx, udb, client, conn.SpreadsheetID, sheetName, userID)
		}
		updates := map[string]interface{}{
			"status": "success", "rows_total": total, "rows_ok": ok, "rows_failed": failed,
		}
		if runErr != nil {
			updates["status"] = "failed"
			updates["error_msg"] = runErr.Error()
		}
		udb.Model(&rec).Updates(updates)
		udb.Where("id = ?", rec.ID).First(&rec)
		if runErr != nil {
			c.JSON(http.StatusBadGateway, gin.H{"message": "Sinkronisasi gagal: " + runErr.Error(), "code": "SHEETS_SYNC_FAILED", "sync": rec})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Sinkronisasi selesai", "sync": rec})
	}
}

func exportContactsToSheets(ctx context.Context, db *gorm.DB, client *service.SheetsClient, spreadsheetID, sheetName string, userID uint) (total, ok, failed int, err error) {
	var contacts []models.Contact
	if err := db.Where("user_id = ?", userID).Order("id ASC").Limit(sheetsMaxRows).Find(&contacts).Error; err != nil {
		return 0, 0, 0, err
	}
	total = len(contacts)
	values := make([][]interface{}, 0, total+1)
	// Tulis header hanya bila sheet masih kosong (baris pertama kosong).
	first, err := client.ReadRows(ctx, spreadsheetID, sheetName+"!A1:E1")
	if err != nil {
		return total, 0, total, err
	}
	if len(first) == 0 || len(first[0]) == 0 || strings.TrimSpace(first[0][0]) == "" {
		values = append(values, contactsHeaderRow)
	}
	for _, ct := range contacts {
		values = append(values, []interface{}{ct.Name, ct.Phone, ct.Email, ct.Notes, ct.Tags})
	}
	if len(values) == 0 {
		return total, 0, 0, nil
	}
	n, err := client.AppendRows(ctx, spreadsheetID, sheetName+"!A1", values)
	if err != nil {
		return total, 0, total, err
	}
	// updatedRows menghitung header juga bila ditulis.
	ok = n
	if len(first) == 0 || len(first[0]) == 0 || strings.TrimSpace(first[0][0]) == "" {
		ok = n - 1
	}
	if ok < 0 {
		ok = 0
	}
	if ok < total {
		failed = total - ok
	}
	return total, ok, failed, nil
}

func exportOrdersToSheets(ctx context.Context, db *gorm.DB, client *service.SheetsClient, spreadsheetID, sheetName string, userID uint) (total, ok, failed int, err error) {
	var orders []models.BotOrder
	if err := db.Preload("Product").Where("user_id = ?", userID).Order("id ASC").Limit(sheetsMaxRows).Find(&orders).Error; err != nil {
		return 0, 0, 0, err
	}
	total = len(orders)
	values := make([][]interface{}, 0, total+1)
	first, err := client.ReadRows(ctx, spreadsheetID, sheetName+"!A1:H1")
	if err != nil {
		return total, 0, total, err
	}
	if len(first) == 0 || len(first[0]) == 0 || strings.TrimSpace(first[0][0]) == "" {
		values = append(values, ordersHeaderRow)
	}
	for _, o := range orders {
		product := ""
		if o.Product.ID != 0 {
			product = o.Product.Name
		}
		values = append(values, []interface{}{o.ID, o.BuyerName, o.BuyerPhone, product, o.Quantity, o.Total, o.Status, o.CreatedAt.Format("2006-01-02 15:04")})
	}
	if len(values) == 0 {
		return total, 0, 0, nil
	}
	n, err := client.AppendRows(ctx, spreadsheetID, sheetName+"!A1", values)
	if err != nil {
		return total, 0, total, err
	}
	ok = n
	if len(first) == 0 || len(first[0]) == 0 || strings.TrimSpace(first[0][0]) == "" {
		ok = n - 1
	}
	if ok < 0 {
		ok = 0
	}
	if ok < total {
		failed = total - ok
	}
	return total, ok, failed, nil
}

// headerIndex memetakan nama kolom (case-insensitive) ke indeks kolom.
func headerIndex(header []string, names ...string) int {
	for i, h := range header {
		h = strings.ToLower(strings.TrimSpace(h))
		for _, n := range names {
			if h == n {
				return i
			}
		}
	}
	return -1
}

func cell(row []string, idx int) string {
	if idx < 0 || idx >= len(row) {
		return ""
	}
	return strings.TrimSpace(row[idx])
}

func importContactsFromSheets(ctx context.Context, db *gorm.DB, client *service.SheetsClient, spreadsheetID, sheetName string, userID uint) (total, ok, failed int, err error) {
	rows, err := client.ReadRows(ctx, spreadsheetID, sheetName+"!A1:E"+strconv.Itoa(sheetsMaxRows))
	if err != nil {
		return 0, 0, 0, err
	}
	if len(rows) < 2 {
		return 0, 0, 0, fmt.Errorf("sheet %q kosong atau tanpa baris data (baris pertama harus header: Nama, Telepon, Email, Catatan, Tag)", sheetName)
	}
	nameIdx := headerIndex(rows[0], "nama", "name")
	phoneIdx := headerIndex(rows[0], "telepon", "phone", "nomor", "no hp")
	emailIdx := headerIndex(rows[0], "email")
	notesIdx := headerIndex(rows[0], "catatan", "notes")
	tagsIdx := headerIndex(rows[0], "tag", "tags")
	if phoneIdx < 0 {
		return 0, 0, 0, fmt.Errorf("header sheet harus punya kolom Telepon (tidak ditemukan di baris pertama)")
	}
	for _, row := range rows[1:] {
		total++
		phone, valid := normalizeInboxPhone(cell(row, phoneIdx))
		if !valid {
			failed++
			continue
		}
		name := cell(row, nameIdx)
		if name == "" {
			name = phone
		}
		var existing models.Contact
		err := db.Where("user_id = ? AND phone = ?", userID, phone).First(&existing).Error
		if err == nil {
			updates := map[string]interface{}{"name": name}
			if v := cell(row, emailIdx); v != "" {
				updates["email"] = v
			}
			if v := cell(row, notesIdx); v != "" {
				updates["notes"] = v
			}
			if v := cell(row, tagsIdx); v != "" {
				updates["tags"] = v
			}
			if err := db.Model(&existing).Updates(updates).Error; err != nil {
				failed++
				continue
			}
			ok++
			continue
		}
		ct := models.Contact{
			UserID: userID, Name: name, Phone: phone,
			Email: cell(row, emailIdx), Notes: cell(row, notesIdx), Tags: cell(row, tagsIdx),
		}
		if err := db.Create(&ct).Error; err != nil {
			failed++
			continue
		}
		ok++
	}
	return total, ok, failed, nil
}

// ── Inbound webhook: CRUD (butuh auth) ───────────────────────────────────────

type inboundWebhookOut struct {
	models.InboundWebhook
	SecretMasked string `json:"secretMasked"`
	DeviceName   string `json:"deviceName,omitempty"`
	HookPath     string `json:"hookPath"`
}

func maskSecretHint(hint string) string {
	if hint == "" {
		return "••••"
	}
	return "•••" + hint
}

func toInboundOut(in models.InboundWebhook, deviceName string) inboundWebhookOut {
	return inboundWebhookOut{
		InboundWebhook: in,
		SecretMasked:   maskSecretHint(in.SecretHint),
		DeviceName:     deviceName,
		HookPath:       fmt.Sprintf("/api/inbound-webhooks/%d/hook", in.ID),
	}
}

func inboundOwned(db *gorm.DB, userID, id uint) *models.InboundWebhook {
	var in models.InboundWebhook
	if err := db.Preload("Device", func(db *gorm.DB) *gorm.DB {
		return db.Select("id", "name", "status")
	}).Where("id = ? AND user_id = ?", id, userID).First(&in).Error; err != nil {
		return nil
	}
	return &in
}

func newInboundSecret() (secret, enc, hint string, err error) {
	secret, err = security.GenerateWebhookSecret()
	if err != nil {
		return "", "", "", err
	}
	enc, err = security.Encrypt(secret)
	if err != nil {
		return "", "", "", err
	}
	if len(secret) >= 4 {
		hint = secret[len(secret)-4:]
	}
	return secret, enc, hint, nil
}

func listInboundWebhooks(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var list []models.InboundWebhook
		udb.Where("user_id = ?", userID).
			Preload("Device", func(db *gorm.DB) *gorm.DB { return db.Select("id", "name", "status") }).
			Order("created_at DESC").Find(&list)
		out := make([]inboundWebhookOut, 0, len(list))
		for _, in := range list {
			out = append(out, toInboundOut(in, in.Device.Name))
		}
		c.JSON(http.StatusOK, gin.H{"inboundWebhooks": out})
	}
}

func createInboundWebhook(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req struct {
			Name     string `json:"name"`
			DeviceID uint   `json:"deviceId"`
			Template string `json:"template"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		req.Name = strings.TrimSpace(req.Name)
		if req.Name == "" || req.DeviceID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "nama dan deviceId wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}
		if !integrationDeviceOwned(udb, userID, req.DeviceID) {
			c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		secret, enc, hint, err := newInboundSecret()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat secret (AI_KEYS_SECRET/JWT_SECRET belum di-set?)", "code": "SECRET_ERROR"})
			return
		}
		in := models.InboundWebhook{
			UserID: userID, Name: req.Name, SecretEnc: enc, SecretHint: hint,
			DeviceID: req.DeviceID, Template: req.Template, IsActive: true,
		}
		if err := udb.Create(&in).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan inbound webhook", "code": "DB_ERROR"})
			return
		}
		var d models.Device
		_ = udb.Select("id", "name").Where("id = ?", in.DeviceID).First(&d).Error
		c.JSON(http.StatusCreated, gin.H{
			"message":        "Inbound webhook dibuat",
			"inboundWebhook": toInboundOut(in, d.Name),
			"fullSecret":     secret, // hanya ditampilkan penuh di momen pembuatan
			"hookPath":       fmt.Sprintf("/api/inbound-webhooks/%d/hook", in.ID),
			"secretWarning":  "Simpan secret ini — secret penuh tidak ditampilkan lagi di daftar.",
		})
	}
}

func getInboundWebhook(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "ID tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		in := inboundOwned(udb, userID, uint(id))
		if in == nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Inbound webhook tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		// Detail boleh menampilkan secret penuh ke pemilik (dipakai tombol salin).
		secret, _ := security.Decrypt(in.SecretEnc)
		c.JSON(http.StatusOK, gin.H{
			"inboundWebhook": toInboundOut(*in, in.Device.Name),
			"fullSecret":     secret,
			"hookPath":       fmt.Sprintf("/api/inbound-webhooks/%d/hook", in.ID),
		})
	}
}

func updateInboundWebhook(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "ID tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		in := inboundOwned(udb, userID, uint(id))
		if in == nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Inbound webhook tidak ditemukan", "code": "NOT_FOUND"})
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
			if *req.DeviceID == 0 || !integrationDeviceOwned(udb, userID, *req.DeviceID) {
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
			if err := udb.Model(in).Updates(updates).Error; err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan", "code": "DB_ERROR"})
				return
			}
		}
		updated := inboundOwned(udb, userID, uint(id))
		c.JSON(http.StatusOK, gin.H{"message": "Inbound webhook diperbarui", "inboundWebhook": toInboundOut(*updated, updated.Device.Name)})
	}
}

func deleteInboundWebhook(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "ID tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		in := inboundOwned(udb, userID, uint(id))
		if in == nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Inbound webhook tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		if err := udb.Delete(in).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menghapus", "code": "DB_ERROR"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Inbound webhook dihapus"})
	}
}

func regenerateInboundWebhookSecret(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "ID tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		in := inboundOwned(udb, userID, uint(id))
		if in == nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Inbound webhook tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		secret, enc, hint, err := newInboundSecret()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat secret", "code": "SECRET_ERROR"})
			return
		}
		if err := udb.Model(in).Updates(map[string]interface{}{"secret_enc": enc, "secret_hint": hint}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan secret", "code": "DB_ERROR"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message":       "Secret baru dibuat — pengirim lama yang memakai secret lama akan ditolak",
			"fullSecret":    secret,
			"hookPath":      fmt.Sprintf("/api/inbound-webhooks/%d/hook", in.ID),
			"secretWarning": "Simpan secret ini — secret penuh tidak ditampilkan lagi di daftar.",
		})
	}
}

func listInboundWebhookLogs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "ID tidak valid", "code": "VALIDATION_ERROR"})
			return
		}
		in := inboundOwned(udb, userID, uint(id))
		if in == nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Inbound webhook tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		limit := 50
		if l, err := strconv.Atoi(c.DefaultQuery("limit", "50")); err == nil && l > 0 && l <= 200 {
			limit = l
		}
		var logs []models.InboundWebhookLog
		udb.Where("inbound_webhook_id = ?", in.ID).Order("id DESC").Limit(limit).Find(&logs)
		c.JSON(http.StatusOK, gin.H{"logs": logs})
	}
}

// ── Inbound webhook: endpoint publik ────────────────────────────────────────

// verifyInboundSecret menerima bila HMAC X-Wagataway-Signature valid
// (prioritas — dipakai pengirim yang menandatangani body) ATAU header
// X-Webhook-Secret sama persis dengan secret (perbandingan constant-time;
// dipakai pengirim sederhana / pengiriman ulang dari webhook keluar kami
// yang menyertakan kedua header itu).
func verifyInboundSecret(secret string, raw []byte, c *gin.Context) bool {
	if sig := c.GetHeader("X-Wagataway-Signature"); sig != "" {
		if security.VerifyWebhookSignature(secret, raw, sig) {
			return true
		}
	}
	if h := c.GetHeader("X-Webhook-Secret"); h != "" {
		if subtle.ConstantTimeCompare([]byte(h), []byte(secret)) == 1 {
			return true
		}
	}
	return false
}

func inboundWebhookHook(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, err := strconv.ParseUint(c.Param("id"), 10, 64)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Inbound webhook tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		if !inboxTokenAllowed(fmt.Sprintf("inbound-%d", id)) {
			c.JSON(http.StatusTooManyRequests, gin.H{"success": false, "message": "Batas 60 permintaan/menit terlampaui, coba lagi nanti", "code": "RATE_LIMITED"})
			return
		}
		var in models.InboundWebhook
		if err := db.Where("id = ?", uint(id)).First(&in).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"success": false, "message": "Inbound webhook tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		if !in.IsActive {
			c.JSON(http.StatusForbidden, gin.H{"success": false, "message": "Inbound webhook ini sedang nonaktif", "code": "INBOUND_DISABLED"})
			return
		}
		secret, err := security.Decrypt(in.SecretEnc)
		if err != nil || secret == "" {
			c.JSON(http.StatusInternalServerError, gin.H{"success": false, "message": "Secret inbound webhook tidak bisa dibaca", "code": "SECRET_ERROR"})
			return
		}
		raw, err := io.ReadAll(io.LimitReader(c.Request.Body, inboxMaxBodyBytes))
		if err != nil || len(raw) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Body JSON wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}
		if !verifyInboundSecret(secret, raw, c) {
			c.JSON(http.StatusUnauthorized, gin.H{"success": false, "message": "Signature/secret webhook tidak valid", "code": "INVALID_SIGNATURE"})
			return
		}
		var payload map[string]interface{}
		if err := json.Unmarshal(raw, &payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"success": false, "message": "Body harus JSON yang valid", "code": "VALIDATION_ERROR"})
			return
		}
		logEntry := models.InboundWebhookLog{
			InboundWebhookID: in.ID,
			Status:           "failed",
			PayloadSummary:   summarizePayload(payload),
		}
		fail := func(code int, msg, codeStr, errMsg string) {
			logEntry.ErrorMsg = errMsg
			if logEntry.ErrorMsg == "" {
				logEntry.ErrorMsg = msg
			}
			_ = db.Create(&logEntry).Error
			c.JSON(code, gin.H{"success": false, "message": msg, "code": codeStr})
		}
		toRaw, _ := payload["to"].(string)
		to, ok := normalizeInboxPhone(toRaw)
		if !ok {
			fail(http.StatusBadRequest, "Field \"to\" wajib diisi dengan nomor WA yang valid (mis. 62812xxxxxxx)", "VALIDATION_ERROR", "nomor tujuan tidak valid: "+toRaw)
			return
		}
		logEntry.To = to
		var text string
		if m, ok := payload["message"].(string); ok && strings.TrimSpace(m) != "" {
			text = strings.TrimSpace(m)
		} else if strings.TrimSpace(in.Template) != "" {
			text = strings.TrimSpace(renderIntegrationTemplate(in.Template, payload))
		}
		if text == "" {
			fail(http.StatusBadRequest, "Tidak ada pesan: isi field \"message\" atau atur template di inbound webhook", "VALIDATION_ERROR", "pesan kosong (tanpa message & template)")
			return
		}
		if len([]rune(text)) > 10000 {
			fail(http.StatusBadRequest, "Pesan terlalu panjang (maks 10000 karakter)", "VALIDATION_ERROR", "pesan > 10000 karakter")
			return
		}
		var device models.Device
		if err := db.Where("id = ? AND user_id = ?", in.DeviceID, in.UserID).First(&device).Error; err != nil {
			fail(http.StatusInternalServerError, "Perangkat pengirim inbound webhook tidak tersedia", "DEVICE_UNAVAILABLE", "device tidak ditemukan")
			return
		}
		if wm.GetStatus(device.ID) != "connected" {
			fail(http.StatusServiceUnavailable, "Perangkat pengirim sedang tidak terhubung, coba lagi nanti", "DEVICE_OFFLINE", "device tidak connected")
			return
		}
		if qr, qerr := quota.Check(db, in.UserID); qerr == nil && !qr.Allowed {
			fail(http.StatusTooManyRequests, quota.ExceededMessage(qr), "QUOTA_EXCEEDED", "kuota pesan habis")
			return
		}
		msg := models.Message{
			UserID: in.UserID, DeviceID: device.ID, To: to,
			Type: "text", Content: text, Status: "pending", Via: "inbound-webhook",
		}
		if err := db.Create(&msg).Error; err != nil {
			fail(http.StatusInternalServerError, "Gagal menyimpan pesan", "DB_ERROR", err.Error())
			return
		}
		campaignID := "inbound-" + time.Now().Format("20060102150405")
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
		c.JSON(http.StatusOK, gin.H{"success": true, "message": "Pesan terkirim", "to": to, "messageId": waID})
	}
}
