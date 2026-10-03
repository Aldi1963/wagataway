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
