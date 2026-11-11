package whatsapp

// Bot katalog + order via WA (Fitur premium: Katalog produk).
//
// Alur: pelanggan mengetik "katalog" / "order" / "belanja" → bot mengirim
// daftar produk bernomor (harga + stok). Pelanggan membalas angka untuk
// menambah ke keranjang ("2" = tambah 1; "2 3" = produk 2 sebanyak 3),
// "keranjang" untuk melihat ringkasan + total otomatis, "checkout" untuk
// membuat order (nomor order unik, status awal pending), "batal" untuk
// membatalkan. Keranjang disimpan di BotCartSession per (device, nomor)
// dan kedaluwarsa setelah 10 menit idle, mengikuti pola MenuBotSession.
//
// checkCatalogBot dipanggil dari handleIncomingMessage SEBELUM menu bot:
// bila ia menangani pesan (sesi keranjang aktif / keyword cocok), menu bot,
// auto-reply & AI reply dilewati agar tidak bentrok. Bot hanya aktif bila
// pemilik device punya ≥1 produk aktif — tanpa produk, keyword dilewati.

import (
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/catalog"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
)

// catalogSessionTimeout: sesi keranjang dianggap kedaluwarsa setelah idle selama ini.
const catalogSessionTimeout = 10 * time.Minute

// catalogTriggers: keyword pemicu (cocok persis, tanpa memperhatikan huruf besar/kecil).
var catalogTriggers = []string{"katalog", "order", "belanja", "pesan"}

// catalogCartItem adalah satu baris keranjang (disimpan sebagai JSON di BotCartSession).
type catalogCartItem struct {
	ProductID uint `json:"productId"`
	Qty       int  `json:"qty"`
}

// checkCatalogBot mengevaluasi pesan masuk terhadap bot katalog.
// Mengembalikan true bila pesan ditangani bot katalog.
func (m *Manager) checkCatalogBot(sess *SessionState, senderJID, senderPhone, senderName, text string, isGroup bool) bool {
	if isGroup {
		return false
	}
	t := strings.TrimSpace(text)
	if t == "" {
		return false
	}

	// 1. Sesi keranjang yang sedang berjalan untuk (device, nomor) ini?
	var s models.BotCartSession
	if err := m.db.Where("device_id = ? AND phone = ?", sess.DeviceID, senderPhone).First(&s).Error; err == nil {
		if time.Since(s.LastActiveAt) > catalogSessionTimeout {
			m.db.Delete(&s)
		} else {
			return m.handleCatalogSession(sess, &s, senderJID, senderPhone, senderName, t)
		}
	}

	// 2. Tidak ada sesi: cocokkan keyword pemicu / tombol interaktif.
	if !isCatalogTrigger(t) {
		return false
	}
	products := m.listCatalogProducts(sess.UserID)
	if len(products) == 0 {
		return false // tanpa produk aktif, keyword dilewati (bukan urusan katalog)
	}
	m.startCatalogSession(sess, senderJID, senderPhone, products)
	return true
}

// isCatalogTrigger: true bila teks adalah keyword katalog atau id tombol katalog.
func isCatalogTrigger(text string) bool {
	tl := strings.ToLower(strings.TrimSpace(text))
	if strings.HasPrefix(tl, "catalog:") {
		return true
	}
	for _, kw := range catalogTriggers {
		if tl == kw {
			return true
		}
	}
	return false
}

// listCatalogProducts memuat produk aktif milik user, urut ID naik
// (penomoran katalog di chat mengikuti urutan ini secara deterministik).
func (m *Manager) listCatalogProducts(userID uint) []models.BotProduct {
	var products []models.BotProduct
	m.db.Where("user_id = ? AND is_active = ?", userID, true).
		Order("id ASC").Find(&products)
	return products
}

// startCatalogSession membuat sesi keranjang baru lalu mengirim daftar katalog.
func (m *Manager) startCatalogSession(sess *SessionState, senderJID, senderPhone string, products []models.BotProduct) {
	m.db.Where("device_id = ? AND phone = ?", sess.DeviceID, senderPhone).
		Delete(&models.BotCartSession{})
	m.db.Create(&models.BotCartSession{
		UserID:       sess.UserID,
		DeviceID:     sess.DeviceID,
		Phone:        senderPhone,
		ItemsJSON:    "[]",
		LastActiveAt: time.Now(),
	})
	if err := m.SendMessage(sess.DeviceID, senderJID, "text", renderCatalogText(products), ""); err != nil {
		log.Error().Err(err).Str("to", senderPhone).Msg("Katalog: gagal mengirim daftar produk")
	} else {
		log.Info().Str("to", senderPhone).Msg("Katalog: sesi dimulai, daftar produk dikirim")
	}
}

// loadCatalogCart memuat keranjang dari JSON sesi.
func loadCatalogCart(s *models.BotCartSession) []catalogCartItem {
	var cart []catalogCartItem
	if s.ItemsJSON != "" {
		_ = json.Unmarshal([]byte(s.ItemsJSON), &cart)
	}
	if cart == nil {
		cart = []catalogCartItem{}
	}
	return cart
}

// saveCatalogCart menyimpan keranjang + memperbarui LastActiveAt.
func (m *Manager) saveCatalogCart(s *models.BotCartSession, cart []catalogCartItem) {
	raw, _ := json.Marshal(cart)
	s.ItemsJSON = string(raw)
	s.LastActiveAt = time.Now()
	m.db.Model(s).Updates(map[string]interface{}{
		"items_json":     s.ItemsJSON,
		"last_active_at": s.LastActiveAt,
	})
}

// handleCatalogSession memproses satu pesan dari pelanggan yang sedang
// dalam sesi keranjang. Selalu mengembalikan true (pesan dikonsumsi).
func (m *Manager) handleCatalogSession(sess *SessionState, s *models.BotCartSession, senderJID, senderPhone, senderName, text string) bool {
	products := m.listCatalogProducts(sess.UserID)
	if len(products) == 0 {
		m.db.Delete(s)
		_ = m.SendMessage(sess.DeviceID, senderJID, "text", "Maaf, katalog sedang tidak tersedia saat ini.", "")
		return true
	}
	byID := map[uint]models.BotProduct{}
	for _, p := range products {
		byID[p.ID] = p
	}
	cart := loadCatalogCart(s)
	kind, n, qty := parseCatalogInput(text)

	send := func(msg string) {
		if err := m.SendMessage(sess.DeviceID, senderJID, "text", msg, ""); err != nil {
			log.Error().Err(err).Str("to", senderPhone).Msg("Katalog: gagal mengirim balasan")
		}
	}
	// Ringkasan keranjang + tombol interaktif (checkout / lihat katalog / batal).
	sendCart := func() {
		msg := renderCartText(cart, byID)
		if len(cart) == 0 {
			send(msg)
			return
		}
		_, err := m.SendMessageWithOptions(sess.DeviceID, senderJID, SendOptions{
			Type:    "interactive",
			Content: msg,
			Buttons: []Button{
				{ID: "catalog:checkout", Title: "✅ Checkout"},
				{ID: "catalog:catalog", Title: "🛍️ Katalog"},
				{ID: "catalog:cancel", Title: "❌ Batal"},
			},
		})
		if err != nil {
			log.Warn().Err(err).Str("to", senderPhone).Msg("Katalog: tombol interaktif gagal, fallback ke teks")
			send(msg)
		}
	}

	switch kind {
	case "cancel":
		m.db.Delete(s)
		send("Keranjang dibatalkan. Ketik *katalog* bila ingin belanja lagi. 🙂")
		log.Info().Str("to", senderPhone).Msg("Katalog: sesi dibatalkan pelanggan")
		return true

	case "catalog":
		m.saveCatalogCart(s, cart)
		send(renderCatalogText(products))
		return true

	case "cart":
		m.saveCatalogCart(s, cart)
		sendCart()
		return true

	case "checkout":
		if len(cart) == 0 {
			m.saveCatalogCart(s, cart)
			send("Keranjang masih kosong. Balas nomor produk dari katalog untuk menambah barang.")
			return true
		}
		lines := make([]catalog.OrderLine, 0, len(cart))
		for _, it := range cart {
			lines = append(lines, catalog.OrderLine{ProductID: it.ProductID, Quantity: it.Qty})
		}
		order, err := catalog.CreateOrder(m.db, sess.UserID, senderPhone, senderName, "", lines)
		if err != nil {
			m.saveCatalogCart(s, cart)
			if strings.Contains(err.Error(), "stok tidak mencukupi") {
				send("Maaf, " + err.Error() + "\n\nKetik *keranjang* untuk menyesuaikan jumlah, atau *katalog* untuk melihat stok terbaru.")
			} else {
				send("Maaf, pesanan gagal dibuat: " + err.Error())
			}
			log.Warn().Err(err).Str("to", senderPhone).Msg("Katalog: checkout gagal")
			return true
		}
		m.db.Delete(s)
		send(renderOrderConfirmation(order))
		log.Info().Str("orderNumber", order.OrderNumber).Str("to", senderPhone).Msg("Katalog: order dibuat via chat")
		return true

	case "add", "set":
		if n < 1 || n > len(products) {
			m.saveCatalogCart(s, cart)
			send("Nomor produk tidak valid. Balas nomor 1–" + strconv.Itoa(len(products)) + " dari katalog, atau ketik *katalog* untuk melihat daftar lagi.")
			return true
		}
		p := products[n-1]
		if kind == "add" {
			cart, _ = cartAdd(cart, p, 1)
		} else {
			cart = cartSet(cart, p, qty)
		}
		m.saveCatalogCart(s, cart)
		sendCart()
		return true

	default: // "invalid"
		m.saveCatalogCart(s, cart)
		send("Perintah tidak dikenali. Balas nomor produk untuk menambah ke keranjang, atau:\n• *keranjang* — lihat keranjang\n• *checkout* — selesaikan pesanan\n• *katalog* — lihat daftar produk\n• *batal* — batalkan belanja")
		return true
	}
}

// parseCatalogInput mengklasifikasikan input pelanggan:
// "cancel", "catalog", "cart", "checkout", "add"+n (qty 1),
// "set"+n+qty ("2 3" / "2x3"), "invalid" untuk sisanya.
func parseCatalogInput(text string) (kind string, n int, qty int) {
	t := strings.ToLower(strings.TrimSpace(text))
	switch t {
	case "catalog:cancel", "0", "batal", "cancel":
		return "cancel", 0, 0
	case "catalog:catalog", "katalog", "order", "belanja", "pesan":
		return "catalog", 0, 0
	case "catalog:cart", "keranjang", "cart":
		return "cart", 0, 0
	case "catalog:checkout", "checkout", "bayar", "co":
		return "checkout", 0, 0
	}
	// "N Q" atau "N x Q" (spasi / x / × sebagai pemisah).
	fields := strings.FieldsFunc(t, func(r rune) bool {
		return r == ' ' || r == 'x' || r == '×' || r == ','
	})
	if len(fields) == 2 {
		n, err1 := strconv.Atoi(fields[0])
		q, err2 := strconv.Atoi(fields[1])
		if err1 == nil && err2 == nil && n > 0 && q >= 0 {
			return "set", n, q
		}
		return "invalid", 0, 0
	}
	if len(fields) == 1 {
		if num, err := strconv.Atoi(fields[0]); err == nil && num > 0 {
			return "add", num, 1
		}
	}
	return "invalid", 0, 0
}

// cartAdd menambah qty produk ke keranjang, dibatasi stok yang tersedia.
// Mengembalikan keranjang baru + catatan bila jumlah dibatasi stok.
func cartAdd(cart []catalogCartItem, p models.BotProduct, qty int) ([]catalogCartItem, string) {
	if p.Stock <= 0 {
		return cart, "stok habis"
	}
	for i := range cart {
		if cart[i].ProductID == p.ID {
			if cart[i].Qty+qty > p.Stock {
				cart[i].Qty = p.Stock
				return cart, "dibatasi stok"
			}
			cart[i].Qty += qty
			return cart, ""
		}
	}
	q := qty
	note := ""
	if q > p.Stock {
		q = p.Stock
		note = "dibatasi stok"
	}
	return append(cart, catalogCartItem{ProductID: p.ID, Qty: q}), note
}

// cartSet mengatur jumlah produk di keranjang (qty 0 = hapus dari keranjang).
func cartSet(cart []catalogCartItem, p models.BotProduct, qty int) []catalogCartItem {
	if qty <= 0 {
		out := cart[:0]
		for _, it := range cart {
			if it.ProductID != p.ID {
				out = append(out, it)
			}
		}
		return out
	}
	if qty > p.Stock {
		qty = p.Stock
	}
	for i := range cart {
		if cart[i].ProductID == p.ID {
			cart[i].Qty = qty
			return cart
		}
	}
	return append(cart, catalogCartItem{ProductID: p.ID, Qty: qty})
}

// cartTotal menghitung total harga keranjang dari harga katalog saat ini.
func cartTotal(cart []catalogCartItem, byID map[uint]models.BotProduct) int64 {
	var total int64
	for _, it := range cart {
		if p, ok := byID[it.ProductID]; ok {
			total += p.Price * int64(it.Qty)
		}
	}
	return total
}

// formatCatalogRupiah memformat nominal ala id-ID: "Rp25.000".
func formatCatalogRupiah(n int64) string {
	s := strconv.FormatInt(n, 10)
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
	return "Rp" + neg + string(out)
}

// renderCatalogText merangkai daftar produk bernomor untuk chat.
func renderCatalogText(products []models.BotProduct) string {
	var b strings.Builder
	b.WriteString("🛍️ *Katalog Produk*\n")
	for i, p := range products {
		fmt.Fprintf(&b, "\n%d. %s", i+1, p.Name)
		if p.Category != "" {
			fmt.Fprintf(&b, " (%s)", p.Category)
		}
		fmt.Fprintf(&b, "\n   %s • Stok: %d", formatCatalogRupiah(p.Price), p.Stock)
		if p.Description != "" {
			fmt.Fprintf(&b, "\n   %s", p.Description)
		}
	}
	b.WriteString("\n\nBalas nomor produk untuk menambah ke keranjang (mis. *2*), atau *2 3* untuk 3 buah.")
	b.WriteString("\n• *keranjang* — lihat keranjang & total\n• *checkout* — selesaikan pesanan\n• *batal* — batalkan belanja")
	return b.String()
}

// renderCartText merangkai ringkasan keranjang + total otomatis.
func renderCartText(cart []catalogCartItem, byID map[uint]models.BotProduct) string {
	if len(cart) == 0 {
		return "🛒 Keranjang masih kosong.\n\nKetik *katalog* untuk melihat produk, lalu balas nomor produk untuk menambah."
	}
	var b strings.Builder
	b.WriteString("🛒 *Keranjang Belanja*\n")
	for _, it := range cart {
		p, ok := byID[it.ProductID]
		if !ok {
			continue
		}
		fmt.Fprintf(&b, "\n• %s x%d — %s", p.Name, it.Qty, formatCatalogRupiah(p.Price*int64(it.Qty)))
	}
	fmt.Fprintf(&b, "\n\n*Total: %s*", formatCatalogRupiah(cartTotal(cart, byID)))
	b.WriteString("\n\nBalas *checkout* untuk memesan, *katalog* untuk tambah barang, atau *batal* untuk membatalkan.")
	return b.String()
}

// renderOrderConfirmation merangkai konfirmasi order untuk pelanggan.
func renderOrderConfirmation(order *models.BotOrder) string {
	var b strings.Builder
	fmt.Fprintf(&b, "✅ *Pesanan Diterima!*\n\nNomor order: *%s*\n", order.OrderNumber)
	for _, it := range order.Items {
		fmt.Fprintf(&b, "• %s x%d — %s\n", it.ProductName, it.Quantity, formatCatalogRupiah(it.Subtotal))
	}
	fmt.Fprintf(&b, "\n*Total: %s*\nStatus: Menunggu konfirmasi", formatCatalogRupiah(order.Total))
	b.WriteString("\n\nTerima kasih! Kami akan segera mengonfirmasi pesanan Anda. 🙏")
	return b.String()
}
