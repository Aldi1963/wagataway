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

// (Font tanda tangan di-embed dari internal/handler/assets/fonts via assets_embed.go.)

// GET /api/billing/transactions/:id/invoice.pdf — unduh kwitansi sebagai file
// PDF resmi yang dibuat server (kop, tabel rincian, terbilang, stempel LUNAS,
// blok tanda tangan). Hanya untuk transaksi milik user yang berstatus paid.
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
	for i := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			out = append(out, '.')
		}
		out = append(out, s[i])
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

var idNumWords = []string{"", "Satu", "Dua", "Tiga", "Empat", "Lima", "Enam", "Tujuh", "Delapan", "Sembilan", "Sepuluh", "Sebelas"}

// terbilangID mengubah angka menjadi kata Bahasa Indonesia,
// mis. 175000 -> "Seratus Tujuh Puluh Lima Ribu".
func terbilangID(n int64) string {
	switch {
	case n < 0:
		return "Minus " + terbilangID(-n)
	case n < 12:
		return idNumWords[n]
	case n < 20:
		return terbilangID(n-10) + " Belas"
	case n < 100:
		s := terbilangID(n/10) + " Puluh"
		if n%10 > 0 {
			s += " " + terbilangID(n%10)
		}
		return s
	case n < 200:
		s := "Seratus"
		if n%100 > 0 {
			s += " " + terbilangID(n%100)
		}
		return s
	case n < 1000:
		s := terbilangID(n/100) + " Ratus"
		if n%100 > 0 {
			s += " " + terbilangID(n%100)
		}
		return s
	case n < 2000:
		s := "Seribu"
		if n%1000 > 0 {
			s += " " + terbilangID(n%1000)
		}
		return s
	case n < 1000000:
		s := terbilangID(n/1000) + " Ribu"
		if n%1000 > 0 {
			s += " " + terbilangID(n%1000)
		}
		return s
	case n < 1000000000:
		s := terbilangID(n/1000000) + " Juta"
		if n%1000000 > 0 {
			s += " " + terbilangID(n%1000000)
		}
		return s
	case n < 1000000000000:
		s := terbilangID(n/1000000000) + " Miliar"
		if n%1000000000 > 0 {
			s += " " + terbilangID(n%1000000000)
		}
		return s
	default:
		s := terbilangID(n/1000000000000) + " Triliun"
		if n%1000000000000 > 0 {
			s += " " + terbilangID(n%1000000000000)
		}
		return s
	}
}

// buildInvoicePDF menyusun invoice resmi A4: kop perusahaan, info tagihan,
// tabel rincian + terbilang + total, stempel LUNAS, dan blok tanda tangan
// (font script GreatVibes, lisensi OFL, di-embed dari assets/fonts).
func buildInvoicePDF(tx models.Transaction) *gofpdf.Fpdf {
	const navyR, navyG, navyB = 36, 51, 112
	pdf := gofpdf.New("P", "mm", "A4", "")
	pdf.AddUTF8FontFromBytes("GreatVibes", "", signatureFont)
	pdf.SetMargins(15, 14, 15)
	pdf.SetAutoPageBreak(true, 18)
	pdf.AddPage()
	pw, _ := pdf.GetPageSize()
	cw := pw - 30 // lebar konten
	L, R := 15.0, pw-15

	paidAt := tx.CreatedAt
	if tx.PaidAt != nil && !tx.PaidAt.IsZero() {
		paidAt = *tx.PaidAt
	}
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
	nomor := invoiceNumber(tx.ID, tx.CreatedAt)

	// ── Kop: kiri identitas usaha, kanan judul + nomor ──
	pdf.SetXY(L, 14)
	pdf.SetFont("Helvetica", "B", 22)
	pdf.SetTextColor(navyR, navyG, navyB)
	pdf.Cell(95, 9, "WaGataway")
	pdf.SetXY(L, 23.5)
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetTextColor(100, 116, 139)
	pdf.Cell(95, 5, "Jakarta, Indonesia")
	pdf.SetXY(L, 28.5)
	pdf.Cell(95, 5, "wa.clipku.com")

	pdf.SetXY(R-95, 13)
	pdf.SetFont("Helvetica", "B", 26)
	pdf.SetTextColor(30, 41, 59)
	pdf.CellFormat(95, 11, "INVOICE", "", 0, "R", false, 0, "")
	pdf.SetXY(R-95, 25)
	pdf.SetFont("Helvetica", "", 10)
	pdf.SetTextColor(100, 116, 139)
	pdf.CellFormat(95, 5.5, "No. "+nomor, "", 0, "R", false, 0, "")
	pdf.SetXY(R-95, 30.5)
	pdf.CellFormat(95, 5.5, "Tanggal: "+tglIDpdf(paidAt), "", 0, "R", false, 0, "")

	y := 39.0
	pdf.SetDrawColor(navyR, navyG, navyB)
	pdf.SetLineWidth(0.9)
	pdf.Line(L, y, R, y)
	y += 7

	// ── Ditagihkan kepada | Metode pembayaran ──
	pdf.SetXY(L, y)
	pdf.SetFont("Helvetica", "B", 8)
	pdf.SetTextColor(100, 116, 139)
	pdf.Cell(90, 5, "DITAGIHKAN KEPADA")
	pdf.SetXY(R-90, y)
	pdf.Cell(90, 5, "METODE PEMBAYARAN")
	y += 5
	pdf.SetXY(L, y)
	pdf.SetFont("Helvetica", "B", 12)
	pdf.SetTextColor(30, 41, 59)
	pdf.Cell(90, 6.5, tx.User.Name)
	pdf.SetXY(R-90, y)
	pdf.SetFont("Helvetica", "", 10)
	pdf.Cell(90, 6.5, metodeLabelPDF(tx.PaymentMethod))
	y += 6.5
	if tx.User.Email != "" {
		pdf.SetXY(L, y)
		pdf.SetFont("Helvetica", "", 10)
		pdf.SetTextColor(100, 116, 139)
		pdf.Cell(90, 5.5, tx.User.Email)
		y += 5.5
	}
	y += 6

	// ── Tabel rincian ──
	colW := []float64{cw - 20 - 38 - 38, 20, 38, 38}
	headers := []string{"DESKRIPSI", "QTY", "HARGA", "JUMLAH"}
	pdf.SetFillColor(navyR, navyG, navyB)
	pdf.SetTextColor(255, 255, 255)
	pdf.SetFont("Helvetica", "B", 10)
	x := L
	for i, h := range headers {
		align := "L"
		if i == 1 {
			align = "C"
		} else if i > 1 {
			align = "R"
		}
		pdf.SetXY(x, y)
		pdf.CellFormat(colW[i], 9, h, "", 0, align, true, 0, "")
		x += colW[i]
	}
	y += 9

	rowH := 17.0
	pdf.SetDrawColor(226, 232, 240)
	pdf.SetLineWidth(0.3)
	pdf.Rect(L, y, cw, rowH, "D")
	x = L
	for i := 0; i < 3; i++ {
		x += colW[i]
		pdf.Line(x, y, x, y+rowH)
	}
	pdf.SetXY(L+3, y+2.5)
	pdf.SetFont("Helvetica", "B", 10)
	pdf.SetTextColor(30, 41, 59)
	pdf.Cell(colW[0]-6, 6, fmt.Sprintf("Langganan Paket %s (%d hari)", planName, durasi))
	pdf.SetXY(L+3, y+9)
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetTextColor(100, 116, 139)
	pdf.Cell(colW[0]-6, 5, fmt.Sprintf("Periode %s - %s", tglIDpdf(paidAt), tglIDpdf(end)))
	pdf.SetXY(L+colW[0], y)
	pdf.SetFont("Helvetica", "", 10)
	pdf.SetTextColor(30, 41, 59)
	pdf.CellFormat(colW[1], rowH, "1", "", 0, "C", false, 0, "")
	pdf.SetXY(L+colW[0]+colW[1], y)
	pdf.CellFormat(colW[2], rowH, rupiahPDF(tx.Amount), "", 0, "R", false, 0, "")
	pdf.SetXY(L+colW[0]+colW[1]+colW[2], y)
	pdf.SetFont("Helvetica", "B", 10)
	pdf.CellFormat(colW[3], rowH, rupiahPDF(tx.Amount), "", 0, "R", false, 0, "")
	y += rowH

	// Terbilang
	pdf.SetXY(L, y)
	pdf.SetFont("Helvetica", "I", 9)
	pdf.SetTextColor(71, 85, 105)
	pdf.CellFormat(cw, 8.5, fmt.Sprintf("Terbilang: \"%s Rupiah\"", terbilangID(tx.Amount)), "1", 1, "L", false, 0, "")
	y += 8.5

	// Total
	pdf.SetFillColor(238, 242, 255)
	pdf.SetXY(L, y)
	pdf.SetFont("Helvetica", "B", 11)
	pdf.SetTextColor(navyR, navyG, navyB)
	pdf.CellFormat(cw-48, 11, "TOTAL", "1", 0, "R", true, 0, "")
	pdf.SetFont("Helvetica", "B", 14)
	pdf.CellFormat(48, 11, rupiahPDF(tx.Amount), "1", 1, "R", true, 0, "")
	y += 11 + 12

	// ── Stempel LUNAS (kiri) + blok tanda tangan (kanan) ──
	sx, sy := L+26.0, y+15
	pdf.SetDrawColor(22, 163, 74)
	pdf.SetTextColor(22, 163, 74)
	pdf.TransformBegin()
	pdf.TransformRotate(-12, sx, sy)
	pdf.SetLineWidth(1.1)
	pdf.Circle(sx, sy, 18, "D")
	pdf.SetLineWidth(0.5)
	pdf.Circle(sx, sy, 15, "D")
	pdf.SetFont("Helvetica", "B", 16)
	pdf.SetXY(sx-18, sy-6)
	pdf.CellFormat(36, 9, "LUNAS", "", 0, "C", false, 0, "")
	pdf.SetFont("Helvetica", "B", 7)
	pdf.SetXY(sx-18, sy+3)
	pdf.CellFormat(36, 6, "WAGATAWAY", "", 0, "C", false, 0, "")
	pdf.TransformEnd()

	bx := R - 72
	pdf.SetXY(bx, y)
	pdf.SetFont("Helvetica", "", 10)
	pdf.SetTextColor(30, 41, 59)
	pdf.Cell(72, 6, "Jakarta, "+tglIDpdf(paidAt))
	pdf.SetXY(bx, y+7)
	pdf.Cell(72, 6, "Hormat kami,")
	pdf.SetXY(bx, y+13)
	pdf.SetFont("GreatVibes", "", 36)
	pdf.SetTextColor(navyR, navyG, navyB)
	pdf.Cell(72, 17, "WaGataway")
	pdf.SetXY(bx, y+33)
	pdf.SetFont("Helvetica", "B", 10)
	pdf.SetTextColor(30, 41, 59)
	pdf.Cell(72, 6, "( Tim Finance )")
	pdf.SetXY(bx, y+39)
	pdf.SetFont("Helvetica", "", 9)
	pdf.SetTextColor(100, 116, 139)
	pdf.Cell(72, 5, "Finance - WaGataway")
	y += 52

	// ── Catatan kaki ──
	pdf.SetDrawColor(226, 232, 240)
	pdf.SetLineWidth(0.3)
	pdf.Line(L, y, R, y)
	y += 4
	pdf.SetXY(L, y)
	pdf.SetFont("Helvetica", "", 8)
	pdf.SetTextColor(148, 163, 184)
	pdf.MultiCell(cw, 4.5, "Dokumen ini dibuat otomatis oleh sistem WaGataway. Simpan nomor invoice untuk keperluan administrasi.", "", "L", false)

	return pdf
}
