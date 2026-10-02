package handler

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// GET /api/chat/export?deviceId=1&phone=628...&format=txt|csv — unduh riwayat
// percakapan sebagai file. Dibatasi 5000 pesan terakhir per ekspor.
func exportChatHistory(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		phone := strings.TrimSpace(c.Query("phone"))
		if phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "phone wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}
		format := strings.ToLower(strings.TrimSpace(c.DefaultQuery("format", "txt")))
		if format != "txt" && format != "csv" {
			format = "txt"
		}

		query := udb.Where("user_id = ? AND phone = ?", userID, phone)
		if devID, err := strconv.Atoi(c.Query("deviceId")); err == nil && devID > 0 {
			query = query.Where("device_id = ?", devID)
		}

		var messages []models.ChatInbox
		query.Order("created_at ASC").Limit(5000).Find(&messages)
		if len(messages) == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Tidak ada riwayat chat", "code": "NOT_FOUND"})
			return
		}

		// Nama kontak untuk judul file
		var conv models.ChatConversation
		udb.Where("user_id = ? AND phone = ?", userID, phone).Order("updated_at DESC").First(&conv)
		contactName := strings.TrimSpace(conv.ContactName)
		if contactName == "" {
			contactName = phone
		}

		ts := time.Now().Format("20060102-150405")
		filename := fmt.Sprintf("chat-%s-%s.%s", phone, ts, format)

		var sb strings.Builder
		if format == "csv" {
			sb.WriteString("waktu,pengirim,tipe,isi\n")
			for _, m := range messages {
				sender := "Kontak"
				if m.Direction == "out" {
					sender = "Saya"
				}
				body := m.Content
				if m.Type != "text" && m.Type != "" {
					if body != "" {
						body = fmt.Sprintf("[%s] %s", m.Type, body)
					} else {
						body = fmt.Sprintf("[%s]", m.Type)
					}
				}
				sb.WriteString(csvCell(m.CreatedAt.Format("2006-01-02 15:04:05")) + ",")
				sb.WriteString(csvCell(sender) + ",")
				sb.WriteString(csvCell(m.Type) + ",")
				sb.WriteString(csvCell(body) + "\n")
			}
			c.Header("Content-Type", "text/csv; charset=utf-8")
		} else {
			sb.WriteString(fmt.Sprintf("Riwayat chat dengan %s (%s)\n", contactName, phone))
			sb.WriteString(fmt.Sprintf("Diekspor: %s\n", time.Now().Format("02 Jan 2006 15:04")))
			sb.WriteString(strings.Repeat("=", 40) + "\n\n")
			for _, m := range messages {
				sender := contactName
				if m.Direction == "out" {
					sender = "Saya"
				}
				body := m.Content
				if m.Type != "text" && m.Type != "" {
					if body != "" {
						body = fmt.Sprintf("[%s] %s", m.Type, body)
					} else {
						body = fmt.Sprintf("[%s]", m.Type)
					}
				}
				sb.WriteString(fmt.Sprintf("[%s] %s: %s\n", m.CreatedAt.Format("02/01/2006 15:04"), sender, body))
			}
			c.Header("Content-Type", "text/plain; charset=utf-8")
		}
		c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
		c.String(http.StatusOK, sb.String())
	}
}

func csvCell(s string) string {
	if strings.ContainsAny(s, "\",\n\r") {
		return "\"" + strings.ReplaceAll(s, "\"", "\"\"") + "\""
	}
	return s
}
