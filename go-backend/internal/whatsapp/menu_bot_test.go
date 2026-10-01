package whatsapp

import (
	"strings"
	"testing"

	"github.com/Aldi1963/wagataway/internal/database/models"
)

func TestParseMenuInput(t *testing.T) {
	cases := []struct {
		in       string
		wantKind string
		wantN    int
	}{
		{"0", "back", 0},
		{"kembali", "back", 0},
		{"KEMBALI", "back", 0},
		{"  kembali  ", "back", 0},
		{"back", "back", 0},
		{"1", "choice", 1},
		{"3", "choice", 3},
		{" 2 ", "choice", 2},
		{"12", "choice", 12},
		{"-1", "invalid", 0},
		{"abc", "invalid", 0},
		{"", "invalid", 0},
		{"1.5", "invalid", 0},
		{"menu", "invalid", 0},
	}
	for _, c := range cases {
		kind, n := parseMenuInput(c.in)
		if kind != c.wantKind || n != c.wantN {
			t.Errorf("parseMenuInput(%q) = (%q, %d), want (%q, %d)",
				c.in, kind, n, c.wantKind, c.wantN)
		}
	}
}

func TestRenderMenuText(t *testing.T) {
	opts := []models.MenuBotItem{{Label: "Jam operasional"}, {Label: "Harga"}, {Label: "Hubungi CS"}}

	// Menu utama: tanpa baris kembali
	got := renderMenuText("Halo! Pilih layanan:", opts, false)
	for _, want := range []string{"Halo! Pilih layanan:", "1. Jam operasional", "2. Harga", "3. Hubungi CS"} {
		if !strings.Contains(got, want) {
			t.Errorf("renderMenuText(root) hilang %q:\n%s", want, got)
		}
	}
	if strings.Contains(got, "0. Kembali") {
		t.Errorf("menu utama tidak boleh menampilkan '0. Kembali':\n%s", got)
	}

	// Sub-menu: ada baris kembali
	got = renderMenuText("Pilih info:", opts, true)
	if !strings.Contains(got, "0. Kembali") {
		t.Errorf("sub-menu harus menampilkan '0. Kembali':\n%s", got)
	}

	// Tanpa intro & tanpa opsi tetap aman
	got = renderMenuText("", nil, false)
	if got != "" {
		t.Errorf("menu kosong harus menghasilkan string kosong, dapat %q", got)
	}
}

func TestMenuHistoryPushPop(t *testing.T) {
	h := pushMenuHistory("", 3)
	if h != "3" {
		t.Fatalf("push pertama: dapat %q, want %q", h, "3")
	}
	h = pushMenuHistory(h, 7)
	if h != "3,7" {
		t.Fatalf("push kedua: dapat %q, want %q", h, "3,7")
	}
	if d := menuDepth(h); d != 2 {
		t.Fatalf("menuDepth: dapat %d, want 2", d)
	}
	if !hasMenuParent(h) {
		t.Fatal("hasMenuParent harus true")
	}

	parent, rest, ok := popMenuHistory(h)
	if !ok || parent != 7 || rest != "3" {
		t.Fatalf("pop: dapat (%d, %q, %v), want (7, \"3\", true)", parent, rest, ok)
	}
	parent, rest, ok = popMenuHistory(rest)
	if !ok || parent != 3 || rest != "" {
		t.Fatalf("pop kedua: dapat (%d, %q, %v), want (3, \"\", true)", parent, rest, ok)
	}
	if _, _, ok = popMenuHistory(rest); ok {
		t.Fatal("pop dari tumpukan kosong harus ok=false (sudah di menu utama)")
	}
	if hasMenuParent("") {
		t.Fatal("hasMenuParent(\"\") harus false")
	}
	if d := menuDepth(""); d != 0 {
		t.Fatalf("menuDepth(\"\") = %d, want 0", d)
	}
}
