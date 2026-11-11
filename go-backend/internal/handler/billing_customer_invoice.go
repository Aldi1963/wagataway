package handler

import (
	"crypto/rand"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// ── Tagihan pelanggan (Item 3): invoice + QRIS Clipku Pay di WA ─────────────
// Invoice dibuat dari panel (bukan langganan), dibayar pelanggan via QRIS
// dinamis Clipku Pay, dan status lunas terdeteksi otomatis lewat webhook
// Clipku Pay yang sama (lihat clipkupay.go: handleClipkuInvoiceWebhook).
//
// FAIL-CLOSED: selama payment gateway belum dikonfigurasi (tanpa API key dan
// tanpa CLI bridge), pembuatan invoice ditolak 503 dengan pesan jelas —
// tidak pernah membuat invoice yang pura-pura bisa dibayar.

// errClipkuNotConfigured adalah pesan fail-closed saat gateway belum siap.
const errClipkuNotConfigured = "Kunci Clipku Pay belum dikonfigurasi — tempel kunci di Pengaturan → Payment Gateway sebelum membuat tagihan"

func registerCustomerInvoiceRoutes(b *gin.RouterGroup, cfg *config.Config, db *gorm.DB, wm waSender) {
	b.GET("/invoices", listCustomerInvoices(db))
	b.POST("/invoices", createCustomerInvoice(cfg, db))
	b.GET("/invoices/:id", getCustomerInvoice(cfg, db, wm))
	b.POST("/invoices/:id/send", sendCustomerInvoice(cfg, db, wm))
	b.POST("/invoices/:id/cancel", cancelCustomerInvoice(db))
}

// newCustomerInvoiceOrderID membuat ID order unik untuk Clipku Pay:
// WAG-INV-<userID>-<UnixNano>-<acak hex>. Prefix INV membedakannya dari
// order langganan (WAG-<userID>-...) agar webhook mudah membedakan jenisnya.
func newCustomerInvoiceOrderID(userID uint) string {
	var rb [3]byte
	if _, err := rand.Read(rb[:]); err != nil {
		return fmt.Sprintf("WAG-INV-%d-%d", userID, time.Now().UnixNano())
	}
	return fmt.Sprintf("WAG-INV-%d-%d-%x", userID, time.Now().UnixNano(), rb)
}

// customerInvoiceNumber mengembalikan nomor invoice deterministik dari ID:
// INV-C/<tahun>/<bulan romawi>/<id 6 digit>.
func customerInvoiceNumber(invID uint, createdAt time.Time) string {
	romans := [12]string{"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"}
	m := int(createdAt.Month())
	if m < 1 || m > 12 {
		m = 1
	}
	return fmt.Sprintf("INV-C/%04d/%s/%06d", createdAt.Year(), romans[m-1], invID)
}

// invoiceItemsTotal menjumlahkan qty*price semua item.
func invoiceItemsTotal(items []models.CustomerInvoiceItem) int64 {
	var total int64
	for _, it := range items {
		total += int64(it.Qty) * it.Price
	}
	return total
}

// validateInvoiceItems memeriksa item tagihan: minimal 1, deskripsi terisi,
// qty >= 1, harga satuan > 0. Mengembalikan pesan error ("" bila valid).
func validateInvoiceItems(items []models.CustomerInvoiceItem) string {
	if len(items) == 0 {
		return "Minimal satu item tagihan wajib diisi"
	}
	if len(items) > 50 {
		return "Maksimal 50 item per tagihan"
	}
	for _, it := range items {
		if strings.TrimSpace(it.Description) == "" {
			return "Deskripsi item tidak boleh kosong"
		}
		if it.Qty < 1 {
			return "Jumlah item minimal 1"
		}
		if it.Price <= 0 {
			return "Harga item harus lebih dari 0"
		}
	}
	return ""
}

func encodeInvoiceItems(items []models.CustomerInvoiceItem) string {
	b, _ := json.Marshal(items)
	return string(b)
}

func decodeInvoiceItems(raw string) []models.CustomerInvoiceItem {
	var items []models.CustomerInvoiceItem
	if raw == "" {
		return items
	}
	_ = json.Unmarshal([]byte(raw), &items)
	if items == nil {
		items = []models.CustomerInvoiceItem{}
	}
	return items
}

// fillInvoiceView mengisi field turunan (nomor + items) untuk respons API.
func fillInvoiceView(inv *models.CustomerInvoice) {
	inv.InvoiceNumber = customerInvoiceNumber(inv.ID, inv.CreatedAt)
	inv.ItemsList = decodeInvoiceItems(inv.Items)
}

// expireOverdueCustomerInvoices menandai invoice pending yang jatuh temponya
// sudah lewat menjadi expired. Dipakai scheduler (per jam) dan lazy-expiry
// di handler list/detail. Idempoten; mengembalikan jumlah baris berubah.
func expireOverdueCustomerInvoices(db *gorm.DB, now time.Time) (int64, error) {
	res := db.Model(&models.CustomerInvoice{}).
		Where("status = ? AND due_date IS NOT NULL AND due_date < ?", "pending", now).
		Update("status", "expired")
	return res.RowsAffected, res.Error
}

// parseDueDate menerima "2006-01-02" (input tanggal panel) atau RFC3339.
func parseDueDate(s string) (time.Time, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return time.Time{}, nil
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t, nil
	}
	return time.ParseInLocation("2006-01-02", s, time.Local)
}

type createInvoiceRequest struct {
	ContactID     *uint                        `json:"contactId"`
	CustomerName  string                       `json:"customerName"`
	CustomerPhone string                       `json:"customerPhone"`
	CustomerEmail string                       `json:"customerEmail"`
	Items         []models.CustomerInvoiceItem `json:"items"`
	DueDate       string                       `json:"dueDate"`
	Notes         string                       `json:"notes"`
}

// POST /api/billing/invoices — buat tagihan pelanggan + transaksi QRIS
// Clipku Pay (dinamis, nominal sama persis dengan total tagihan).
// Fail-closed 503 bila gateway belum dikonfigurasi.
func createCustomerInvoice(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

		var req createInvoiceRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tagihan tidak valid"})
			return
		}
		if msg := validateInvoiceItems(req.Items); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": msg})
			return
		}
		total := invoiceItemsTotal(req.Items)
		if total <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Total tagihan harus lebih dari 0"})
			return
		}

		// Identitas pelanggan: dari kontak (bila dipilih) atau input manual.
		name := strings.TrimSpace(req.CustomerName)
		phone := strings.TrimSpace(req.CustomerPhone)
		email := strings.TrimSpace(req.CustomerEmail)
		var contactID *uint
		if req.ContactID != nil {
			var contact models.Contact
			if err := udb.Where("id = ? AND user_id = ?", *req.ContactID, userID).First(&contact).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"message": "Kontak tidak ditemukan"})
				return
			}
			contactID = req.ContactID
			if name == "" {
				name = contact.Name
			}
			if phone == "" {
				phone = contact.Phone
			}
			if email == "" {
				email = contact.Email
			}
		}
		if name == "" || phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Nama dan nomor WhatsApp pelanggan wajib diisi"})
			return
		}

		due, err := parseDueDate(req.DueDate)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Tanggal jatuh tempo tidak valid"})
			return
		}
		if due.IsZero() {
			// Default: jatuh tempo 7 hari dari sekarang (batas wajar QRIS).
			d := time.Now().AddDate(0, 0, 7)
			due = d
		}
		if due.Before(time.Now().Add(-time.Minute)) {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Tanggal jatuh tempo sudah lewat"})
			return
		}

		// FAIL-CLOSED: tanpa gateway, invoice tidak dibuat sama sekali.
		kp := newClipkuPayClient(cfg, udb)
		if !kp.enabled() {
			c.JSON(http.StatusServiceUnavailable, gin.H{"message": errClipkuNotConfigured, "code": "CLIPKUPAY_NOT_CONFIGURED"})
			return
		}

		// Buat transaksi QRIS dinamis di Clipku Pay dulu (nominal = total
		// tagihan persis); bila gagal, tidak ada baris invoice yatim.
		orderID := newCustomerInvoiceOrderID(userID)
		data, err := kp.createTransaction(orderID, total, name, email)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"message": "Gagal membuat pembayaran: " + err.Error()})
			return
		}

		inv := models.CustomerInvoice{
			UserID:        userID,
			ContactID:     contactID,
			CustomerName:  name,
			CustomerPhone: phone,
			CustomerEmail: email,
			Items:         encodeInvoiceItems(req.Items),
			Amount:        total,
			Notes:         strings.TrimSpace(req.Notes),
			DueDate:       &due,
			Status:        "pending",
			ExternalID:    orderID,
			PaymentURL:    data.PaymentURL,
			QrURL:         data.QrURL,
		}
		if err := udb.Create(&inv).Error; err != nil {
			log.Error().Err(err).Str("orderID", orderID).
				Msg("Tagihan pelanggan gagal disimpan setelah transaksi Clipku Pay dibuat")
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan tagihan"})
			return
		}
		fillInvoiceView(&inv)
		c.JSON(http.StatusCreated, gin.H{"invoice": inv})
	}
}

// GET /api/billing/invoices?status=pending|paid|expired|cancelled
func listCustomerInvoices(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		// Lazy-expiry: tagihan yang jatuh temponya lewat langsung terlihat
		// expired tanpa menunggu scheduler.
		_, _ = expireOverdueCustomerInvoices(udb, time.Now())

		status := strings.ToLower(strings.TrimSpace(c.Query("status")))
		q := udb.Where("user_id = ?", userID)
		switch status {
		case "pending", "paid", "expired", "cancelled":
			q = q.Where("status = ?", status)
		case "":
			// semua status
		default:
			c.JSON(http.StatusBadRequest, gin.H{"message": "Filter status tidak dikenal"})
			return
		}
		var invs []models.CustomerInvoice
		if err := q.Order("created_at DESC").Limit(100).Find(&invs).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memuat tagihan"})
			return
		}
		for i := range invs {
			fillInvoiceView(&invs[i])
		}
		c.JSON(http.StatusOK, gin.H{"invoices": invs})
	}
}

// syncInvoiceFromClipkuPay menyinkronkan satu invoice pending dari Clipku
// Pay (sumber kebenaran), mengikuti pola getBillingTransaction: paid +
// nominal cukup → lunas (+ notifikasi WA ke pelanggan); status terminal
// non-paid → sinkronkan (failed dipetakan ke expired).
func syncInvoiceFromClipkuPay(cfg *config.Config, db *gorm.DB, wm waSender, inv *models.CustomerInvoice) {
	kp := newClipkuPayClient(cfg, db)
	if !kp.enabled() || inv.ExternalID == "" {
		return
	}
	remote, err := kp.getTransaction(inv.ExternalID)
	if err != nil {
		return
	}
	if clipkuIsPaid(remote.Status) {
		if clipkuAmountSufficient(remote, inv.Amount) {
			_, _ = markCustomerInvoicePaid(db, wm, inv.ID)
			db.First(inv, inv.ID)
			fillInvoiceView(inv)
		}
		return
	}
	st := strings.ToLower(strings.TrimSpace(remote.Status))
	switch st {
	case "expired", "cancelled":
		db.Model(inv).Update("status", st)
		inv.Status = st
	case "failed":
		db.Model(inv).Update("status", "expired")
		inv.Status = "expired"
	}
}

// GET /api/billing/invoices/:id — detail + sinkron status bila pending.
func getCustomerInvoice(cfg *config.Config, db *gorm.DB, wm waSender) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var inv models.CustomerInvoice
		if err := udb.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&inv).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Tagihan tidak ditemukan"})
			return
		}
		// Lazy-expiry untuk baris ini.
		if inv.Status == "pending" && inv.DueDate != nil && inv.DueDate.Before(time.Now()) {
			udb.Model(&inv).Update("status", "expired")
			inv.Status = "expired"
		}
		if inv.Status == "pending" {
			syncInvoiceFromClipkuPay(cfg, udb, wm, &inv)
		}
		fillInvoiceView(&inv)
		c.JSON(http.StatusOK, gin.H{"invoice": inv})
	}
}

// buildInvoiceWAMessage menyusun pesan WA tagihan: rincian item + total +
// jatuh tempo + tautan bayar QRIS.
func buildInvoiceWAMessage(inv *models.CustomerInvoice) string {
	var b strings.Builder
	fmt.Fprintf(&b, "Halo %s,\n\n", inv.CustomerName)
	fmt.Fprintf(&b, "Berikut tagihan Anda %s:\n", customerInvoiceNumber(inv.ID, inv.CreatedAt))
	for _, it := range decodeInvoiceItems(inv.Items) {
		fmt.Fprintf(&b, "• %s x%d — %s\n", it.Description, it.Qty, formatRupiahID(int64(it.Qty)*it.Price))
	}
	fmt.Fprintf(&b, "\nTotal: %s\n", formatRupiahID(inv.Amount))
	if inv.DueDate != nil {
		fmt.Fprintf(&b, "Jatuh tempo: %s\n", tglIDSingkat(*inv.DueDate))
	}
	if strings.TrimSpace(inv.Notes) != "" {
		fmt.Fprintf(&b, "Catatan: %s\n", strings.TrimSpace(inv.Notes))
	}
	if inv.PaymentURL != "" {
		fmt.Fprintf(&b, "\nBayar via QRIS di sini:\n%s\n", inv.PaymentURL)
	}
	b.WriteString("\nTerima kasih.")
	return b.String()
}

// POST /api/billing/invoices/:id/send — kirim (ulang) tagihan via WA ke
// nomor pelanggan, memakai device connected milik user. Idempoten terhadap
// tautan bayar: PaymentURL yang sudah ada dipakai ulang, bukan membuat
// transaksi Clipku Pay baru (satu invoice = satu QRIS).
func sendCustomerInvoice(cfg *config.Config, db *gorm.DB, wm waSender) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var inv models.CustomerInvoice
		if err := udb.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&inv).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Tagihan tidak ditemukan"})
			return
		}
		if inv.Status == "paid" {
			c.JSON(http.StatusConflict, gin.H{"message": "Tagihan sudah lunas"})
			return
		}
		if inv.Status == "cancelled" {
			c.JSON(http.StatusConflict, gin.H{"message": "Tagihan sudah dibatalkan"})
			return
		}
		if inv.Status == "expired" {
			c.JSON(http.StatusConflict, gin.H{"message": "Tagihan sudah kedaluwarsa — buat tagihan baru"})
			return
		}

		// Bila tautan bayar belum ada (mis. invoice lama), buat transaksi
		// QRIS sekarang — tetap fail-closed bila gateway belum siap.
		if inv.PaymentURL == "" {
			kp := newClipkuPayClient(cfg, udb)
			if !kp.enabled() {
				c.JSON(http.StatusServiceUnavailable, gin.H{"message": errClipkuNotConfigured, "code": "CLIPKUPAY_NOT_CONFIGURED"})
				return
			}
			data, err := kp.createTransaction(inv.ExternalID, inv.Amount, inv.CustomerName, inv.CustomerEmail)
			if err != nil {
				c.JSON(http.StatusBadGateway, gin.H{"message": "Gagal membuat pembayaran: " + err.Error()})
				return
			}
			inv.PaymentURL = data.PaymentURL
			inv.QrURL = data.QrURL
			udb.Model(&inv).Updates(map[string]any{"payment_url": data.PaymentURL, "qr_url": data.QrURL})
		}

		// Device connected milik user: prioritas default, lalu id terkecil.
		var dev models.Device
		if err := udb.Where("user_id = ? AND status = ?", userID, "connected").
			Order("is_default DESC, id ASC").First(&dev).Error; err != nil {
			c.JSON(http.StatusConflict, gin.H{"message": "Tidak ada device WhatsApp yang terhubung — hubungkan device dulu"})
			return
		}
		if wm == nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Layanan WhatsApp tidak tersedia"})
			return
		}
		fillInvoiceView(&inv)
		msg := buildInvoiceWAMessage(&inv)
		if err := wm.SendMessageNoQuota(dev.ID, inv.CustomerPhone, "text", msg, ""); err != nil {
			log.Error().Err(err).Uint("invoiceID", inv.ID).
				Msg("Kirim tagihan via WA gagal")
			c.JSON(http.StatusBadGateway, gin.H{"message": "Gagal mengirim pesan WhatsApp: " + err.Error()})
			return
		}
		now := time.Now()
		udb.Model(&inv).Update("sent_at", now)
		inv.SentAt = &now
		c.JSON(http.StatusOK, gin.H{"invoice": inv, "message": "Tagihan dikirim via WhatsApp"})
	}
}

// POST /api/billing/invoices/:id/cancel — batalkan tagihan pending.
func cancelCustomerInvoice(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var inv models.CustomerInvoice
		if err := udb.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&inv).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Tagihan tidak ditemukan"})
			return
		}
		if inv.Status != "pending" {
			c.JSON(http.StatusConflict, gin.H{"message": "Hanya tagihan menunggu yang bisa dibatalkan"})
			return
		}
		if err := udb.Model(&inv).Update("status", "cancelled").Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membatalkan tagihan"})
			return
		}
		inv.Status = "cancelled"
		fillInvoiceView(&inv)
		c.JSON(http.StatusOK, gin.H{"invoice": inv})
	}
}

// markCustomerInvoicePaid menandai invoice lunas (transisi pending/expired
// → paid). Idempoten: pemanggilan ulang mengembalikan paid=false tanpa efek.
// Tepat pada transisi, notifikasi WA dikirim ke pelanggan (kegagalan kirim
// hanya dicatat, tidak menggagalkan status lunas).
func markCustomerInvoicePaid(db *gorm.DB, wm waSender, invoiceID uint) (paid bool, err error) {
	err = db.Transaction(func(tdb *gorm.DB) error {
		var inv models.CustomerInvoice
		if err := tdb.First(&inv, invoiceID).Error; err != nil {
			return err
		}
		if inv.Status == "paid" {
			return nil
		}
		if inv.Status == "cancelled" {
			return nil
		}
		now := time.Now()
		if err := tdb.Model(&inv).Updates(map[string]any{
			"status":  "paid",
			"paid_at": now,
		}).Error; err != nil {
			return err
		}
		paid = true
		return nil
	})
	if err != nil || !paid {
		return paid, err
	}
	_ = notifyCustomerInvoicePaid(db, wm, invoiceID)
	return paid, nil
}

// notifyCustomerInvoicePaid mengirim notifikasi WA ke pelanggan bahwa
// tagihannya sudah lunas. Dilewati diam-diam bila tidak ada device
// connected (hanya log), seperti notifyPaymentSuccess.
func notifyCustomerInvoicePaid(db *gorm.DB, wm waSender, invoiceID uint) error {
	if wm == nil {
		return nil
	}
	var inv models.CustomerInvoice
	if err := db.First(&inv, invoiceID).Error; err != nil {
		return err
	}
	if inv.Status != "paid" || strings.TrimSpace(inv.CustomerPhone) == "" {
		return nil
	}
	var dev models.Device
	if err := db.Where("user_id = ? AND status = ?", inv.UserID, "connected").
		Order("is_default DESC, id ASC").First(&dev).Error; err != nil {
		log.Info().Uint("invoiceID", inv.ID).
			Msg("Notifikasi lunas tagihan dilewati: user tidak punya device connected")
		return nil
	}
	msg := fmt.Sprintf("Pembayaran %s untuk tagihan %s sudah kami terima. Terima kasih.",
		formatRupiahID(inv.Amount), customerInvoiceNumber(inv.ID, inv.CreatedAt))
	if err := wm.SendMessageNoQuota(dev.ID, inv.CustomerPhone, "text", msg, ""); err != nil {
		log.Error().Err(err).Uint("invoiceID", inv.ID).
			Msg("Notifikasi lunas tagihan gagal dikirim")
		return err
	}
	log.Info().Uint("invoiceID", inv.ID).Str("to", inv.CustomerPhone).
		Msg("Notifikasi lunas tagihan terkirim via WA")
	return nil
}
