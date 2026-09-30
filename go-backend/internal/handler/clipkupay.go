package handler

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ── Clipku Pay (m.clipku.com) — payment gateway untuk langganan ──────────────
// Auth via CLI Python ~/workspace/skills/clipkupay/bin/clipkupay yang memakai
// kredensial custom.clipkupay lewat authd surrogate — Go tidak pernah
// menyentuh API key mentah.
//   create → CLI "create" (POST ?action=create_transaction)
//   get    → CLI "get"    (GET  ?action=get_transaction&order_id=X)
// Webhook: X-Signature = HMAC-SHA256 hex dari raw body, key = merchant API key.
//   Bila API key mentah tidak tersedia (mode CLI), verifikasi HMAC dilewati
//   namun status tetap diverifikasi ulang ke API Clipku Pay sebelum aktivasi.

type clipkuPay struct {
	webhookURL string
}

func clipkuCLIPath() string {
	if p := strings.TrimSpace(getenvClipku("CLIPKUPAY_CLI")); p != "" {
		return p
	}
	return "/home/hatch/workspace/skills/clipkupay/bin/clipkupay"
}

func getenvClipku(key string) string {
	return strings.TrimSpace(os.Getenv(key))
}

func newClipkuPay(cfg *config.Config) clipkuPay {
	wh := strings.TrimSpace(cfg.ClipkuPayWebhookURL)
	if wh == "" {
		wh = "https://wa.clipku.com/api/billing/clipkupay/webhook"
	}
	return clipkuPay{webhookURL: wh}
}

func (k clipkuPay) enabled() bool {
	st, err := os.Stat(clipkuCLIPath())
	return err == nil && !st.IsDir()
}

type clipkuTxData struct {
	OrderID     string `json:"order_id"`
	Amount      int64  `json:"amount"`
	TotalAmount int64  `json:"total_amount"`
	Status      string `json:"status"`
	PaymentURL  string `json:"payment_url"`
	QrURL       string `json:"qr_url"`
}

type clipkuCLIOut struct {
	HTTPStatus int            `json:"http_status"`
	Response   map[string]any `json:"response"`
}

// cliCall memanggil CLI clipkupay dan mengembalikan "response"-nya.
func (k clipkuPay) cliCall(args ...string) (map[string]any, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, clipkuCLIPath(), args...)
	var stdout, stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr
	if err := cmd.Run(); err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return nil, fmt.Errorf("clipkupay: %s", msg)
	}
	var out clipkuCLIOut
	if err := json.Unmarshal(stdout.Bytes(), &out); err != nil {
		return nil, fmt.Errorf("clipkupay: output tidak valid")
	}
	if out.HTTPStatus >= 400 {
		msg := fmt.Sprintf("http %d", out.HTTPStatus)
		if eb, ok := out.Response["_error_body"]; ok {
			if m := clipkuErrMsg(eb); m != "" {
				msg = m
			}
		}
		return nil, fmt.Errorf("clipkupay: %s", msg)
	}
	return out.Response, nil
}

func clipkuErrMsg(v any) string {
	switch e := v.(type) {
	case map[string]any:
		for _, k := range []string{"message", "error", "detail", "title"} {
			if s, ok := e[k].(string); ok && s != "" {
				return s
			}
		}
	case string:
		return e
	}
	return ""
}

func clipkuDataOf(out map[string]any) *clipkuTxData {
	d, _ := out["data"].(map[string]any)
	if d == nil {
		return nil
	}
	num := func(v any) int64 {
		switch n := v.(type) {
		case float64:
			return int64(n)
		case int64:
			return n
		}
		return 0
	}
	str := func(v any) string {
		s, _ := v.(string)
		return s
	}
	return &clipkuTxData{
		OrderID:     str(d["order_id"]),
		Amount:      num(d["amount"]),
		TotalAmount: num(d["total_amount"]),
		Status:      str(d["status"]),
		PaymentURL:  str(d["payment_url"]),
		QrURL:       str(d["qr_url"]),
	}
}

// fetchQrisURL mengambil URL gambar QR QRIS dari halaman pembayaran Clipku Pay.
// Halaman pay.php me-render QR via api.qrserver.com dengan payload EMV;
// fungsi ini mengekstrak URL tersebut. Gagal → "" (fallback: tanpa QR).
func fetchQrisURL(paymentURL string) string {
	fetchURL := paymentURL
	if strings.Contains(fetchURL, "?") {
		fetchURL += "&select_method=QRIS-A"
	} else {
		fetchURL += "?select_method=QRIS-A"
	}
	req, err := http.NewRequest(http.MethodGet, fetchURL, nil)
	if err != nil {
		return ""
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
	req.Header.Set("Accept", "text/html")
	client := &http.Client{Timeout: 25 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	html := string(raw)
	// pola: https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=0&data=<EMV>
	re := regexp.MustCompile(`https://api\.qrserver\.com/v1/create-qr-code/\?size=320x320(?:&amp;|&)margin=0(?:&amp;|&)data=([0-9A-Za-z%\+\._\-~]+)`)
	m := re.FindStringSubmatch(html)
	if len(m) < 2 {
		return ""
	}
	return "https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=0&data=" + m[1]
}

// createTransaction membuat transaksi pembayaran di Clipku Pay.
func (k clipkuPay) createTransaction(orderID string, amount int64, customerName, customerEmail string) (*clipkuTxData, error) {
	args := []string{
		"create",
		"--order-id", orderID,
		"--amount", fmt.Sprintf("%d", amount),
		"--channel", "qris",
		"--name", customerName,
		"--email", customerEmail,
		"--webhook-url", k.webhookURL,
	}
	out, err := k.cliCall(args...)
	if err != nil {
		return nil, err
	}
	data := clipkuDataOf(out)
	if data == nil || data.OrderID == "" {
		return nil, fmt.Errorf("clipkupay: respon transaksi kosong")
	}
	// Lengkapi QR QRIS bila API tidak memberikannya
	if data.QrURL == "" && data.PaymentURL != "" {
		data.QrURL = fetchQrisURL(data.PaymentURL)
	}
	return data, nil
}

// getTransaction mengecek status transaksi di Clipku Pay (sumber kebenaran).
func (k clipkuPay) getTransaction(orderID string) (*clipkuTxData, error) {
	out, err := k.cliCall("get", "--order-id", orderID)
	if err != nil {
		return nil, err
	}
	data := clipkuDataOf(out)
	if data == nil {
		return nil, fmt.Errorf("clipkupay: transaksi tidak ditemukan")
	}
	return data, nil
}

func clipkuIsPaid(status string) bool {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "paid", "success", "settlement", "capture":
		return true
	}
	return false
}

// verifyClipkuSignature memverifikasi header X-Signature terhadap raw body.
func verifyClipkuSignature(rawBody []byte, headerSig, apiKey string) bool {
	if headerSig == "" || apiKey == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(apiKey))
	mac.Write(rawBody)
	expected := hex.EncodeToString(mac.Sum(nil))
	return hmac.Equal([]byte(strings.ToLower(expected)), []byte(strings.ToLower(headerSig)))
}

// activateSubscription menandai transaksi lunas + mengaktifkan langganan.
// Idempoten: bila transaksi sudah paid, tidak melakukan apa-apa.
func activateSubscription(db *gorm.DB, txID uint) error {
	return db.Transaction(func(tdb *gorm.DB) error {
		var tx models.Transaction
		if err := tdb.First(&tx, txID).Error; err != nil {
			return err
		}
		if tx.Status == "paid" {
			return nil
		}
		if tx.PlanID == nil {
			return fmt.Errorf("transaksi tanpa paket")
		}
		var plan models.Plan
		if err := tdb.First(&plan, *tx.PlanID).Error; err != nil {
			return err
		}
		now := time.Now()
		tx.Status = "paid"
		tx.PaidAt = &now
		if err := tdb.Save(&tx).Error; err != nil {
			return err
		}
		// Nonaktifkan langganan lama
		tdb.Model(&models.Subscription{}).
			Where("user_id = ? AND status = ?", tx.UserID, "active").
			Update("status", "expired")
		// Buat langganan baru
		sub := models.Subscription{
			UserID:    tx.UserID,
			PlanID:    plan.ID,
			Status:    "active",
			StartDate: now,
			EndDate:   now.AddDate(0, 0, plan.Duration),
		}
		if err := tdb.Create(&sub).Error; err != nil {
			return err
		}
		// Sinkronkan kolom plan di user
		tdb.Model(&models.User{}).Where("id = ?", tx.UserID).Update("plan", plan.Slug)
		return nil
	})
}

// POST /api/billing/clipkupay/webhook — publik, diverifikasi via X-Signature.
func clipkuPayWebhook(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	kp := newClipkuPay(cfg)
	return func(c *gin.Context) {
		raw, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
		if err != nil || len(raw) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Payload kosong"})
			return
		}

		// Catat semua webhook masuk untuk audit
		log := models.PaymentWebhookLog{
			Provider:  "clipkupay",
			EventType: "transaction",
			Payload:   string(raw),
			Status:    "received",
		}
		db.Create(&log)

		apiKey := strings.TrimSpace(os.Getenv("CLIPKUPAY_API_KEY"))
		if apiKey != "" && !verifyClipkuSignature(raw, c.GetHeader("X-Signature"), apiKey) {
			db.Model(&log).Update("status", "invalid_signature")
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Signature tidak valid"})
			return
		}
		// Tanpa API key mentah (mode CLI), HMAC tidak bisa diverifikasi;
		// keamanan dijaga oleh verifikasi ulang ke API Clipku Pay di bawah.

		var payload map[string]any
		if err := json.Unmarshal(raw, &payload); err != nil {
			db.Model(&log).Update("status", "bad_payload")
			c.JSON(http.StatusBadRequest, gin.H{"message": "Payload tidak valid"})
			return
		}
		orderID, _ := payload["order_id"].(string)
		status, _ := payload["transaction_status"].(string)
		if status == "" {
			status, _ = payload["status"].(string)
		}
		db.Model(&log).Update("event_type", "transaction:"+strings.ToLower(status))

		if orderID == "" {
			c.JSON(http.StatusOK, gin.H{"message": "OK"})
			return
		}

		var tx models.Transaction
		if err := db.Where("external_id = ?", orderID).First(&tx).Error; err != nil {
			db.Model(&log).Update("status", "unknown_order")
			c.JSON(http.StatusOK, gin.H{"message": "OK"})
			return
		}

		if clipkuIsPaid(status) {
			// Verifikasi ulang ke Clipku Pay sebagai sumber kebenaran
			remote, err := kp.getTransaction(orderID)
			if err != nil {
				db.Model(&log).Update("status", "verify_failed")
				c.JSON(http.StatusOK, gin.H{"message": "OK"})
				return
			}
			if !clipkuIsPaid(remote.Status) {
				db.Model(&log).Update("status", "status_mismatch")
				c.JSON(http.StatusOK, gin.H{"message": "OK"})
				return
			}
			if err := activateSubscription(db, tx.ID); err != nil {
				db.Model(&log).Update("status", "activate_failed")
				c.JSON(http.StatusOK, gin.H{"message": "OK"})
				return
			}
			db.Model(&log).Update("status", "activated")
		} else {
			// Sinkronkan status non-paid (expired/failed)
			st := strings.ToLower(status)
			if st == "expired" || st == "failed" || st == "cancelled" {
				db.Model(&tx).Update("status", st)
				db.Model(&log).Update("status", "synced:"+st)
			}
		}
		c.JSON(http.StatusOK, gin.H{"message": "OK"})
	}
}
