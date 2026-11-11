package handler

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"regexp"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/gin-gonic/gin"
	"github.com/skip2/go-qrcode"
	"gorm.io/gorm"
)

// ── Clipku Pay (m.clipku.com) — payment gateway untuk langganan ──────────────
// Auth via CLI Python ~/workspace/skills/clipkupay/bin/clipkupay yang memakai
// kredensial custom.clipkupay lewat authd surrogate — Go tidak pernah
// menyentuh API key mentah.
//   create → CLI "create" (POST ?action=create_transaction)
//   get    → CLI "get"    (GET  ?action=get_transaction&order_id=X)
// Webhook: X-Signature = HMAC-SHA256 hex dari raw body, key = merchant API key.
//   Bila API key mentah terkonfigurasi, signature WAJIB valid (401 bila tidak).
//   Bila API key mentah tidak tersedia (mode CLI), verifikasi HMAC tidak bisa
//   dilakukan di sini; sebagai gantinya SETIAP cabang webhook (paid maupun
//   non-paid) diverifikasi ulang ke API Clipku Pay sebelum status lokal
//   berubah, dan aktivasi menolak nominal remote yang kurang dari tagihan
//   atau tidak diketahui (mode ketat).

type clipkuPay struct {
	webhookURL string
	apiKey     string
	appURL     string
	db         *gorm.DB
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

func newClipkuPay(cfg *config.Config, db *gorm.DB) clipkuPay {
	wh := clipkuWebhookURLFromSettings(db, strings.TrimSpace(cfg.ClipkuPayWebhookURL))
	return clipkuPay{
		webhookURL: wh,
		apiKey:     clipkuAPIKeyFromSettings(db),
		appURL:     strings.TrimSuffix(strings.TrimSpace(cfg.AppURL), "/"),
		db:         db,
	}
}

// clipkuPayClient adalah antarmuka minimal klien Clipku Pay — clipkuPay
// memenuhinya. Handler tagihan pelanggan memakai factory di bawah (bukan
// newClipkuPay langsung) supaya unit test bisa menyuntikkan fake tanpa
// memanggil API Clipku Pay sungguhan.
type clipkuPayClient interface {
	enabled() bool
	mode() string
	createTransaction(orderID string, amount int64, customerName, customerEmail string) (*clipkuTxData, error)
	getTransaction(orderID string) (*clipkuTxData, error)
}

var newClipkuPayClient = func(cfg *config.Config, db *gorm.DB) clipkuPayClient {
	return newClipkuPay(cfg, db)
}

func (k clipkuPay) enabled() bool {
	if k.apiKey != "" {
		return true
	}
	st, err := os.Stat(clipkuCLIPath())
	return err == nil && !st.IsDir()
}

// mode mengembalikan "api_key" bila API key mentah tersedia,
// "bridge" bila lewat CLI surrogate, atau "disabled".
func (k clipkuPay) mode() string {
	if k.apiKey != "" {
		return "api_key"
	}
	if st, err := os.Stat(clipkuCLIPath()); err == nil && !st.IsDir() {
		return "bridge"
	}
	return "disabled"
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

// directCall memanggil API Clipku Pay langsung via HTTP dengan Bearer API key.
// Dipakai bila admin mengisi API key di halaman pengaturan.
func (k clipkuPay) directCall(method, action, query string, body any) (map[string]any, error) {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, fmt.Errorf("clipkupay: %s", err.Error())
		}
		bodyReader = bytes.NewReader(b)
	}
	req, err := http.NewRequest(method,
		"https://m.clipku.com/api/?action="+action+query, bodyReader)
	if err != nil {
		return nil, fmt.Errorf("clipkupay: %s", err.Error())
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", "Bearer "+k.apiKey)
	req.Header.Set("User-Agent",
		"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "+
			"(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36")
	client := &http.Client{Timeout: 45 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("clipkupay: %s", err.Error())
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var out map[string]any
	if err := json.Unmarshal(raw, &out); err != nil {
		out = map[string]any{"_error_body": string(raw)}
	}
	if resp.StatusCode >= 400 {
		msg := fmt.Sprintf("http %d", resp.StatusCode)
		if eb, ok := out["_error_body"]; ok {
			if m := clipkuErrMsg(eb); m != "" {
				msg = m
			}
		} else if m := clipkuErrMsg(out); m != "" {
			msg = m
		}
		return nil, fmt.Errorf("clipkupay: %s", msg)
	}
	return out, nil
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
		QrURL:       normalizeQrURL(str(d["qr_url"])),
	}
}

// normalizeQrURL: API Clipku Pay mengembalikan qr_url sebagai payload EMV
// mentah (string "00020101..."), BUKAN URL gambar. Prioritas:
//  1. Bangun gambar QR dari EMV secara lokal (tanpa layanan pihak ketiga)
//     → data URL PNG yang langsung bisa dipakai di <img>.
//  2. Fallback: URL gambar via api.qrserver.com (perilaku lama).
//  3. Bila sudah berupa URL http(s), dipakai apa adanya.
func normalizeQrURL(qr string) string {
	qr = strings.TrimSpace(qr)
	if qr == "" {
		return ""
	}
	if strings.HasPrefix(qr, "http://") || strings.HasPrefix(qr, "https://") {
		return qr
	}
	if dataURL := qrisQRDataURL(qr); dataURL != "" {
		return dataURL
	}
	return "https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=0&data=" + url.QueryEscape(qr)
}

// qrisQRDataURL membuat gambar QR PNG dari payload EMV QRIS memakai library
// lokal (skip2/go-qrcode, sudah dipakai untuk QR 2FA). Mengembalikan data URL
// "data:image/png;base64,..." atau "" bila gagal.
func qrisQRDataURL(emv string) string {
	emv = strings.TrimSpace(emv)
	if emv == "" {
		return ""
	}
	png, err := qrcode.Encode(emv, qrcode.Medium, 320)
	if err != nil {
		return ""
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)
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
	var out map[string]any
	var err error
	// Setelah bayar sukses, halaman Clipku Pay redirect kembali ke WaGataway
	// (halaman sukses mereka memanggil window.location.replace(d.redirect_url)).
	redirectURL := ""
	if k.appURL != "" {
		redirectURL = k.appURL + "/billing?pay=success&order_id=" + url.QueryEscape(orderID)
	}
	if k.apiKey != "" {
		body := map[string]any{
			"order_id":        orderID,
			"amount":          amount,
			"payment_channel": "qris",
			"customer_name":   customerName,
			"customer_email":  customerEmail,
			"webhook_url":     k.webhookURL,
			"redirect_url":    redirectURL,
		}
		out, err = k.directCall("POST", "create_transaction", "", body)
	} else {
		args := []string{
			"create",
			"--order-id", orderID,
			"--amount", fmt.Sprintf("%d", amount),
			"--channel", "qris",
			"--name", customerName,
			"--email", customerEmail,
			"--webhook-url", k.webhookURL,
			"--redirect-url", redirectURL,
		}
		out, err = k.cliCall(args...)
	}
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
	var out map[string]any
	var err error
	if k.apiKey != "" {
		out, err = k.directCall("GET", "get_transaction", "&order_id="+url.QueryEscape(orderID), nil)
	} else {
		out, err = k.cliCall("get", "--order-id", orderID)
	}
	if err != nil {
		return nil, err
	}
	data := clipkuDataOf(out)
	if data == nil {
		return nil, fmt.Errorf("clipkupay: transaksi tidak ditemukan")
	}
	return data, nil
}

// clipkuRemoteAmount mengambil nominal yang dilaporkan Clipku Pay untuk
// sebuah transaksi: "amount" dulu, fallback "total_amount".
func clipkuRemoteAmount(r *clipkuTxData) int64 {
	if r == nil {
		return 0
	}
	if r.Amount > 0 {
		return r.Amount
	}
	return r.TotalAmount
}

// clipkuAmountSufficient (MODE KETAT): nominal remote harus diketahui DAN
// tidak kurang dari tagihan lokal. Nominal 0/tidak diketahui = API tidak
// melaporkannya → aktivasi DITOLAK (bukan lagi diizinkan seperti perilaku
// lama), karena get_transaction terbukti mengembalikan "amount" untuk
// transaksi nyata (verifikasi 2026-11-11: order WAG-34-1791150537 → amount
// 66000, WAG-1-1794260976 → amount 25000). Pengecualian: tagihan 0
// (mis. prorata bayar-0) tetap lolos karena 0 >= 0.
func clipkuAmountSufficient(remote *clipkuTxData, expectedAmount int64) bool {
	return clipkuRemoteAmount(remote) >= expectedAmount
}

// clipkuWebhookAction adalah keputusan webhook setelah verifikasi ulang ke
// Clipku Pay (sumber kebenaran).
type clipkuWebhookAction string

const (
	// clipkuActionActivate lanjutkan aktivasi langganan.
	clipkuActionActivate clipkuWebhookAction = "activate"
	// clipkuActionSync sinkronkan status non-paid dari Clipku Pay.
	clipkuActionSync clipkuWebhookAction = "sync"
	// clipkuActionIgnore jangan ubah status transaksi lokal.
	clipkuActionIgnore clipkuWebhookAction = "ignore"
)

// decideClipkuWebhook menentukan aksi webhook dari status yang diklaim
// webhook + hasil verifikasi ulang ke Clipku Pay. Mengembalikan aksi, status
// untuk PaymentWebhookLog, dan (bila aksi sync) status baru transaksi.
//
//   - Verifikasi ulang gagal → abaikan (webhook kemungkinan akan dikirim
//     ulang oleh Clipku Pay).
//   - Webhook klaim paid: remote harus paid DAN nominalnya tidak kurang dari
//     tagihan; bila tidak, catat status_mismatch dan jangan aktifkan.
//   - Webhook klaim non-paid: status webhook TIDAK dipercaya begitu saja.
//     Hanya disinkronkan bila Clipku Pay mengonfirmasi status terminal
//     non-paid; bila remote justru bilang paid, jangan turunkan status.
func decideClipkuWebhook(txAmount int64, webhookStatus string, remote *clipkuTxData, remoteErr error) (clipkuWebhookAction, string, string) {
	if remoteErr != nil {
		return clipkuActionIgnore, "verify_failed", ""
	}
	if clipkuIsPaid(webhookStatus) {
		if !clipkuIsPaid(remote.Status) {
			return clipkuActionIgnore, "status_mismatch", ""
		}
		if !clipkuAmountSufficient(remote, txAmount) {
			return clipkuActionIgnore, "status_mismatch", ""
		}
		return clipkuActionActivate, "activated", ""
	}
	if clipkuIsPaid(remote.Status) {
		return clipkuActionIgnore, "status_mismatch", ""
	}
	st := strings.ToLower(strings.TrimSpace(remote.Status))
	switch st {
	case "expired", "failed", "cancelled":
		return clipkuActionSync, "synced:" + st, st
	default:
		return clipkuActionIgnore, "pending", ""
	}
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
// Mengembalikan activated=true TEPAT pada momen transisi status → paid
// (dipakai Fitur 6 untuk memicu notifikasi WA pembayaran); false bila tidak
// ada perubahan status (mis. webhook dipanggil ulang).
func activateSubscription(db *gorm.DB, txID uint) (activated bool, err error) {
	err = db.Transaction(func(tdb *gorm.DB) error {
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
		// Afiliasi: bila user ini direferensikan dan transaksi berbayar (>0),
		// catat komisi 20% (atau rate affiliate) untuk pemilik kode referral.
		// Idempoten via uniqueIndex transaction_id.
		if tx.Amount > 0 {
			var referred models.User
			if err := tdb.Select("referred_by_affiliate_id").Where("id = ?", tx.UserID).First(&referred).Error; err == nil &&
				referred.ReferredByAffiliateID != nil {
				var aff models.Affiliate
				if err := tdb.Where("id = ?", *referred.ReferredByAffiliateID).First(&aff).Error; err == nil {
					rate := aff.CommissionRate
					if rate <= 0 || rate > 1 {
						rate = 0.2
					}
					earning := models.AffiliateEarning{
						AffiliateID:    aff.ID,
						ReferredUserID: tx.UserID,
						TransactionID:  &tx.ID,
						Amount:         float64(tx.Amount) * rate,
						Status:         "pending",
					}
					// Abaikan duplikat (bila webhook dipanggil ulang).
					_ = tdb.Where("transaction_id = ?", tx.ID).FirstOrCreate(&earning).Error
					// Voucher hadiah referral (Item 9): aktivasi berbayar
					// pertama teman yang diajak juga menerbitkan satu
					// voucher trial untuk pengajak (idempoten, lihat
					// issueReferralRewardVoucher).
					issueReferralRewardVoucher(tdb, aff, tx)
				}
			}
		}
		activated = true
		return nil
	})
	return activated, err
}

// generateReferralRewardCode membuat kode voucher hadiah unik berawalan
// REF- + 8 karakter (alfabet yang sama dengan generateAffiliateCode).
func generateReferralRewardCode(tdb *gorm.DB) string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	for {
		b := make([]byte, 8)
		for i := range b {
			n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
			b[i] = chars[n.Int64()]
		}
		code := models.ReferralRewardVoucherPrefix + string(b)
		var count int64
		tdb.Model(&models.Voucher{}).Where("code = ?", code).Count(&count)
		if count == 0 {
			return code
		}
	}
}

// issueReferralRewardVoucher menerbitkan voucher hadiah referral untuk
// pengajak (aff.UserID) saat teman yang diajak (tx.UserID) menyelesaikan
// aktivasi berbayar PERTAMANYA.
//
// Definisi "referral berhasil": user yang terdaftar lewat kode afiliasi
// (users.referred_by_affiliate_id) membayar transaksi langganan pertamanya
// lewat ClipkuPay (amount > 0) dan aktivasi berhasil. Pendaftaran saja
// (tanpa bayar) atau aktivasi via voucher gratis TIDAK memberi hadiah.
//
// Hadiah: voucher trial 7 hari (tipe "trial", max_uses 1, kedaluwarsa 90
// hari, tanpa paket acuan — saat redeem, voucherGrantPlan memakai paket
// Free sebagai acuan seperti voucher trial biasa). Pengajak menukarkannya
// lewat endpoint redeem voucher yang sudah ada.
//
// Idempoten: dipanggil dari dalam transaksi activateSubscription, yang
// hanya berjalan sekali per transisi status → paid. Penjaga ganda:
//   - uniqueIndex referred_user_id pada ReferralReward — satu teman yang
//     diajak hanya menerbitkan satu hadiah, apa pun yang terjadi;
//   - cek tidak ada transaksi paid lain milik teman yang diajak — hanya
//     pembayaran pertama yang memberi hadiah.
//
// Bila pembuatan baris reward gagal karena duplikat (dua webhook berlomba),
// voucher yang sudah dibuat di transaksi yang sama dihapus agar tidak ada
// voucher yatim. Kegagalan di sini tidak menggagalkan aktivasi — dicatat
// lewat return tanpa error; aktivasi langganan tetap jalan.
func issueReferralRewardVoucher(tdb *gorm.DB, aff models.Affiliate, tx models.Transaction) {
	// Sudah pernah ada hadiah untuk teman ini → selesai.
	var existing models.ReferralReward
	if err := tdb.Where("referred_user_id = ?", tx.UserID).First(&existing).Error; err == nil {
		return
	}
	// Hanya pembayaran pertama teman yang diajak yang memberi hadiah.
	var paidCount int64
	tdb.Model(&models.Transaction{}).
		Where("user_id = ? AND status = ? AND id <> ?", tx.UserID, "paid", tx.ID).
		Count(&paidCount)
	if paidCount > 0 {
		return
	}
	expiresAt := time.Now().AddDate(0, 0, models.ReferralRewardExpiryDays)
	voucher := models.Voucher{
		Code:      generateReferralRewardCode(tdb),
		Type:      "trial",
		Duration:  models.ReferralRewardDurationDays,
		MaxUses:   1,
		UsedCount: 0,
		IsActive:  true,
		ExpiresAt: &expiresAt,
		Source:    models.VoucherSourceReferralReward,
	}
	if err := tdb.Create(&voucher).Error; err != nil {
		return
	}
	reward := models.ReferralReward{
		AffiliateID:    aff.ID,
		ReferrerUserID: aff.UserID,
		ReferredUserID: tx.UserID,
		TransactionID:  &tx.ID,
		VoucherID:      voucher.ID,
	}
	if err := tdb.Create(&reward).Error; err != nil {
		// Duplikat (balapan webhook): hapus voucher yatim di transaksi
		// yang sama, lalu diam — hadiah dari proses lain yang menang.
		_ = tdb.Delete(&models.Voucher{}, voucher.ID)
		return
	}
}

// POST /api/billing/clipkupay/webhook — publik, diverifikasi via X-Signature.
// Menangani dua jenis order: transaksi langganan (models.Transaction) dan
// tagihan pelanggan (models.CustomerInvoice), dicocokkan via external_id.
// Keduanya memakai verifikasi ulang + mode ketat yang sama.
func clipkuPayWebhook(cfg *config.Config, db *gorm.DB, wm waSender) gin.HandlerFunc {
	kp := newClipkuPayClient(cfg, db)
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

		apiKey := clipkuAPIKeyFromSettings(db)
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
		txErr := db.Where("external_id = ?", orderID).First(&tx).Error
		if txErr == nil {
			handleClipkuTxWebhook(c, db, kp, wm, &log, &tx, status)
			return
		}
		if txErr != nil && !errors.Is(txErr, gorm.ErrRecordNotFound) {
			db.Model(&log).Update("status", "lookup_failed")
			c.JSON(http.StatusOK, gin.H{"message": "OK"})
			return
		}

		// Bukan transaksi langganan — coba tagihan pelanggan.
		var inv models.CustomerInvoice
		if err := db.Where("external_id = ?", orderID).First(&inv).Error; err != nil {
			db.Model(&log).Update("status", "unknown_order")
			c.JSON(http.StatusOK, gin.H{"message": "OK"})
			return
		}
		handleClipkuInvoiceWebhook(c, db, kp, wm, &log, &inv, status)
	}
}

// handleClipkuTxWebhook menangani webhook untuk satu transaksi langganan
// (sudah ditemukan di DB). Dipisah dari handler utama agar webhook tagihan
// pelanggan bisa memakai pola yang sama.
func handleClipkuTxWebhook(c *gin.Context, db *gorm.DB, kp clipkuPayClient, wm waSender, log *models.PaymentWebhookLog, tx *models.Transaction, status string) {
	if clipkuIsPaid(status) {
		// Verifikasi ulang ke Clipku Pay sebagai sumber kebenaran:
		// status DAN nominal harus cocok sebelum aktivasi.
		remote, err := kp.getTransaction(tx.ExternalID)
		action, logStatus, _ := decideClipkuWebhook(tx.Amount, status, remote, err)
		if action != clipkuActionActivate {
			db.Model(&log).Update("status", logStatus)
			c.JSON(http.StatusOK, gin.H{"message": "OK"})
			return
		}
		activated, err := activateSubscription(db, tx.ID)
		if err != nil {
			db.Model(&log).Update("status", "activate_failed")
			c.JSON(http.StatusOK, gin.H{"message": "OK"})
			return
		}
		if activated {
			// Fitur 6: tepat di momen transisi → paid. Error notifikasi
			// tidak menggagalkan webhook (sudah dicatat di log).
			_ = notifyPaymentSuccess(db, wm, tx.ID)
			// Item 8: event webhook outbound subscription.activated.
			fireSubscriptionActivated(db, wm, tx.ID)
		}
		db.Model(&log).Update("status", logStatus)
	} else {
		// Cabang non-paid juga diverifikasi ulang: status webhook tidak
		// dipercaya begitu saja (webhook palsu bisa mematikan transaksi
		// yang sebenarnya sudah lunas).
		remote, err := kp.getTransaction(tx.ExternalID)
		action, logStatus, syncStatus := decideClipkuWebhook(tx.Amount, status, remote, err)
		if action == clipkuActionSync {
			db.Model(&tx).Update("status", syncStatus)
		}
		db.Model(&log).Update("status", logStatus)
	}
	c.JSON(http.StatusOK, gin.H{"message": "OK"})
}

// handleClipkuInvoiceWebhook menangani webhook untuk satu tagihan pelanggan
// (sudah ditemukan di DB). Pola sama dengan langganan: verifikasi ulang ke
// Clipku Pay, mode ketat nominal (tolak bila nominal kurang / tak diketahui),
// dan hanya transisi pending → paid yang memicu notifikasi WA ke pelanggan.
// Status non-paid terminal dari Clipku Pay disinkronkan (failed dipetakan ke
// expired: tautan bayar QRIS-nya sudah tidak bisa dipakai lagi).
func handleClipkuInvoiceWebhook(c *gin.Context, db *gorm.DB, kp clipkuPayClient, wm waSender, log *models.PaymentWebhookLog, inv *models.CustomerInvoice, status string) {
	if clipkuIsPaid(status) {
		remote, err := kp.getTransaction(inv.ExternalID)
		action, logStatus, _ := decideClipkuWebhook(inv.Amount, status, remote, err)
		if action != clipkuActionActivate {
			db.Model(&log).Update("status", logStatus)
			c.JSON(http.StatusOK, gin.H{"message": "OK"})
			return
		}
		paid, err := markCustomerInvoicePaid(db, wm, inv.ID)
		if err != nil {
			db.Model(&log).Update("status", "activate_failed")
			c.JSON(http.StatusOK, gin.H{"message": "OK"})
			return
		}
		_ = paid // transisi sudah terjadi atau sudah lunas sebelumnya
		db.Model(&log).Update("status", logStatus)
	} else {
		remote, err := kp.getTransaction(inv.ExternalID)
		action, logStatus, syncStatus := decideClipkuWebhook(inv.Amount, status, remote, err)
		if action == clipkuActionSync {
			invStatus := syncStatus
			if invStatus == "failed" {
				invStatus = "expired"
			}
			db.Model(&inv).Update("status", invStatus)
		}
		db.Model(&log).Update("status", logStatus)
	}
	c.JSON(http.StatusOK, gin.H{"message": "OK"})
}
