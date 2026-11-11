package handler

import (
	"fmt"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// GET /api/chat/export?deviceId=1&phone=628...&format=txt|csv|pdf&from=2026-11-01&to=2026-11-11
// — unduh riwayat percakapan sebagai file. Dibatasi 5000 pesan terakhir per
// ekspor. from/to (YYYY-MM-DD, opsional) membatasi periode pesan.
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
		if format != "txt" && format != "csv" && format != "pdf" {
			format = "txt"
		}

		query := udb.Where("user_id = ? AND phone = ?", userID, phone)
		if devID, err := strconv.Atoi(c.Query("deviceId")); err == nil && devID > 0 {
			query = query.Where("device_id = ?", devID)
		}
		// Filter periode (inklusif): from 00:00 sampai to 23:59:59.
		if from, err := time.Parse("2006-01-02", strings.TrimSpace(c.Query("from"))); err == nil {
			query = query.Where("created_at >= ?", from)
		}
		if to, err := time.Parse("2006-01-02", strings.TrimSpace(c.Query("to"))); err == nil {
			query = query.Where("created_at < ?", to.AddDate(0, 0, 1))
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

		// Isi pesan dinormalisasi sekali untuk semua format.
		lines := make([]chatExportLine, 0, len(messages))
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
			lines = append(lines, chatExportLine{at: m.CreatedAt, sender: sender, typ: m.Type, body: body})
		}

		if format == "pdf" {
			c.Header("Content-Type", "application/pdf")
			c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=%q", filename))
			if err := buildChatPDF(c.Writer, contactName, phone, lines); err != nil {
				log.Error().Err(err).Msg("export chat pdf gagal")
			}
			return
		}

		var sb strings.Builder
		if format == "csv" {
			sb.WriteString("waktu,pengirim,tipe,isi\n")
			for _, l := range lines {
				sb.WriteString(csvCell(l.at.Format("2006-01-02 15:04:05")) + ",")
				sb.WriteString(csvCell(l.sender) + ",")
				sb.WriteString(csvCell(l.typ) + ",")
				sb.WriteString(csvCell(l.body) + "\n")
			}
			c.Header("Content-Type", "text/csv; charset=utf-8")
		} else {
			sb.WriteString(fmt.Sprintf("Riwayat chat dengan %s (%s)\n", contactName, phone))
			sb.WriteString(fmt.Sprintf("Diekspor: %s\n", time.Now().Format("02 Jan 2006 15:04")))
			sb.WriteString(strings.Repeat("=", 40) + "\n\n")
			for _, l := range lines {
				sb.WriteString(fmt.Sprintf("[%s] %s: %s\n", l.at.Format("02/01/2006 15:04"), l.sender, l.body))
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

// chatExportLine adalah satu pesan yang dinormalisasi untuk ekspor
// (dipakai format txt, csv, dan pdf).
type chatExportLine struct {
	at     time.Time
	sender string
	typ    string
	body   string
}

// latin1 mengubah teks UTF-8 menjadi Latin-1 yang dimengerti font inti
// gofpdf (Helvetica): karakter di luar Latin-1 (mis. emoji) jadi '?'
// agar PDF tidak gagal render. Bahasa Indonesia sehari-hari aman.
func latin1(s string) string {
	var b strings.Builder
	for _, r := range s {
		if r < 256 {
			b.WriteRune(r)
		} else {
			b.WriteRune('?')
		}
	}
	return b.String()
}

// buildChatPDF menulis riwayat percakapan sebagai PDF A4 sederhana: judul,
// info kontak + tanggal ekspor, lalu satu blok per pesan ("[waktu] pengirim"
// tebal + isi). Memakai gofpdf yang sudah jadi dependensi (invoice billing)
// — tanpa dependensi baru.
func buildChatPDF(w io.Writer, contactName, phone string, lines []chatExportLine) error {
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(15, 14, 15)
	pdf.SetAutoPageBreak(true, 15)
	pdf.AddPage()
	pdf.SetFont("Helvetica", "B", 16)
	pdf.Cell(0, 8, latin1("Riwayat Chat — "+contactName))
	pdf.Ln(9)
	pdf.SetFont("Helvetica", "", 10)
	pdf.Cell(0, 6, latin1(fmt.Sprintf("Nomor: %s  •  Diekspor: %s  •  %d pesan",
		phone, time.Now().Format("02 Jan 2006 15:04"), len(lines))))
	pdf.Ln(10)
	for _, l := range lines {
		pdf.SetFont("Helvetica", "B", 10)
		pdf.Cell(0, 5, latin1(fmt.Sprintf("[%s] %s", l.at.Format("02/01/2006 15:04"), l.sender)))
		pdf.Ln(5)
		pdf.SetFont("Helvetica", "", 10)
		body := latin1(l.body)
		if body == "" {
			body = "-"
		}
		pdf.MultiCell(0, 5, body, "", "", false)
		pdf.Ln(2)
	}
	return pdf.Output(w)
}
