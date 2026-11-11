package handler

import (
	"strings"
	"testing"
)

// ── Item 10: Template pesan resmi — unit test ───────────────────────────────

func TestExtractTemplateVariables(t *testing.T) {
	got := extractTemplateVariables("Halo {{nama}}, kode {{kode}} ya {{nama}}. Posisi {{1}} dan {{ 2 }}.")
	want := []string{"nama", "kode", "1", "2"}
	if len(got) != len(want) {
		t.Fatalf("got %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("got %v, want %v", got, want)
		}
	}
	if len(extractTemplateVariables("Tanpa variabel.")) != 0 {
		t.Fatal("konten tanpa variabel harus kosong")
	}
}

func TestRenderMessageTemplateNamed(t *testing.T) {
	got, missing := renderMessageTemplate(
		"Halo {{nama}}, kode Anda {{kode}}.",
		map[string]string{"nama": "Budi", "kode": "1234"},
		[]string{"nama", "kode"},
	)
	if got != "Halo Budi, kode Anda 1234." || len(missing) != 0 {
		t.Fatalf("got %q missing %v", got, missing)
	}
}

func TestRenderMessageTemplatePositional(t *testing.T) {
	// Gaya Meta {{1}}/{{2}} dipetakan ke urutan deklarasi variabel.
	got, missing := renderMessageTemplate(
		"Halo {{1}}, kode Anda {{2}}.",
		map[string]string{"nama": "Budi", "kode": "1234"},
		[]string{"nama", "kode"},
	)
	if got != "Halo Budi, kode Anda 1234." || len(missing) != 0 {
		t.Fatalf("got %q missing %v", got, missing)
	}
	// Tanpa deklarasi, {{1}} dibaca langsung dari vars["1"].
	got, missing = renderMessageTemplate(
		"Kode {{1}}.",
		map[string]string{"1": "9999"},
		nil,
	)
	if got != "Kode 9999." || len(missing) != 0 {
		t.Fatalf("got %q missing %v", got, missing)
	}
}

func TestRenderMessageTemplateMissing(t *testing.T) {
	got, missing := renderMessageTemplate(
		"Halo {{nama}}, kode {{kode}}, lagi {{nama}}.",
		map[string]string{"nama": "Budi"},
		[]string{"nama", "kode"},
	)
	if len(missing) != 1 || missing[0] != "kode" {
		t.Fatalf("missing harus [kode], got %v", missing)
	}
	if !strings.Contains(got, "{{kode}}") {
		t.Fatalf("placeholder yang hilang harus dipertahankan, got %q", got)
	}
}

func TestTemplateInputValidate(t *testing.T) {
	if msg := (&templateInput{Name: "x", Content: "y"}).validate(); msg != "" {
		t.Fatalf("input minimal harus valid, got %q", msg)
	}
	if msg := (&templateInput{Name: "", Content: "y"}).validate(); msg == "" {
		t.Fatal("nama kosong harus ditolak")
	}
	if msg := (&templateInput{Name: "x", Content: "y", Category: "spam"}).validate(); msg == "" {
		t.Fatal("kategori di luar utility/marketing/authentication/umum harus ditolak")
	}
	if msg := (&templateInput{Name: "x", Content: "y", Language: "fr"}).validate(); msg == "" {
		t.Fatal("bahasa di luar id/en harus ditolak")
	}
	if msg := (&templateInput{Name: "x", Content: "y", Variables: "bukan-json"}).validate(); msg == "" {
		t.Fatal("variables bukan JSON harus ditolak")
	}
	if msg := (&templateInput{Name: "x", Content: "y", ExampleValues: `["a"]`}).validate(); msg == "" {
		t.Fatal("exampleValues harus objek JSON, bukan array")
	}
	if msg := (&templateInput{Name: "x", Content: "y", Category: "Marketing", Language: "EN"}).validate(); msg != "" {
		t.Fatalf("kategori/bahasa huruf besar harus diterima (dinormalisasi), got %q", msg)
	}
}
