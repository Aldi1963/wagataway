package handler

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// historyItem adalah satu entri riwayat chat terpadu (chat inbox + pesan API).
type historyItem struct {
	Source    string    `json:"source"` // "chat" | "api"
	Direction string    `json:"direction"`
	Type      string    `json:"type"`
	Content   string    `json:"content"`
	MediaURL  string    `json:"mediaUrl,omitempty"`
	Timestamp time.Time `json:"timestamp"`
}

// normalizePhoneVariants mengembalikan varian nomor untuk pencocokan DB.
func normalizePhoneVariants(phone string) []string {
	var digits strings.Builder
	for _, r := range phone {
		if r >= '0' && r <= '9' {
			digits.WriteRune(r)
		}
	}
	d := digits.String()
	if d == "" {
		return nil
	}
	variants := []string{d}
	trimmed := strings.TrimPrefix(d, "0")
	if trimmed != d && trimmed != "" {
		variants = append(variants, trimmed)
	}
	return variants
}

// getChatHistory: GET /api/chat/history?deviceId=&phone=&limit=&before=
// Menggabungkan chat_inbox (in/out) dan messages (outgoing API/blast),
// difilter ketat per userID dari auth agar tidak bocor antar user.
func getChatHistory(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

		deviceID, err := strconv.ParseUint(c.Query("deviceId"), 10, 32)
		if err != nil || deviceID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "deviceId wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}
		phone := strings.TrimSpace(c.Query("phone"))
		if phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "phone wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}
		variants := normalizePhoneVariants(phone)
		if len(variants) == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Format nomor tidak valid", "code": "VALIDATION_ERROR"})
			return
		}

		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		if limit < 1 {
			limit = 50
		}
		if limit > 200 {
			limit = 200
		}

		var before time.Time
		hasBefore := false
		if b := c.Query("before"); b != "" {
			if t, err := time.Parse(time.RFC3339, b); err == nil {
				before = t
				hasBefore = true
			} else {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Format before tidak valid (gunakan RFC3339)", "code": "VALIDATION_ERROR"})
				return
			}
		}

		// Pastikan device milik user
		if !checkDeviceOwnership(c, udb, userID, uint(deviceID)) {
			return
		}

		var items []historyItem

		// 1. Chat inbox (in & out)
		var inbox []models.ChatInbox
		q := udb.Where("user_id = ? AND device_id = ? AND phone IN ?", userID, deviceID, variants)
		if hasBefore {
			q = q.Where("created_at < ?", before)
		}
		q.Order("created_at DESC").Limit(limit).Find(&inbox)
		for _, m := range inbox {
			items = append(items, historyItem{
				Source:    "chat",
				Direction: m.Direction,
				Type:      m.Type,
				Content:   m.Content,
				MediaURL:  m.MediaURL,
				Timestamp: m.CreatedAt,
			})
		}

		// 2. Pesan API/blast (outgoing)
		var msgs []models.Message
		q2 := udb.Where("user_id = ? AND device_id = ? AND \"to\" IN ?", userID, deviceID, variants)
		if hasBefore {
			q2 = q2.Where("created_at < ?", before)
		}
		if err := q2.Order("created_at DESC").Limit(limit).Find(&msgs).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membaca riwayat", "code": "DB_ERROR"})
			return
		}
		for _, m := range msgs {
			ts := m.CreatedAt
			if m.SentAt != nil {
				ts = *m.SentAt
			}
			items = append(items, historyItem{
				Source:    "api",
				Direction: "out",
				Type:      m.Type,
				Content:   m.Content,
				MediaURL:  m.MediaURL,
				Timestamp: ts,
			})
		}

		// Urutkan terbaru dulu, potong ke limit, lalu balik kronologis
		sort.Slice(items, func(i, j int) bool { return items[i].Timestamp.After(items[j].Timestamp) })
		if len(items) > limit {
			items = items[:limit]
		}
		for i, j := 0, len(items)-1; i < j; i, j = i+1, j-1 {
			items[i], items[j] = items[j], items[i]
		}

		c.JSON(http.StatusOK, gin.H{
			"deviceId": deviceID,
			"phone":    variants[0],
			"count":    len(items),
			"messages": items,
		})
	}
}
