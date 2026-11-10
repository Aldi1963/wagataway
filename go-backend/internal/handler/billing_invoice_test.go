package handler

import (
	"strings"
	"testing"
	"time"
)

// Fitur 2 (Invoice): nomor invoice harus deterministik dari ID transaksi,
// format INV/<tahun>/<bulan romawi>/<id 6 digit>.
func TestInvoiceNumberFormat(t *testing.T) {
	cases := []struct {
		id   uint
		when time.Time
		want string
	}{
		{123, time.Date(2026, 10, 1, 0, 0, 0, 0, time.UTC), "INV/2026/X/000123"},
		{1, time.Date(2026, 1, 15, 12, 0, 0, 0, time.UTC), "INV/2026/I/000001"},
		{7, time.Date(2026, 4, 30, 23, 59, 59, 0, time.UTC), "INV/2026/IV/000007"},
		{987654, time.Date(2025, 12, 31, 23, 59, 59, 0, time.UTC), "INV/2025/XII/987654"},
		{42, time.Date(2026, 2, 1, 0, 0, 0, 0, time.UTC), "INV/2026/II/000042"},
	}
	for _, tc := range cases {
		got := invoiceNumber(tc.id, tc.when)
		if got != tc.want {
			t.Errorf("invoiceNumber(%d, %v) = %q, want %q", tc.id, tc.when, got, tc.want)
		}
	}
}

// Deterministik & stabil: pemanggilan ulang dengan input sama hasilnya sama,
// dan tahun/bulan mengikuti CreatedAt (bukan waktu "sekarang").
func TestInvoiceNumberDeterministic(t *testing.T) {
	when := time.Date(2026, 3, 5, 10, 0, 0, 0, time.UTC)
	a := invoiceNumber(42, when)
	b := invoiceNumber(42, when)
	if a != b {
		t.Errorf("tidak deterministik: %q != %q", a, b)
	}
	if !strings.HasPrefix(a, "INV/2026/III/") {
		t.Errorf("prefix salah: %q", a)
	}
	// ID berbeda -> nomor berbeda
	if invoiceNumber(42, when) == invoiceNumber(43, when) {
		t.Errorf("ID berbeda menghasilkan nomor yang sama")
	}
}
