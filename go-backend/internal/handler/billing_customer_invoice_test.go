package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Tagihan pelanggan (Item 3): buat/kirim invoice dengan klien Clipku Pay
// di-mock, webhook menandai lunas, dan fail-closed tanpa key.

// fakeClipkuClient adalah klien Clipku Pay palsu untuk test: tidak pernah
// memanggil API sungguhan.
type fakeClipkuClient struct {
	createResult *clipkuTxData
	createErr    error
	getResult    *clipkuTxData
	getErr       error

	lastCreateOrderID string
	lastCreateAmount  int64
	createCalls       int
	getCalls          int
}

func (f *fakeClipkuClient) enabled() bool { return true }
func (f *fakeClipkuClient) mode() string   { return "fake" }
func (f *fakeClipkuClient) createTransaction(orderID string, amount int64, customerName, customerEmail string) (*clipkuTxData, error) {
	f.createCalls++
	f.lastCreateOrderID = orderID
	f.lastCreateAmount = amount
	if f.createErr != nil {
		return nil, f.createErr
	}
	if f.createResult != nil {
		return f.createResult, nil
	}
	return &clipkuTxData{OrderID: orderID, Amount: amount, Status: "pending",
		PaymentURL: "https://pay.test/" + orderID, QrURL: "https://qr.test/" + orderID}, nil
}
func (f *fakeClipkuClient) getTransaction(orderID string) (*clipkuTxData, error) {
	f.getCalls++
	if f.getErr != nil {
		return nil, f.getErr
	}
	return f.getResult, nil
}

// fakeWASender mencatat pesan WA yang "dikirim" (tidak pernah ke WhatsApp).
type fakeWASender struct {
	calls []fakeWACall
	err   error
}

type fakeWACall struct {
	deviceID uint
	to       string
	msgType  string
	content  string
}

func (f *fakeWASender) SendMessageNoQuota(deviceID uint, to, msgType, content, mediaURL string) error {
	f.calls = append(f.calls, fakeWACall{deviceID: deviceID, to: to, msgType: msgType, content: content})
	return f.err
}

// FireEvent no-op: waSender (Item 8) menuntut method ini; jalur invoice
// tidak pernah memicu webhook outbound, jadi test mengabaikannya.
func (f *fakeWASender) FireEvent(userID, deviceID uint, event string, payload map[string]interface{}) {
}

func seedInvUser(t *testing.T, db *gorm.DB, uid uint) {
	t.Helper()
	// Bersihkan sisa run sebelumnya untuk uid ini (DB test dipakai ulang).
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.CustomerInvoice{})
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.Device{})
	db.Unscoped().Where("user_id = ?", uid).Delete(&models.Contact{})
	db.Where("id = ?", uid).FirstOrCreate(&models.User{
		ID: uid, UUID: fmt.Sprintf("00000000-0000-0000-0000-%012d", uid),
		Name: "Pemilik Tagihan", Email: fmt.Sprintf("tagihan-%d@test.local", uid), Password: "x",
	})
}

func seedInvDevice(t *testing.T, db *gorm.DB, uid uint) models.Device {
	t.Helper()
	dev := models.Device{UserID: uid, Name: "Device Tagihan", Status: "connected", IsDefault: true}
	if err := db.Create(&dev).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}
	return dev
}

func seedInvContact(t *testing.T, db *gorm.DB, uid uint) models.Contact {
	t.Helper()
	ct := models.Contact{UserID: uid, Name: "Budi Pelanggan", Phone: "6281234567890", Email: "budi@test.local"}
	if err := db.Create(&ct).Error; err != nil {
		t.Fatalf("seed contact: %v", err)
	}
	return ct
}

func seedInvInvoice(t *testing.T, db *gorm.DB, uid uint, status string, due *time.Time) models.CustomerInvoice {
	t.Helper()
	inv := models.CustomerInvoice{
		UserID: uid, CustomerName: "Budi Pelanggan", CustomerPhone: "6281234567890",
		Items: encodeInvoiceItems([]models.CustomerInvoiceItem{{Description: "Jasa A", Qty: 2, Price: 25000}}),
		Amount: 50000, Status: status, ExternalID: newCustomerInvoiceOrderID(uid),
		PaymentURL: "https://pay.test/seed", QrURL: "https://qr.test/seed",
		DueDate: due,
	}
	if err := db.Create(&inv).Error; err != nil {
		t.Fatalf("seed invoice: %v", err)
	}
	return inv
}

// callInvoiceHandler memanggil handler dengan userID di context + body JSON.
func callInvoiceHandler(t *testing.T, h gin.HandlerFunc, uid uint, method, path string, body any, params gin.Params) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	var rdr *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	} else {
		rdr = bytes.NewReader(nil)
	}
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("userID", uid)
	c.Params = params
	c.Request = httptest.NewRequest(method, path, rdr)
	c.Request.Header.Set("Content-Type", "application/json")
	h(c)
	return w
}

func decodeInvoiceResp(t *testing.T, w *httptest.ResponseRecorder) map[string]any {
	t.Helper()
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("respons bukan JSON: %v (body: %s)", err, w.Body.String())
	}
	return out
}

func TestCustomerInvoiceNumberFormat(t *testing.T) {
	when := time.Date(2026, 11, 5, 10, 0, 0, 0, time.UTC)
	if got := customerInvoiceNumber(123, when); got != "INV-C/2026/XI/000123" {
		t.Errorf("dapat %q, mau INV-C/2026/XI/000123", got)
	}
	if customerInvoiceNumber(1, when) == customerInvoiceNumber(2, when) {
		t.Error("ID berbeda menghasilkan nomor yang sama")
	}
}

func TestInvoiceItemsTotalAndValidation(t *testing.T) {
	items := []models.CustomerInvoiceItem{
		{Description: "A", Qty: 2, Price: 25000},
		{Description: "B", Qty: 1, Price: 10000},
	}
	if got := invoiceItemsTotal(items); got != 60000 {
		t.Errorf("total = %d, mau 60000", got)
	}
	if msg := validateInvoiceItems(items); msg != "" {
		t.Errorf("item valid ditolak: %s", msg)
	}
	if msg := validateInvoiceItems(nil); msg == "" {
		t.Error("item kosong harus ditolak")
	}
	if msg := validateInvoiceItems([]models.CustomerInvoiceItem{{Description: "", Qty: 1, Price: 100}}); msg == "" {
		t.Error("deskripsi kosong harus ditolak")
	}
	if msg := validateInvoiceItems([]models.CustomerInvoiceItem{{Description: "A", Qty: 0, Price: 100}}); msg == "" {
		t.Error("qty 0 harus ditolak")
	}
	if msg := validateInvoiceItems([]models.CustomerInvoiceItem{{Description: "A", Qty: 1, Price: 0}}); msg == "" {
		t.Error("harga 0 harus ditolak")
	}
}

func TestBuildInvoiceWAMessage(t *testing.T) {
	inv := &models.CustomerInvoice{
		ID: 7, CustomerName: "Budi", CustomerPhone: "6281234567890",
		Items:      encodeInvoiceItems([]models.CustomerInvoiceItem{{Description: "Jasa A", Qty: 2, Price: 25000}}),
		Amount:     50000,
		PaymentURL: "https://pay.test/x",
		CreatedAt:  time.Date(2026, 11, 5, 10, 0, 0, 0, time.UTC),
	}
	due := time.Date(2026, 11, 12, 0, 0, 0, 0, time.UTC)
	inv.DueDate = &due
	msg := buildInvoiceWAMessage(inv)
	for _, want := range []string{"Budi", "Jasa A", "Rp50.000", "https://pay.test/x", "INV-C/2026/XI/000007", "12 Nov 2026"} {
		if !strings.Contains(msg, want) {
			t.Errorf("pesan WA tidak memuat %q:\n%s", want, msg)
		}
	}
}

func TestCreateCustomerInvoiceWithMockClient(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Contact{}, &models.CustomerInvoice{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(94001)
	seedInvUser(t, db, uid)
	ct := seedInvContact(t, db, uid)

	fake := &fakeClipkuClient{}
	orig := newClipkuPayClient
	newClipkuPayClient = func(cfg *config.Config, db *gorm.DB) clipkuPayClient { return fake }
	defer func() { newClipkuPayClient = orig }()

	cfg := &config.Config{}
	body := map[string]any{
		"contactId": ct.ID,
		"items": []map[string]any{
			{"description": "Jasa A", "qty": 2, "price": 25000},
			{"description": "Jasa B", "qty": 1, "price": 10000},
		},
		"dueDate": "2026-11-20",
		"notes":   "Terima kasih",
	}
	w := callInvoiceHandler(t, createCustomerInvoice(cfg, db), uid, http.MethodPost, "/api/billing/invoices", body, nil)
	if w.Code != http.StatusCreated {
		t.Fatalf("status %d, mau 201 (body: %s)", w.Code, w.Body.String())
	}
	out := decodeInvoiceResp(t, w)
	invMap, _ := out["invoice"].(map[string]any)
	if invMap == nil {
		t.Fatalf("respons tanpa invoice: %s", w.Body.String())
	}
	if invMap["amount"] != float64(60000) {
		t.Errorf("amount = %v, mau 60000", invMap["amount"])
	}
	if invMap["status"] != "pending" {
		t.Errorf("status = %v, mau pending", invMap["status"])
	}
	if invMap["paymentUrl"] == "" || invMap["qrUrl"] == "" {
		t.Errorf("paymentUrl/qrUrl kosong: %v", invMap)
	}
	if !strings.HasPrefix(fake.lastCreateOrderID, "WAG-INV-94001-") {
		t.Errorf("order ID = %q, mau berprefix WAG-INV-94001-", fake.lastCreateOrderID)
	}
	if fake.lastCreateAmount != 60000 {
		t.Errorf("nominal ke Clipku Pay = %d, mau 60000 (harus sama persis dengan total tagihan)", fake.lastCreateAmount)
	}
	// Baris tersimpan di DB dengan nomor invoice deterministik.
	var saved models.CustomerInvoice
	if err := db.Where("external_id = ?", fake.lastCreateOrderID).First(&saved).Error; err != nil {
		t.Fatalf("invoice tidak tersimpan: %v", err)
	}
	if saved.CustomerName != "Budi Pelanggan" || saved.CustomerPhone != "6281234567890" {
		t.Errorf("identitas pelanggan dari kontak salah: %+v", saved)
	}
}

func TestCreateCustomerInvoiceValidation(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.CustomerInvoice{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(94002)
	seedInvUser(t, db, uid)
	fake := &fakeClipkuClient{}
	orig := newClipkuPayClient
	newClipkuPayClient = func(cfg *config.Config, db *gorm.DB) clipkuPayClient { return fake }
	defer func() { newClipkuPayClient = orig }()

	cfg := &config.Config{}
	// Tanpa item -> 400, gateway tidak dipanggil.
	w := callInvoiceHandler(t, createCustomerInvoice(cfg, db), uid, http.MethodPost, "/api/billing/invoices",
		map[string]any{"customerName": "X", "customerPhone": "6281", "items": []any{}}, nil)
	if w.Code != http.StatusBadRequest {
		t.Errorf("tanpa item: status %d, mau 400", w.Code)
	}
	if fake.createCalls != 0 {
		t.Errorf("gateway dipanggil %d kali untuk request tidak valid", fake.createCalls)
	}
	// Tanpa nama pelanggan -> 400.
	w = callInvoiceHandler(t, createCustomerInvoice(cfg, db), uid, http.MethodPost, "/api/billing/invoices",
		map[string]any{"items": []map[string]any{{"description": "A", "qty": 1, "price": 1000}}}, nil)
	if w.Code != http.StatusBadRequest {
		t.Errorf("tanpa pelanggan: status %d, mau 400", w.Code)
	}
}

func TestCreateCustomerInvoiceFailClosedNoKey(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Setting{}, &models.CustomerInvoice{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(94003)
	seedInvUser(t, db, uid)
	// Pastikan tidak ada key: hapus setting + kosongkan env + arahkan CLI
	// ke path yang tidak ada, lalu pakai klien ASLI (bukan fake).
	db.Unscoped().Where("key = ?", settingClipkuAPIKey).Delete(&models.Setting{})
	invalidateSettingCache(settingClipkuAPIKey)
	defer func() {
		db.Unscoped().Where("key = ?", settingClipkuAPIKey).Delete(&models.Setting{})
		invalidateSettingCache(settingClipkuAPIKey)
	}()
	t.Setenv("CLIPKUPAY_API_KEY", "")
	t.Setenv("CLIPKUPAY_CLI", "/tmp/tidak-ada-clipkupay-cli")
	orig := newClipkuPayClient
	newClipkuPayClient = func(cfg *config.Config, db *gorm.DB) clipkuPayClient { return newClipkuPay(cfg, db) }
	defer func() { newClipkuPayClient = orig }()

	cfg := &config.Config{}
	body := map[string]any{
		"customerName": "Budi", "customerPhone": "6281234567890",
		"items": []map[string]any{{"description": "Jasa A", "qty": 1, "price": 50000}},
	}
	w := callInvoiceHandler(t, createCustomerInvoice(cfg, db), uid, http.MethodPost, "/api/billing/invoices", body, nil)
	if w.Code != http.StatusServiceUnavailable {
		t.Fatalf("tanpa key: status %d, mau 503 (body: %s)", w.Code, w.Body.String())
	}
	out := decodeInvoiceResp(t, w)
	if out["code"] != "CLIPKUPAY_NOT_CONFIGURED" {
		t.Errorf("code = %v, mau CLIPKUPAY_NOT_CONFIGURED", out["code"])
	}
	if msg, _ := out["message"].(string); !strings.Contains(msg, "belum dikonfigurasi") {
		t.Errorf("pesan tidak menjelaskan key belum dikonfigurasi: %q", msg)
	}
	// Tidak ada invoice yang tersimpan (fail-closed, bukan pura-pura sukses).
	var n int64
	db.Model(&models.CustomerInvoice{}).Where("user_id = ?", uid).Count(&n)
	if n != 0 {
		t.Errorf("invoice tersimpan = %d, mau 0", n)
	}
}

func TestSendCustomerInvoice(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Device{}, &models.CustomerInvoice{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(94004)
	seedInvUser(t, db, uid)
	dev := seedInvDevice(t, db, uid)
	due := time.Now().Add(7 * 24 * time.Hour)
	inv := seedInvInvoice(t, db, uid, "pending", &due)

	fakeWM := &fakeWASender{}
	cfg := &config.Config{}
	params := gin.Params{gin.Param{Key: "id", Value: fmt.Sprint(inv.ID)}}
	w := callInvoiceHandler(t, sendCustomerInvoice(cfg, db, fakeWM), uid, http.MethodPost, "/api/billing/invoices/"+fmt.Sprint(inv.ID)+"/send", nil, params)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d, mau 200 (body: %s)", w.Code, w.Body.String())
	}
	if len(fakeWM.calls) != 1 {
		t.Fatalf("pesan WA terkirim = %d, mau 1", len(fakeWM.calls))
	}
	call := fakeWM.calls[0]
	if call.deviceID != dev.ID {
		t.Errorf("device = %d, mau %d", call.deviceID, dev.ID)
	}
	if call.to != "6281234567890" {
		t.Errorf("tujuan = %q, mau nomor pelanggan", call.to)
	}
	for _, want := range []string{"Rp50.000", "https://pay.test/seed", "Jasa A"} {
		if !strings.Contains(call.content, want) {
			t.Errorf("pesan WA tidak memuat %q:\n%s", want, call.content)
		}
	}
	var saved models.CustomerInvoice
	db.First(&saved, inv.ID)
	if saved.SentAt == nil {
		t.Error("sentAt tidak terisi setelah kirim")
	}
	// Kirim ulang tagihan yang sudah lunas -> 409, tanpa pesan baru.
	db.Model(&saved).Update("status", "paid")
	w = callInvoiceHandler(t, sendCustomerInvoice(cfg, db, fakeWM), uid, http.MethodPost, "/api/billing/invoices/"+fmt.Sprint(inv.ID)+"/send", nil, params)
	if w.Code != http.StatusConflict {
		t.Errorf("kirim tagihan lunas: status %d, mau 409", w.Code)
	}
	if len(fakeWM.calls) != 1 {
		t.Errorf("pesan WA setelah 409 = %d, mau tetap 1", len(fakeWM.calls))
	}
}

func TestSendCustomerInvoiceNoDevice(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Device{}, &models.CustomerInvoice{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(94005)
	seedInvUser(t, db, uid)
	// Tanpa device connected.
	due := time.Now().Add(7 * 24 * time.Hour)
	inv := seedInvInvoice(t, db, uid, "pending", &due)
	fakeWM := &fakeWASender{}
	cfg := &config.Config{}
	params := gin.Params{gin.Param{Key: "id", Value: fmt.Sprint(inv.ID)}}
	w := callInvoiceHandler(t, sendCustomerInvoice(cfg, db, fakeWM), uid, http.MethodPost, "/api/billing/invoices/"+fmt.Sprint(inv.ID)+"/send", nil, params)
	if w.Code != http.StatusConflict {
		t.Errorf("tanpa device: status %d, mau 409", w.Code)
	}
	if len(fakeWM.calls) != 0 {
		t.Errorf("pesan WA terkirim = %d, mau 0", len(fakeWM.calls))
	}
}

func TestCancelCustomerInvoice(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.CustomerInvoice{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(94006)
	seedInvUser(t, db, uid)
	due := time.Now().Add(7 * 24 * time.Hour)
	inv := seedInvInvoice(t, db, uid, "pending", &due)
	params := gin.Params{gin.Param{Key: "id", Value: fmt.Sprint(inv.ID)}}
	w := callInvoiceHandler(t, cancelCustomerInvoice(db), uid, http.MethodPost, "/api/billing/invoices/"+fmt.Sprint(inv.ID)+"/cancel", nil, params)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d, mau 200 (body: %s)", w.Code, w.Body.String())
	}
	var saved models.CustomerInvoice
	db.First(&saved, inv.ID)
	if saved.Status != "cancelled" {
		t.Errorf("status = %q, mau cancelled", saved.Status)
	}
	// Batalkan lagi -> 409.
	w = callInvoiceHandler(t, cancelCustomerInvoice(db), uid, http.MethodPost, "/api/billing/invoices/"+fmt.Sprint(inv.ID)+"/cancel", nil, params)
	if w.Code != http.StatusConflict {
		t.Errorf("batal kedua: status %d, mau 409", w.Code)
	}
}

func TestExpireOverdueCustomerInvoices(t *testing.T) {
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.CustomerInvoice{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(94007)
	seedInvUser(t, db, uid)
	past := time.Now().Add(-time.Hour)
	future := time.Now().Add(7 * 24 * time.Hour)
	overdue := seedInvInvoice(t, db, uid, "pending", &past)
	okInv := seedInvInvoice(t, db, uid, "pending", &future)
	paidInv := seedInvInvoice(t, db, uid, "paid", &past)

	n, err := expireOverdueCustomerInvoices(db, time.Now())
	if err != nil {
		t.Fatalf("expire: %v", err)
	}
	if n != 1 {
		t.Errorf("expired = %d, mau 1", n)
	}
	// Struct baru tiap baca: First(&got, id) dengan got yang masih berisi
	// ID lama menambah kondisi id ganda.
	var got models.CustomerInvoice
	db.First(&got, overdue.ID)
	if got.Status != "expired" {
		t.Errorf("invoice lewat jatuh tempo = %q, mau expired", got.Status)
	}
	got = models.CustomerInvoice{}
	db.First(&got, okInv.ID)
	if got.Status != "pending" {
		t.Errorf("invoice belum jatuh tempo = %q, mau tetap pending", got.Status)
	}
	got = models.CustomerInvoice{}
	db.First(&got, paidInv.ID)
	if got.Status != "paid" {
		t.Errorf("invoice lunas = %q, mau tetap paid", got.Status)
	}
	// Idempoten.
	n, _ = expireOverdueCustomerInvoices(db, time.Now())
	if n != 0 {
		t.Errorf("expire kedua = %d, mau 0", n)
	}
}

func TestListCustomerInvoicesFilter(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.CustomerInvoice{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(94008)
	seedInvUser(t, db, uid)
	due := time.Now().Add(7 * 24 * time.Hour)
	seedInvInvoice(t, db, uid, "pending", &due)
	seedInvInvoice(t, db, uid, "paid", &due)

	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("userID", uid)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/billing/invoices?status=paid", nil)
	listCustomerInvoices(db)(c)
	if w.Code != http.StatusOK {
		t.Fatalf("status %d, mau 200", w.Code)
	}
	var out struct {
		Invoices []models.CustomerInvoice `json:"invoices"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("respons bukan JSON: %v", err)
	}
	if len(out.Invoices) != 1 || out.Invoices[0].Status != "paid" {
		t.Errorf("filter paid menghasilkan %d invoice, mau 1 paid", len(out.Invoices))
	}
	if out.Invoices[0].InvoiceNumber == "" || len(out.Invoices[0].ItemsList) == 0 {
		t.Errorf("field turunan kosong: %+v", out.Invoices[0])
	}
}

// TestCustomerInvoiceWebhookMarksPaid: webhook paid + verifikasi ulang
// (mock) nominal penuh -> invoice lunas + notifikasi WA ke pelanggan.
func TestCustomerInvoiceWebhookMarksPaid(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Device{}, &models.Setting{},
		&models.PaymentWebhookLog{}, &models.Transaction{}, &models.CustomerInvoice{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(94009)
	seedInvUser(t, db, uid)
	seedInvDevice(t, db, uid)
	due := time.Now().Add(7 * 24 * time.Hour)
	inv := seedInvInvoice(t, db, uid, "pending", &due)

	// Tanpa API key: gate signature dilewati (mode CLI), keamanan dijaga
	// verifikasi ulang via fake client.
	db.Unscoped().Where("key = ?", settingClipkuAPIKey).Delete(&models.Setting{})
	invalidateSettingCache(settingClipkuAPIKey)
	fake := &fakeClipkuClient{getResult: &clipkuTxData{Status: "paid", Amount: 50000}}
	orig := newClipkuPayClient
	newClipkuPayClient = func(cfg *config.Config, db *gorm.DB) clipkuPayClient { return fake }
	defer func() { newClipkuPayClient = orig }()

	fakeWM := &fakeWASender{}
	cfg := &config.Config{}
	payload := []byte(fmt.Sprintf(`{"order_id":%q,"transaction_status":"paid"}`, inv.ExternalID))
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/billing/clipkupay/webhook", bytes.NewReader(payload))
	c.Request.Header.Set("Content-Type", "application/json")
	clipkuPayWebhook(cfg, db, fakeWM)(c)
	if w.Code != http.StatusOK {
		t.Fatalf("webhook: status %d, mau 200 (body: %s)", w.Code, w.Body.String())
	}
	var saved models.CustomerInvoice
	db.First(&saved, inv.ID)
	if saved.Status != "paid" {
		t.Errorf("status invoice = %q, mau paid", saved.Status)
	}
	if saved.PaidAt == nil {
		t.Error("paidAt tidak terisi")
	}
	var log models.PaymentWebhookLog
	db.Where("provider = ?", "clipkupay").Order("id DESC").First(&log)
	if log.Status != "activated" {
		t.Errorf("status log webhook = %q, mau activated", log.Status)
	}
	if len(fakeWM.calls) != 1 {
		t.Fatalf("notifikasi WA ke pelanggan = %d, mau 1", len(fakeWM.calls))
	}
	if fakeWM.calls[0].to != "6281234567890" || !strings.Contains(fakeWM.calls[0].content, "Rp50.000") {
		t.Errorf("notifikasi WA salah: %+v", fakeWM.calls[0])
	}
	// Webhook diulang (idempoten): tetap paid, tanpa notifikasi kedua.
	w2 := httptest.NewRecorder()
	c2, _ := gin.CreateTestContext(w2)
	c2.Request = httptest.NewRequest(http.MethodPost, "/api/billing/clipkupay/webhook", bytes.NewReader(payload))
	c2.Request.Header.Set("Content-Type", "application/json")
	clipkuPayWebhook(cfg, db, fakeWM)(c2)
	if w2.Code != http.StatusOK {
		t.Errorf("webhook ulang: status %d, mau 200", w2.Code)
	}
	if len(fakeWM.calls) != 1 {
		t.Errorf("notifikasi WA setelah webhook ulang = %d, mau tetap 1", len(fakeWM.calls))
	}
}

// TestCustomerInvoiceWebhookAmountMismatch: webhook klaim paid tapi nominal
// remote kurang dari tagihan (mode ketat) -> invoice tetap pending.
func TestCustomerInvoiceWebhookAmountMismatch(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Setting{},
		&models.PaymentWebhookLog{}, &models.Transaction{}, &models.CustomerInvoice{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(94010)
	seedInvUser(t, db, uid)
	due := time.Now().Add(7 * 24 * time.Hour)
	inv := seedInvInvoice(t, db, uid, "pending", &due)

	db.Unscoped().Where("key = ?", settingClipkuAPIKey).Delete(&models.Setting{})
	invalidateSettingCache(settingClipkuAPIKey)
	fake := &fakeClipkuClient{getResult: &clipkuTxData{Status: "paid", Amount: 1000}}
	orig := newClipkuPayClient
	newClipkuPayClient = func(cfg *config.Config, db *gorm.DB) clipkuPayClient { return fake }
	defer func() { newClipkuPayClient = orig }()

	fakeWM := &fakeWASender{}
	cfg := &config.Config{}
	payload := []byte(fmt.Sprintf(`{"order_id":%q,"transaction_status":"paid"}`, inv.ExternalID))
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/billing/clipkupay/webhook", bytes.NewReader(payload))
	c.Request.Header.Set("Content-Type", "application/json")
	clipkuPayWebhook(cfg, db, fakeWM)(c)
	if w.Code != http.StatusOK {
		t.Fatalf("webhook: status %d, mau 200", w.Code)
	}
	var saved models.CustomerInvoice
	db.First(&saved, inv.ID)
	if saved.Status != "pending" {
		t.Errorf("nominal kurang: status = %q, mau tetap pending", saved.Status)
	}
	var log models.PaymentWebhookLog
	db.Where("provider = ?", "clipkupay").Order("id DESC").First(&log)
	if log.Status != "status_mismatch" {
		t.Errorf("status log = %q, mau status_mismatch", log.Status)
	}
	if len(fakeWM.calls) != 0 {
		t.Errorf("notifikasi WA terkirim = %d, mau 0", len(fakeWM.calls))
	}
}

// TestCustomerInvoiceWebhookExpiredSync: webhook expired + remote expired
// -> invoice disinkronkan ke expired.
func TestCustomerInvoiceWebhookExpiredSync(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Setting{},
		&models.PaymentWebhookLog{}, &models.Transaction{}, &models.CustomerInvoice{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(94011)
	seedInvUser(t, db, uid)
	due := time.Now().Add(7 * 24 * time.Hour)
	inv := seedInvInvoice(t, db, uid, "pending", &due)

	db.Unscoped().Where("key = ?", settingClipkuAPIKey).Delete(&models.Setting{})
	invalidateSettingCache(settingClipkuAPIKey)
	fake := &fakeClipkuClient{getResult: &clipkuTxData{Status: "expired", Amount: 50000}}
	orig := newClipkuPayClient
	newClipkuPayClient = func(cfg *config.Config, db *gorm.DB) clipkuPayClient { return fake }
	defer func() { newClipkuPayClient = orig }()

	cfg := &config.Config{}
	payload := []byte(fmt.Sprintf(`{"order_id":%q,"transaction_status":"expired"}`, inv.ExternalID))
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/billing/clipkupay/webhook", bytes.NewReader(payload))
	c.Request.Header.Set("Content-Type", "application/json")
	clipkuPayWebhook(cfg, db, &fakeWASender{})(c)
	if w.Code != http.StatusOK {
		t.Fatalf("webhook: status %d, mau 200", w.Code)
	}
	var saved models.CustomerInvoice
	db.First(&saved, inv.ID)
	if saved.Status != "expired" {
		t.Errorf("status = %q, mau expired", saved.Status)
	}
}
