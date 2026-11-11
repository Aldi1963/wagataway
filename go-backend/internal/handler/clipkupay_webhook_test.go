package handler

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"strings"
	"testing"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

// auditTestDB membuka DB test wagataway_test (pola yang sama seperti test
// RLS): DSN dari env/DATABASE_URL di .env live, path diganti ke database
// test. Skip bila tidak tersedia — tidak pernah menyentuh DB live.
func auditTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		if b, err := os.ReadFile("/home/hatch/workspace/wagataway/.env"); err == nil {
			for _, ln := range strings.Split(string(b), "\n") {
				if strings.HasPrefix(ln, "DATABASE_URL=") {
					dsn = strings.Trim(strings.TrimPrefix(ln, "DATABASE_URL="), `"'`)
				}
			}
		}
	}
	if dsn == "" {
		t.Skip("DATABASE_URL tidak tersedia — lewati test DB")
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Skipf("DATABASE_URL tidak valid: %v", err)
	}
	u.Path = "/wagataway_test"
	db, err := gorm.Open(postgres.New(postgres.Config{
		DriverName: rls.DriverName,
		DSN:        u.String(),
	}), &gorm.Config{})
	if err != nil {
		t.Skipf("postgres test tidak terjangkau: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil || sqlDB.Ping() != nil {
		t.Skip("postgres test tidak terjangkau")
	}
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)
	rls.Register(db)
	return db
}

func TestVerifyClipkuSignature(t *testing.T) {
	key := "kunci-rahasia"
	body := []byte(`{"order_id":"WAG-1-123","transaction_status":"paid"}`)
	mac := hmac.New(sha256.New, []byte(key))
	mac.Write(body)
	sig := hex.EncodeToString(mac.Sum(nil))

	if !verifyClipkuSignature(body, sig, key) {
		t.Error("signature yang benar harus lolos")
	}
	if verifyClipkuSignature(body, sig, "kunci-salah") {
		t.Error("signature dengan key salah harus ditolak")
	}
	if verifyClipkuSignature(body, "deadbeef", key) {
		t.Error("signature asal harus ditolak")
	}
	if verifyClipkuSignature(body, "", key) {
		t.Error("signature kosong harus ditolak")
	}
	if verifyClipkuSignature(body, sig, "") {
		t.Error("tanpa API key, verifikasi harus gagal (mode CLI tidak boleh pura-pura terverifikasi)")
	}
}

func TestClipkuAmountSufficient(t *testing.T) {
	cases := []struct {
		name     string
		remote   *clipkuTxData
		expected int64
		want     bool
	}{
		{"nominal sama", &clipkuTxData{Amount: 66000}, 66000, true},
		{"nominal lebih (lebih bayar)", &clipkuTxData{Amount: 70000}, 66000, true},
		{"nominal kurang", &clipkuTxData{Amount: 65000}, 66000, false},
		{"nominal jauh kurang", &clipkuTxData{Amount: 1000}, 66000, false},
		{"fallback total_amount", &clipkuTxData{TotalAmount: 66000}, 66000, true},
		{"fallback total_amount kurang", &clipkuTxData{TotalAmount: 1000}, 66000, false},
		{"tanpa nominal (API tidak melapor)", &clipkuTxData{}, 66000, true},
		{"remote nil", nil, 66000, true},
		{"tagihan 0 (prorata bayar-0)", &clipkuTxData{Amount: 0}, 0, true},
	}
	for _, c := range cases {
		if got := clipkuAmountSufficient(c.remote, c.expected); got != c.want {
			t.Errorf("%s: dapat %v, mau %v", c.name, got, c.want)
		}
	}
}

func TestDecideClipkuWebhook(t *testing.T) {
	paidFull := &clipkuTxData{Status: "paid", Amount: 66000}
	paidShort := &clipkuTxData{Status: "paid", Amount: 1000}
	pending := &clipkuTxData{Status: "pending", Amount: 66000}
	expired := &clipkuTxData{Status: "expired", Amount: 66000}
	failed := &clipkuTxData{Status: "failed", Amount: 66000}
	verifyErr := errors.New("clipkupay: timeout")

	cases := []struct {
		name          string
		txAmount      int64
		webhookStatus string
		remote        *clipkuTxData
		remoteErr     error
		wantAction    clipkuWebhookAction
		wantLog       string
		wantSync      string
	}{
		{"paid + remote paid penuh -> aktivasi", 66000, "paid", paidFull, nil, clipkuActionActivate, "activated", ""},
		{"paid + remote paid kurang -> tolak", 66000, "paid", paidShort, nil, clipkuActionIgnore, "status_mismatch", ""},
		{"paid + remote pending -> tolak", 66000, "paid", pending, nil, clipkuActionIgnore, "status_mismatch", ""},
		{"paid + remote expired -> tolak", 66000, "paid", expired, nil, clipkuActionIgnore, "status_mismatch", ""},
		{"paid + verifikasi gagal -> abaikan", 66000, "paid", nil, verifyErr, clipkuActionIgnore, "verify_failed", ""},
		{"expired + remote expired -> sync", 66000, "expired", expired, nil, clipkuActionSync, "synced:expired", "expired"},
		{"failed + remote failed -> sync", 66000, "failed", failed, nil, clipkuActionSync, "synced:failed", "failed"},
		{"expired + remote failed -> sync status remote", 66000, "expired", failed, nil, clipkuActionSync, "synced:failed", "failed"},
		{"expired + remote paid -> JANGAN turunkan", 66000, "expired", paidFull, nil, clipkuActionIgnore, "status_mismatch", ""},
		{"expired + remote pending -> abaikan", 66000, "expired", pending, nil, clipkuActionIgnore, "pending", ""},
		{"expired + verifikasi gagal -> abaikan", 66000, "expired", nil, verifyErr, clipkuActionIgnore, "verify_failed", ""},
		{"webhook success (alias paid)", 66000, "success", paidFull, nil, clipkuActionActivate, "activated", ""},
	}
	for _, c := range cases {
		action, logStatus, syncStatus := decideClipkuWebhook(c.txAmount, c.webhookStatus, c.remote, c.remoteErr)
		if action != c.wantAction || logStatus != c.wantLog || syncStatus != c.wantSync {
			t.Errorf("%s: dapat (%q,%q,%q), mau (%q,%q,%q)",
				c.name, action, logStatus, syncStatus, c.wantAction, c.wantLog, c.wantSync)
		}
	}
}

func TestNewBillingOrderIDUnique(t *testing.T) {
	seen := map[string]bool{}
	for i := 0; i < 1000; i++ {
		id := newBillingOrderID(42)
		if !strings.HasPrefix(id, "WAG-42-") {
			t.Fatalf("format salah: %q", id)
		}
		if seen[id] {
			t.Fatalf("order ID dobel: %q", id)
		}
		seen[id] = true
	}
	// User berbeda tidak boleh menghasilkan ID yang sama.
	if a, b := newBillingOrderID(1), newBillingOrderID(2); a == b {
		t.Fatalf("order ID user berbeda sama: %q", a)
	}
}

// TestClipkuPayWebhookSignatureGate: bila API key terkonfigurasi, webhook
// tanpa/tanpa-signature-valid harus 401 SEBELUM menyentuh gateway; dengan
// signature valid tapi order tak dikenal, 200 tanpa memanggil gateway
// (lookup lokal gagal dulu).
func TestClipkuPayWebhookSignatureGate(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.Setting{}, &models.PaymentWebhookLog{}, &models.Transaction{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	// Bersihkan sisa run sebelumnya.
	db.Unscoped().Where("key = ?", settingClipkuAPIKey).Delete(&models.Setting{})
	db.Where("provider = ?", "clipkupay").Delete(&models.PaymentWebhookLog{})
	invalidateSettingCache(settingClipkuAPIKey)
	if err := db.Create(&models.Setting{Key: settingClipkuAPIKey, Value: "kunci-uji-webhook"}).Error; err != nil {
		t.Fatalf("seed setting: %v", err)
	}
	defer func() {
		db.Unscoped().Where("key = ?", settingClipkuAPIKey).Delete(&models.Setting{})
		invalidateSettingCache(settingClipkuAPIKey)
	}()

	cfg := &config.Config{}
	call := func(body []byte, sig string) *httptest.ResponseRecorder {
		w := httptest.NewRecorder()
		c, _ := gin.CreateTestContext(w)
		req := httptest.NewRequest(http.MethodPost, "/api/billing/clipkupay/webhook", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		if sig != "" {
			req.Header.Set("X-Signature", sig)
		}
		c.Request = req
		clipkuPayWebhook(cfg, db, nil)(c)
		return w
	}
	sign := func(body []byte) string {
		mac := hmac.New(sha256.New, []byte("kunci-uji-webhook"))
		mac.Write(body)
		return hex.EncodeToString(mac.Sum(nil))
	}

	payload := []byte(`{"order_id":"WAG-9-9999999999","transaction_status":"paid"}`)

	// 1. Tanpa signature -> 401.
	if w := call(payload, ""); w.Code != http.StatusUnauthorized {
		t.Errorf("tanpa signature: status %d, mau 401", w.Code)
	}
	// 2. Signature salah -> 401.
	if w := call(payload, "deadbeef"); w.Code != http.StatusUnauthorized {
		t.Errorf("signature salah: status %d, mau 401", w.Code)
	}
	// 3. Signature benar + order tak dikenal -> 200, log unknown_order,
	//    tanpa memanggil gateway (tidak ada transaksi lokal untuk order itu).
	w := call(payload, sign(payload))
	if w.Code != http.StatusOK {
		t.Fatalf("signature benar + order tak dikenal: status %d, mau 200", w.Code)
	}
	var log models.PaymentWebhookLog
	if err := db.Where("provider = ?", "clipkupay").Order("id DESC").First(&log).Error; err != nil {
		t.Fatalf("webhook log tidak tercatat: %v", err)
	}
	if log.Status != "unknown_order" {
		t.Errorf("status log = %q, mau %q", log.Status, "unknown_order")
	}

	// 4. Respons JSON tetap terbaca sebagai JSON valid.
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Errorf("respons bukan JSON: %v", err)
	}
}
