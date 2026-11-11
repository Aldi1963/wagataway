package whatsapp

import (
	"strings"
	"testing"

	"github.com/Aldi1963/wagataway/internal/database/models"
)

func TestParseCatalogInput(t *testing.T) {
	cases := []struct {
		in       string
		wantKind string
		wantN    int
		wantQty  int
	}{
		{"1", "add", 1, 1},
		{" 3 ", "add", 3, 1},
		{"2 3", "set", 2, 3},
		{"2x3", "set", 2, 3},
		{"2 x 3", "set", 2, 3},
		{"1 0", "set", 1, 0}, // hapus dari keranjang
		{"keranjang", "cart", 0, 0},
		{"cart", "cart", 0, 0},
		{"catalog:cart", "cart", 0, 0},
		{"checkout", "checkout", 0, 0},
		{"bayar", "checkout", 0, 0},
		{"catalog:checkout", "checkout", 0, 0},
		{"katalog", "catalog", 0, 0},
		{"catalog:catalog", "catalog", 0, 0},
		{"batal", "cancel", 0, 0},
		{"0", "cancel", 0, 0},
		{"catalog:cancel", "cancel", 0, 0},
		{"0.5", "invalid", 0, 0},
		{"-1", "invalid", 0, 0},
		{"abc", "invalid", 0, 0},
		{"", "invalid", 0, 0},
		{"1 2 3", "invalid", 0, 0},
		{"2 -1", "invalid", 0, 0},
	}
	for _, c := range cases {
		kind, n, qty := parseCatalogInput(c.in)
		if kind != c.wantKind || n != c.wantN || qty != c.wantQty {
			t.Errorf("parseCatalogInput(%q) = (%q, %d, %d), want (%q, %d, %d)",
				c.in, kind, n, qty, c.wantKind, c.wantN, c.wantQty)
		}
	}
}

func TestFormatCatalogRupiah(t *testing.T) {
	cases := map[int64]string{
		0:       "Rp0",
		25000:   "Rp25.000",
		1500000: "Rp1.500.000",
		-5000:   "Rp-5.000",
	}
	for in, want := range cases {
		if got := formatCatalogRupiah(in); got != want {
			t.Errorf("formatCatalogRupiah(%d) = %q, want %q", in, got, want)
		}
	}
}

func TestCartAddSetTotal(t *testing.T) {
	kopi := models.BotProduct{ID: 1, Name: "Kopi", Price: 10000, Stock: 5}
	teh := models.BotProduct{ID: 2, Name: "Teh", Price: 5000, Stock: 2}
	byID := map[uint]models.BotProduct{1: kopi, 2: teh}

	var cart []catalogCartItem
	cart, _ = cartAdd(cart, kopi, 1)
	cart, _ = cartAdd(cart, kopi, 1)
	cart, _ = cartAdd(cart, teh, 1)
	if got := cartTotal(cart, byID); got != 25000 {
		t.Fatalf("total = %d, want 25000", got)
	}
	// Tambah melebihi stok → dibatasi stok (5).
	cart, note := cartAdd(cart, kopi, 10)
	if note == "" {
		t.Error("penambahan melebihi stok harus memberi catatan")
	}
	if cart[0].Qty != 5 {
		t.Errorf("qty kopi = %d, want 5 (dibatasi stok)", cart[0].Qty)
	}
	// Set qty 0 = hapus.
	cart = cartSet(cart, teh, 0)
	if len(cart) != 1 {
		t.Fatalf("set 0 harus menghapus item, len = %d", len(cart))
	}
	if got := cartTotal(cart, byID); got != 50000 {
		t.Errorf("total setelah hapus = %d, want 50000", got)
	}
	// Produk stok 0 tidak bisa ditambah.
	habis := models.BotProduct{ID: 3, Name: "Habis", Price: 1000, Stock: 0}
	before := len(cart)
	cart, _ = cartAdd(cart, habis, 1)
	if len(cart) != before {
		t.Error("produk stok 0 tidak boleh masuk keranjang")
	}
}

func TestRenderCatalogText(t *testing.T) {
	products := []models.BotProduct{
		{ID: 1, Name: "Kopi Gula Aren", Price: 15000, Stock: 10, Category: "Minuman", Description: "Manis legit"},
		{ID: 2, Name: "Roti Bakar", Price: 8000, Stock: 0},
	}
	got := renderCatalogText(products)
	for _, want := range []string{
		"1. Kopi Gula Aren (Minuman)", "Rp15.000", "Stok: 10", "Manis legit",
		"2. Roti Bakar", "Rp8.000", "Stok: 0",
		"keranjang", "checkout", "batal",
	} {
		if !strings.Contains(got, want) {
			t.Errorf("renderCatalogText hilang %q:\n%s", want, got)
		}
	}
}

func TestRenderCartText(t *testing.T) {
	byID := map[uint]models.BotProduct{
		1: {ID: 1, Name: "Kopi", Price: 10000},
		2: {ID: 2, Name: "Teh", Price: 5000},
	}
	cart := []catalogCartItem{{ProductID: 1, Qty: 2}, {ProductID: 2, Qty: 3}}
	got := renderCartText(cart, byID)
	for _, want := range []string{"Kopi x2", "Rp20.000", "Teh x3", "Rp15.000", "Total: Rp35.000"} {
		if !strings.Contains(got, want) {
			t.Errorf("renderCartText hilang %q:\n%s", want, got)
		}
	}
	if got := renderCartText(nil, byID); !strings.Contains(got, "masih kosong") {
		t.Errorf("keranjang kosong harus menyebut kosong, dapat:\n%s", got)
	}
}

func TestRenderOrderConfirmation(t *testing.T) {
	order := &models.BotOrder{
		OrderNumber: "ORD-20261111-120000-1234",
		Total:       35000,
		Items: []models.BotOrderItem{
			{ProductName: "Kopi", Quantity: 2, Subtotal: 20000},
			{ProductName: "Teh", Quantity: 3, Subtotal: 15000},
		},
	}
	got := renderOrderConfirmation(order)
	for _, want := range []string{"ORD-20261111-120000-1234", "Kopi x2", "Rp20.000", "Total: Rp35.000", "Menunggu konfirmasi"} {
		if !strings.Contains(got, want) {
			t.Errorf("renderOrderConfirmation hilang %q:\n%s", want, got)
		}
	}
}

func TestIsCatalogTrigger(t *testing.T) {
	for _, kw := range []string{"katalog", "KATALOG", " order ", "belanja", "pesan", "catalog:cart", "catalog:checkout"} {
		if !isCatalogTrigger(kw) {
			t.Errorf("isCatalogTrigger(%q) = false, want true", kw)
		}
	}
	for _, kw := range []string{"halo", "menu", "katalog produk", "catalog"} {
		if isCatalogTrigger(kw) {
			t.Errorf("isCatalogTrigger(%q) = true, want false", kw)
		}
	}
}

func TestLoadCatalogCart(t *testing.T) {
	s := &models.BotCartSession{ItemsJSON: `[{"productId":1,"qty":2},{"productId":3,"qty":1}]`}
	cart := loadCatalogCart(s)
	if len(cart) != 2 || cart[0].ProductID != 1 || cart[0].Qty != 2 {
		t.Fatalf("loadCatalogCart = %+v, want 2 item", cart)
	}
	if got := loadCatalogCart(&models.BotCartSession{ItemsJSON: "bukan-json"}); len(got) != 0 {
		t.Errorf("JSON rusak harus menghasilkan keranjang kosong, dapat %+v", got)
	}
}
