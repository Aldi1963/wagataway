package handler

import (
	"reflect"
	"testing"

	"github.com/Aldi1963/wagataway/internal/whatsapp"
)

func TestValidateReactionEmoji(t *testing.T) {
	cases := []struct {
		name  string
		emoji string
		want  bool
	}{
		{"kosong = hapus reaksi", "", true},
		{"satu emoji", "❤️", true},
		{"emoji multi-codepoint", "👍🏽", true},
		{"teks pendek", "lol", true},
		{"tepat 8 rune", "12345678", true},
		{"lebih dari 8 rune", "123456789", false},
		{"kalimat panjang", "ini terlalu panjang untuk reaksi", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := validateReactionEmoji(tc.emoji); got != tc.want {
				t.Errorf("validateReactionEmoji(%q) = %v, want %v", tc.emoji, got, tc.want)
			}
		})
	}
}

func TestChatMediaURLToLocalPath(t *testing.T) {
	cases := []struct {
		name  string
		in    string
		want  string
		wantOK bool
	}{
		{"valid", "/uploads/chat/abc123.jpg", "file://./public/uploads/chat/abc123.jpg", true},
		{"tanpa prefix", "https://example.com/x.jpg", "", false},
		{"prefix lain", "/uploads/other/x.jpg", "", false},
		{"nama kosong", "/uploads/chat/", "", false},
		{"traversal", "/uploads/chat/../secret.txt", "", false},
		{"subdir", "/uploads/chat/a/b.jpg", "", false},
		{"kosong", "", "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, ok := chatMediaURLToLocalPath(tc.in)
			if ok != tc.wantOK || got != tc.want {
				t.Errorf("chatMediaURLToLocalPath(%q) = (%q, %v), want (%q, %v)",
					tc.in, got, ok, tc.want, tc.wantOK)
			}
		})
	}
}

func TestChatMediaTypeGroups(t *testing.T) {
	cases := []struct {
		filter string
		want   []string
		wantOK bool
	}{
		{"", nil, true},
		{"image", []string{"image", "video"}, true},
		{"document", []string{"document", "audio", "voicenote", "voice"}, true},
		{"text", nil, false},
		{"VIDEO", nil, false},
	}
	for _, tc := range cases {
		t.Run("filter="+tc.filter, func(t *testing.T) {
			got, ok := chatMediaTypeGroups(tc.filter)
			if ok != tc.wantOK || !reflect.DeepEqual(got, tc.want) {
				t.Errorf("chatMediaTypeGroups(%q) = (%v, %v), want (%v, %v)",
					tc.filter, got, ok, tc.want, tc.wantOK)
			}
		})
	}
}

func TestChatReactionsRoundTrip(t *testing.T) {
	// Tambah reaksi sendiri
	s := whatsapp.AddChatReaction("", "❤️", true)
	rs := whatsapp.ParseChatReactions(s)
	if len(rs) != 1 || rs[0].Emoji != "❤️" || !rs[0].FromMe {
		t.Fatalf("tambah reaksi sendiri: %s", s)
	}

	// Tambah reaksi lawan bicara — keduanya tersimpan
	s = whatsapp.AddChatReaction(s, "👍", false)
	rs = whatsapp.ParseChatReactions(s)
	if len(rs) != 2 {
		t.Fatalf("dua reaksi: %s", s)
	}

	// Ganti reaksi sendiri — yang lama tertimpa, bukan dobel
	s = whatsapp.AddChatReaction(s, "😂", true)
	rs = whatsapp.ParseChatReactions(s)
	if len(rs) != 2 {
		t.Fatalf("ganti reaksi sendiri harus tetap 2: %s", s)
	}
	mine := 0
	for _, r := range rs {
		if r.FromMe {
			mine++
			if r.Emoji != "😂" {
				t.Fatalf("emoji sendiri harus 😂: %s", s)
			}
		}
	}
	if mine != 1 {
		t.Fatalf("harus tepat 1 reaksi sendiri: %s", s)
	}

	// Hapus reaksi sendiri (emoji kosong)
	s = whatsapp.AddChatReaction(s, "", true)
	rs = whatsapp.ParseChatReactions(s)
	if len(rs) != 1 || rs[0].FromMe || rs[0].Emoji != "👍" {
		t.Fatalf("hapus reaksi sendiri: %s", s)
	}

	// Hapus terakhir → "[]" bukan ""
	s = whatsapp.AddChatReaction(s, "", false)
	if s != "[]" {
		t.Fatalf("kosong harus []: %q", s)
	}
	if whatsapp.ParseChatReactions("bukan-json") != nil {
		t.Fatal("JSON rusak harus nil")
	}
}

func TestChatMediaLabel(t *testing.T) {
	if chatMediaLabel("image") == "" || chatMediaLabel("video") == "" ||
		chatMediaLabel("document") == "" || chatMediaLabel("audio") == "" ||
		chatMediaLabel("voicenote") == "" || chatMediaLabel("zzz") == "" {
		t.Fatal("chatMediaLabel tidak boleh kosong")
	}
}
