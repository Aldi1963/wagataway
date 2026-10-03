package service

import "testing"

func TestParseSSEChatResponse(t *testing.T) {
	body := []byte("data: {\"choices\":[{\"delta\":{\"content\":\"Halo\"}}]}\n" +
		"data: {\"choices\":[{\"delta\":{\"content\":\" dunia\"}}]}\n" +
		"data: [DONE]\n")
	resp, err := parseSSEChatResponse(body)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if resp.Content != "Halo dunia" {
		t.Errorf("got %q, want %q", resp.Content, "Halo dunia")
	}
	if !looksLikeSSE(body) {
		t.Error("looksLikeSSE should be true")
	}
	if looksLikeSSE([]byte(`{"choices":[]}`)) {
		t.Error("looksLikeSSE should be false for plain JSON")
	}
}

func TestNormalizeChatHistory(t *testing.T) {
	// Trailing assistant dibuang.
	msgs := []ChatMessage{
		{Role: "user", Content: "Help"},
		{Role: "assistant", Content: "Halo, ada yang bisa dibantu?"},
	}
	got := NormalizeChatHistory(msgs)
	if len(got) != 1 || got[0].Role != "user" {
		t.Fatalf("trailing assistant harus dibuang, dapat: %+v", got)
	}
	// Role berurutan digabung.
	msgs = []ChatMessage{
		{Role: "user", Content: "halo"},
		{Role: "assistant", Content: "hai"},
		{Role: "assistant", Content: "ada yang bisa dibantu?"},
		{Role: "user", Content: "mau tanya"},
	}
	got = NormalizeChatHistory(msgs)
	if len(got) != 3 || got[1].Content != "hai\nada yang bisa dibantu?" {
		t.Fatalf("gabung gagal: %+v", got)
	}
	// Semua assistant -> kosong.
	msgs = []ChatMessage{{Role: "assistant", Content: "hai"}}
	if got := NormalizeChatHistory(msgs); len(got) != 0 {
		t.Fatalf("harus kosong, dapat: %+v", got)
	}
	// Sudah rapi -> tidak berubah.
	msgs = []ChatMessage{
		{Role: "user", Content: "a"},
		{Role: "assistant", Content: "b"},
		{Role: "user", Content: "c"},
	}
	got = NormalizeChatHistory(msgs)
	if len(got) != 3 {
		t.Fatalf("tidak boleh berubah: %+v", got)
	}
}
