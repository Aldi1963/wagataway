package handler

import (
	"strings"
	"testing"
)

func TestNormalizeOTPPhone(t *testing.T) {
	cases := []struct {
		in   string
		want string
	}{
		{"6281234567890", "6281234567890"},
		{"081234567890", "6281234567890"},
		{"+6281234567890", "6281234567890"},
		{"62812 3456 7890", "6281234567890"},
		{"62-812-3456-7890", "6281234567890"},
		{"  0812-3456-7890  ", "6281234567890"},
		{"12345", ""},        // terlalu pendek
		{"abc", ""},          // bukan digit
		{"", ""},             // kosong
		{"621", ""},          // terlalu pendek walau prefix 62
		{"62812345678901234567890", ""}, // terlalu panjang
		{"15551234567", ""},  // bukan 62
	}
	for _, c := range cases {
		if got := normalizeOTPPhone(c.in); got != c.want {
			t.Errorf("normalizeOTPPhone(%q) = %q, want %q", c.in, got, c.want)
		}
	}
}

func TestOtpCodeHashNeverPlaintext(t *testing.T) {
	code := "482916"
	h := otpCodeHash(code)
	if h == code {
		t.Fatal("hash sama dengan plaintext")
	}
	if len(h) != 64 {
		t.Fatalf("hash SHA256 hex harus 64 char, dapat %d", len(h))
	}
	if strings.Contains(h, code) {
		t.Fatal("hash mengandung plaintext")
	}
	// deterministik
	if otpCodeHash(code) != h {
		t.Fatal("hash tidak deterministik")
	}
}

func TestOtpHashesMatchConstantTime(t *testing.T) {
	code := "123456"
	stored := otpCodeHash(code)
	if !otpHashesMatch(otpCodeHash(code), stored) {
		t.Fatal("kode benar harus cocok")
	}
	if otpHashesMatch(otpCodeHash("654321"), stored) {
		t.Fatal("kode salah harus ditolak")
	}
	if otpHashesMatch("pendek", stored) {
		t.Fatal("hash beda panjang harus ditolak")
	}
	if otpHashesMatch("", "") {
		t.Fatal("hash kosong harus ditolak")
	}
}

func TestGenerateOtpCode(t *testing.T) {
	for _, n := range []int{4, 5, 6, 7, 8} {
		seen := map[string]bool{}
		for i := 0; i < 50; i++ {
			code, err := generateOtpCode(n)
			if err != nil {
				t.Fatalf("generateOtpCode(%d): %v", n, err)
			}
			if len(code) != n {
				t.Fatalf("panjang kode = %d, want %d", len(code), n)
			}
			for _, r := range code {
				if r < '0' || r > '9' {
					t.Fatalf("kode mengandung non-digit: %q", code)
				}
			}
			if code[0] == '0' {
				t.Fatalf("digit pertama nol: %q", code)
			}
			seen[code] = true
		}
		if len(seen) < 40 {
			t.Fatalf("kode tidak cukup acak untuk n=%d: %d unik dari 50", n, len(seen))
		}
	}
	if _, err := generateOtpCode(0); err == nil {
		t.Fatal("panjang 0 harus error")
	}
}

func TestRenderOtpTemplate(t *testing.T) {
	if got := renderOtpTemplate("Kode OTP Anda: {code}", "123456"); got != "Kode OTP Anda: 123456" {
		t.Fatalf("got %q", got)
	}
	// template tanpa placeholder: kode ditempel di akhir
	if got := renderOtpTemplate("Kode Anda", "123456"); got != "Kode Anda 123456" {
		t.Fatalf("got %q", got)
	}
	// kode plaintext tidak boleh masuk log — pastikan template tidak membocorkan via format aneh
	if got := renderOtpTemplate("{code} adalah kode Anda", "9999"); strings.Count(got, "9999") != 1 {
		t.Fatalf("kode muncul %d kali: %q", strings.Count(got, "9999"), got)
	}
}
