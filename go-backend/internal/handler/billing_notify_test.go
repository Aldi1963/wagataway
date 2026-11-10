package handler

import (
	"strings"
	"testing"
	"time"
)

// Fitur 6: notifikasi WA pembayaran berhasil — format pesan & tanggal.

func TestFormatRupiahID(t *testing.T) {
	cases := []struct {
		in   int64
		want string
	}{
		{0, "Rp0"},
		{500, "Rp500"},
		{25000, "Rp25.000"},
		{150000, "Rp150.000"},
		{1500000, "Rp1.500.000"},
	}
	for _, c := range cases {
		if got := formatRupiahID(c.in); got != c.want {
			t.Errorf("formatRupiahID(%d) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestTglIDSingkat(t *testing.T) {
	// 30 Okt 2026 10:00 WIB → tetap "30 Okt 2026" (Asia/Jakarta).
	loc, err := time.LoadLocation("Asia/Jakarta")
	if err != nil {
		t.Skip("tz Asia/Jakarta tidak tersedia")
	}
	ts := time.Date(2026, 10, 30, 10, 0, 0, 0, loc)
	if got := tglIDSingkat(ts); got != "30 Okt 2026" {
		t.Errorf("tglIDSingkat = %q, want %q", got, "30 Okt 2026")
	}
	// UTC 2026-01-31 20:00 = 1 Feb 2026 WIB (batas hari ikut zona Jakarta).
	utc := time.Date(2026, 1, 31, 20, 0, 0, 0, time.UTC)
	if got := tglIDSingkat(utc); got != "1 Feb 2026" {
		t.Errorf("tglIDSingkat(utc) = %q, want %q", got, "1 Feb 2026")
	}
}

func TestBuildPaymentSuccessMessage(t *testing.T) {
	end := time.Date(2026, 10, 30, 0, 0, 0, 0, time.UTC)
	got := buildPaymentSuccessMessage(25000, "Lite", end)
	want := "Pembayaran Rp25.000 diterima, paket Lite aktif sampai 30 Okt 2026."
	if got != want {
		t.Errorf("got  %q\nwant %q", got, want)
	}
	// Bayar-0 (prorata Fitur 4): nominal Rp0 tetap diformat wajar.
	got = buildPaymentSuccessMessage(0, "Free", end)
	if !strings.HasPrefix(got, "Pembayaran Rp0 diterima, paket Free aktif sampai ") {
		t.Errorf("pesan bayar-0 tidak sesuai: %q", got)
	}
}
