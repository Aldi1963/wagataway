package handler

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ── Clipku Pay (m.clipku.com) — payment gateway untuk langganan ──────────────
// API: Bearer <api_key>
//   POST {base}/api/?action=create_transaction  → buat transaksi (201)
//   GET  {base}/api/?action=get_transaction&order_id=X → cek status
// Webhook: POST {webhook_url} dengan header X-Signature =
//   HMAC-SHA256 hex dari raw body, key = merchant API key.

var clipkuHTTP = &http.Client{Timeout: 20 * time.Second}

type clipkuPay struct {
	apiKey     string
	baseURL    string
	webhookURL string
}

func newClipkuPay(cfg *config.Config) clipkuPay {
	base := strings.TrimSuffix(strings.TrimSpace(cfg.ClipkuPayBaseURL), "/")
	if base == "" {
		base = "https://m.clipku.com"
	}
	wh := strings.TrimSpace(cfg.ClipkuPayWebhookURL)
	if wh == "" {
		wh = "https://wa.clipku.com/api/billing/clipkupay/webhook"
	}
	return clipkuPay{apiKey: cfg.ClipkuPayAPIKey, baseURL: base, webhookURL: wh}
}

func (k clipkuPay) enabled() bool { return k.apiKey != "" }

type clipkuTxData struct {
	OrderID     string `json:"order_id"`
	Amount      int64  `json:"amount"`
	TotalAmount int64  `json:"total_amount"`
	Status      string `json:"status"`
	PaymentURL  string `json:"payment_url"`
	QrURL       string `json:"qr_url"`
}

func (k clipkuPay) apiCall(method, action string, query string, body any) (map[string]any, error) {
	var rdr io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, err
		}
		rdr = bytes.NewReader(b)
	}
	url := fmt.Sprintf("%s/api/?action=%s%s", k.baseURL, action, query)
	req, err := http.NewRequest(method, url, rdr)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+k.apiKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	resp, err := clipkuHTTP.Do(req)
	if err != nil {
		return nil, fmt.Errorf("clipkupay: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))

	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("clipkupay: respon tidak valid (http %d)", resp.StatusCode)
	}
	if resp.StatusCode >= 400 || out["success"] == false {
		msg := fmt.Sprint(out["error"])
		if m, ok := out["message"].(string); ok && m != "" {
			msg = m
		}
		if msg == "" || msg == "<nil>" {
			msg = fmt.Sprintf("http %d", resp.StatusCode)
		}
		return nil, fmt.Errorf("clipkupay: %s", msg)
	}
	return out, nil
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

// createTransaction membuat transaksi pembayaran di Clipku Pay.
func (k clipkuPay) createTransaction(orderID string, amount int64, customerName, customerEmail string) (*clipkuTxData, error) {
	out, err := k.apiCall(http.MethodPost, "create_transaction", "", map[string]any{
		"order_id":       orderID,
		"amount":         amount,
		"payment_channel": "qris",
		"customer_name":  customerName,
		"customer_email": customerEmail,
		"webhook_url":    k.webhookURL,
	})
	if err != nil {
		return nil, err
	}
	data := clipkuDataOf(out)
	if data == nil || data.OrderID == "" {
		return nil, fmt.Errorf("clipkupay: respon transaksi kosong")
	}
	return data, nil
}

// getTransaction mengecek status transaksi di Clipku Pay (sumber kebenaran).
func (k clipkuPay) getTransaction(orderID string) (*clipkuTxData, error) {
	out, err := k.apiCall(http.MethodGet, "get_transaction", "&order_id="+orderID, nil)
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

		if !verifyClipkuSignature(raw, c.GetHeader("X-Signature"), kp.apiKey) {
			db.Model(&log).Update("status", "invalid_signature")
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Signature tidak valid"})
			return
		}

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
