package whatsapp

import (
	"bytes"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/security"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

// parseJID converts a phone number string to a WhatsApp JID
func parseJID(phone string) (types.JID, error) {
	phone = strings.TrimPrefix(phone, "+")
	phone = strings.TrimPrefix(phone, "0")
	phone = strings.ReplaceAll(phone, " ", "")
	phone = strings.ReplaceAll(phone, "-", "")

	if phone == "" {
		return types.JID{}, fmt.Errorf("nomor telepon kosong")
	}

	return types.NewJID(phone, types.DefaultUserServer), nil
}

// extractMessageText extracts text from a whatsmeow message
func extractMessageText(msg *events.Message) string {
	if msg.Message == nil {
		return ""
	}
	m := msg.Message
	if m.GetConversation() != "" {
		return m.GetConversation()
	}
	if m.GetExtendedTextMessage() != nil {
		return m.GetExtendedTextMessage().GetText()
	}
	if m.GetImageMessage() != nil {
		return m.GetImageMessage().GetCaption()
	}
	if m.GetVideoMessage() != nil {
		return m.GetVideoMessage().GetCaption()
	}
	if m.GetDocumentMessage() != nil {
		return m.GetDocumentMessage().GetCaption()
	}
	return ""
}

// getMessageType determines the type of an incoming message
func getMessageType(msg *events.Message) string {
	if msg.Message == nil {
		return "text"
	}
	m := msg.Message
	if m.GetImageMessage() != nil {
		return "image"
	}
	if m.GetVideoMessage() != nil {
		return "video"
	}
	if m.GetAudioMessage() != nil {
		return "audio"
	}
	if m.GetDocumentMessage() != nil {
		return "document"
	}
	if m.GetStickerMessage() != nil {
		return "sticker"
	}
	return "text"
}

// matchKeyword checks if text matches a keyword rule
func matchKeyword(text, keyword, matchType string) bool {
	lower := strings.ToLower(strings.TrimSpace(text))
	keywords := strings.Split(keyword, ",")

	for _, kw := range keywords {
		kw = strings.ToLower(strings.TrimSpace(kw))
		if kw == "" {
			continue
		}
		switch matchType {
		case "exact":
			if lower == kw {
				return true
			}
		case "startsWith":
			if strings.HasPrefix(lower, kw) {
				return true
			}
		default: // "contains"
			if strings.Contains(lower, kw) {
				return true
			}
		}
	}
	return false
}

// isScheduleActive checks if current time is within schedule
func isScheduleActive(from, to string) bool {
	if from == "" || to == "" {
		return true
	}
	now := time.Now()
	nowMin := now.Hour()*60 + now.Minute()

	var fh, fm, th, tm int
	fmt.Sscanf(from, "%d:%d", &fh, &fm)
	fmt.Sscanf(to, "%d:%d", &th, &tm)
	fromMin := fh*60 + fm
	toMin := th*60 + tm

	if fromMin <= toMin {
		return nowMin >= fromMin && nowMin <= toMin
	}
	return nowMin >= fromMin || nowMin <= toMin
}

// truncate limits string length
func truncate(s string, maxLen int) string {
	if len(s) <= maxLen {
		return s
	}
	return s[:maxLen]
}

// downloadFile downloads a file from a URL. URL divalidasi anti-SSRF dulu
// (tolak IP internal) dan diunduh tanpa mengikuti redirect.
func downloadFile(url string) ([]byte, error) {
	if err := security.ValidateOutboundURL(url); err != nil {
		return nil, err
	}
	client := security.NewSafeClient(30 * time.Second)
	resp, err := client.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP %d", resp.StatusCode)
	}

	data, err := io.ReadAll(io.LimitReader(resp.Body, 50*1024*1024))
	if err != nil {
		return nil, err
	}
	return data, nil
}

// DeliverWebhookPayload POSTs a raw JSON payload to a webhook URL with the
// standard headers (Content-Type, X-Webhook-Event, X-Webhook-Secret).
// Timeout 10 detik, tanpa mengikuti redirect (anti-SSRF).
// Mengembalikan HTTP status, sukses/tidak, pesan error,
// dan durasi pengiriman dalam milidetik.
func DeliverWebhookPayload(url, secret, event string, raw []byte) (statusCode int, success bool, errMsg string, durationMs int64) {
	start := time.Now()
	defer func() { durationMs = time.Since(start).Milliseconds() }()

	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(raw))
	if err != nil {
		return 0, false, err.Error(), 0
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Webhook-Event", event)
	if secret != "" {
		req.Header.Set("X-Webhook-Secret", secret)
	}

	client := security.NewSafeClient(10 * time.Second)
	resp, err := client.Do(req)
	if err != nil {
		return 0, false, err.Error(), 0
	}
	defer resp.Body.Close()

	ok := resp.StatusCode >= 200 && resp.StatusCode < 300
	msg := ""
	if !ok {
		msg = fmt.Sprintf("HTTP %d", resp.StatusCode)
	}
	return resp.StatusCode, ok, msg, 0
}
