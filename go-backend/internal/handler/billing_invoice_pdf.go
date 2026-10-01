package handler

import (
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"github.com/jung-kurt/gofpdf"
	"gorm.io/gorm"
)

// GET /api/billing/transactions/:id/invoice.pdf — unduh kwitansi sebagai file
// PDF asli yang dibuat server (bukan print browser). Hanya untuk transaksi
// milik user yang berstatus paid.
func getInvoicePDF(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var tx models.Transaction
		if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).
			Preload("Plan").Preload("User").First(&tx).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Transaksi tidak ditemukan"})
			return
		}
		if tx.Status != "paid" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Kwitansi hanya tersedia untuk transaksi lunas"})
			return
		}

		pdf := buildInvoicePDF(tx)
		filename := strings.ReplaceAll(invoiceNumber(tx.ID, tx.CreatedAt), "/", "-") + ".pdf"
		c.Header("Content-Type", "application/pdf")
		c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
		if err := pdf.Output(c.Writer); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat PDF"})
		}
	}
}

var idMonths = [12]string{"Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"}

func tglIDpdf(t time.Time) string {
	if t.IsZero() {
		return "-"
	}
	return fmt.Sprintf("%02d %s %d", t.Day(), idMonths[int(t.Month())-1], t.Year())
}

func rupiahPDF(n int64) string {
	s := fmt.Sprintf("%d", n)
	neg := ""
	if strings.HasPrefix(s, "-") {
		neg, s = "-", s[1:]
	}
	var out []byte
	for i, ch := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, byte(ch))
	}
	return "Rp " + neg + string(out)
}

func metodeLabelPDF(m string) string {
	if m == "" {
		return "-"
	}
	switch strings.ToLower(m) {
	case "clipkupay":
		return "Clipku Pay (QRIS / VA / E-wallet)"
	case "qris":
		return "QRIS"
	default:
		return strings.ToUpper(m[:1]) + m[1:]
	}
}

// buildInvoicePDF menyusun dokumen kwitansi A4: kop, status LUNAS, meta,
// rincian paket, total, dan catatan kaki. Memakai font inti Helvetica
// (tanpa file font eksternal).
func buildInvoicePDF(tx models.Transaction) *gofpdf.Fpdf {
	const navyR, navyG, navyB = 36, 51, 112
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.SetMargins(18, 16, 18)
	pdf.SetAutoPageBreak(true, 20)
	pdf.AddPage()
	pw, _ := pdf.GetPageSize()
	cw := pw - 36 // lebar konten

	// ── Kop ──
	pdf.SetFont("Helvetica", "B", 22)
	pdf.SetTextColor(navyR, navyG, navyB)
	pdf.Cell(cw-40, 10, "WaGataway")
	// Badge LUNAS di kanan
	pdf.SetFillColor(220, 252, 231)
	pdf.SetDrawColor(34, 197, 94)
	pdf.SetFont("Helvetica", "B", 12)
	pdf.SetTextColor(21, 128, 61)
	x := pdf.GetX()
	pdf.SetX(x + (cw - 40) - 34)
	pdf.CellFormat(34, 9, "LUNAS", "1", 1, "C", true, 0, "")
	pdf.SetFont("Helvetica", "", 11)
	pdf.SetTextColor(100, 116, 139)
	pdf.Cell(cw, 6, "Kwitansi Pembayaran")
	pdf.Ln(10)

	// Garis navy
	pdf.SetDrawColor(navyR, navyG, navyB)
	pdf.SetLineWidth(0.8)
	pdf.Line(18, pdf.GetY(), pw-18, pdf.GetY())
	pdf.Ln(7)

	// ── Meta ──
	nomor := invoiceNumber(tx.ID, tx.CreatedAt)
	paidAt := tx.CreatedAt
	if tx.PaidAt != nil && !tx.PaidAt.IsZero() {
		paidAt = *tx.PaidAt
	}
	metaRow := func(label, value string, bold bool) {
		pdf.SetFont("Helvetica", "", 10)
		pdf.SetTextColor(100, 116, 139)
		pdf.Cell(52, 6.5, label)
		pdf.SetTextColor(30, 41, 59)
		if bold {
			pdf.SetFont("Helvetica", "B", 11)
		} else {
			pdf.SetFont("Helvetica", "", 11)
		}
		pdf.Cell(cw-52, 6.5, value)
		pdf.Ln(6.5)
	}
	metaRow("No. Invoice", nomor, true)
	metaRow("Tanggal Bayar", tglIDpdf(paidAt), false)
	metaRow("Ditagihkan Kepada", tx.User.Name, true)
	if tx.User.Email != "" {
		metaRow("", tx.User.Email, false)
	}
	pdf.Ln(4)

	// ── Rincian ──
	pdf.SetDrawColor(226, 232, 240)
	pdf.SetLineWidth(0.3)
	planName := "Paket WaGataway"
	durasi := 30
	if tx.Plan != nil {
		if tx.Plan.Name != "" {
			planName = tx.Plan.Name
		}
		if tx.Plan.Duration > 0 {
			durasi = tx.Plan.Duration
		}
	}
	end := paidAt.AddDate(0, 0, durasi)
	itemRow := func(label, value string) {
		y := pdf.GetY()
		pdf.SetFont("Helvetica", "", 10)
		pdf.SetTextColor(100, 116, 139)
		pdf.Cell(52, 8, label)
		pdf.SetFont("Helvetica", "", 11)
		pdf.SetTextColor(30, 41, 59)
		pdf.Cell(cw-52, 8, value)
		pdf.Ln(8)
		pdf.Line(18, y+8, pw-18, y+8)
	}
	itemRow("Paket", planName)
	itemRow("Periode Aktif", tglIDpdf(paidAt)+" - "+tglIDpdf(end))
	itemRow("Metode Pembayaran", metodeLabelPDF(tx.PaymentMethod))
	pdf.Ln(5)

	// ── Total ──
	pdf.SetFillColor(240, 243, 255)
	pdf.SetDrawColor(navyR, navyG, navyB)
	pdf.SetLineWidth(0.4)
	y := pdf.GetY()
	pdf.Rect(18, y, cw, 16, "DF")
	pdf.SetXY(24, y+2)
	pdf.SetFont("Helvetica", "B", 12)
	pdf.SetTextColor(navyR, navyG, navyB)
	pdf.Cell(60, 12, "Total Dibayar")
	pdf.SetFont("Helvetica", "B", 18)
	pdf.CellFormat(cw-72, 12, rupiahPDF(tx.Amount), "", 0, "R", false, 0, "")
	pdf.SetY(y + 22)

	// ── Catatan ──
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetTextColor(148, 163, 184)
	pdf.MultiCell(cw, 5, "Kwitansi ini dibuat otomatis oleh sistem WaGataway dan sah tanpa tanda tangan basah. Simpan nomor invoice untuk keperluan administrasi.", "", "L", false)

	return pdf
}
