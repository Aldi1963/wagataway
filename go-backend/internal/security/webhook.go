// Utilitas penandatanganan webhook: HMAC-SHA256 atas raw JSON body
// dengan secret per-device, dikirim sebagai header X-Wagataway-Signature.
// Payload webhook sendiri tidak berubah; header bersifat aditif.
package security

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strconv"
	"time"
)

// GenerateWebhookSecret membuat secret acak 32 byte (hex, 64 karakter)
// untuk menandatangani payload webhook.
func GenerateWebhookSecret() (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

// SignWebhookPayload menghitung HMAC-SHA256 dari raw JSON body memakai
// secret perangkat. Format "sha256=<hex>" (ala GitHub webhook signature).
func SignWebhookPayload(secret string, raw []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(raw)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

// VerifyWebhookSignature memeriksa signature header terhadap raw body,
// memakai perbandingan constant-time agar aman dari timing attack.
func VerifyWebhookSignature(secret string, raw []byte, signature string) bool {
	expected := SignWebhookPayload(secret, raw)
	return hmac.Equal([]byte(expected), []byte(signature))
}

// WebhookTimestamp mengembalikan timestamp unix (detik) sebagai string
// untuk header anti-replay X-Wagataway-Timestamp.
func WebhookTimestamp() string {
	return strconv.FormatInt(time.Now().Unix(), 10)
}

// SetWebhookSignatureHeaders menambahkan header autentikasi webhook ke
// request: X-Wagataway-Signature (HMAC-SHA256 dari raw body) dan
// X-Wagataway-Timestamp (unix epoch, untuk cek anti-replay di penerima).
// Tidak mengubah body/payload. Bila secret kosong, tidak melakukan apa-apa.
func SetWebhookSignatureHeaders(req *http.Request, secret string, raw []byte) {
	if secret == "" {
		return
	}
	req.Header.Set("X-Wagataway-Signature", SignWebhookPayload(secret, raw))
	req.Header.Set("X-Wagataway-Timestamp", WebhookTimestamp())
}
