package handler

import (
	"encoding/json"
	"strings"
	"testing"
)

// ── Fitur 7: Integration Hub — unit test ─────────────────────────────────

func TestRenderIntegrationTemplate(t *testing.T) {
	payload := map[string]interface{}{
		"order": map[string]interface{}{
			"id":       float64(12345),
			"total":    float64(250000),
			"customer": "Budi",
		},
		"event": "order.created",
	}

	got := renderIntegrationTemplate("Order baru #{{order.id}} dari {{order.customer}} (Rp{{order.total}})", payload)
	want := "Order baru #12345 dari Budi (Rp250000)"
	if got != want {
		t.Fatalf("render salah:\n got: %q\nwant: %q", got, want)
	}

	// Field yang tidak ada -> string kosong, tanpa error.
	got = renderIntegrationTemplate("Status: {{order.status}} / {{missing.deep.x}}", payload)
	if got != "Status:  / " {
		t.Fatalf("field hilang harus jadi string kosong, got %q", got)
	}

	// Spasi di dalam kurung & tipe data lain.
	payload["flag"] = true
	got = renderIntegrationTemplate("{{ event }}|{{flag}}", payload)
	if got != "order.created|true" {
		t.Fatalf("got %q", got)
	}

	// Array di-render sebagai JSON.
	payload["items"] = []interface{}{"a", "b"}
	got = renderIntegrationTemplate("Items: {{items}}", payload)
	if !strings.Contains(got, `["a","b"]`) {
		t.Fatalf("array harus jadi JSON, got %q", got)
	}
}

func TestMaskIntegrationToken(t *testing.T) {
	masked := maskIntegrationToken("ab12cd34ef56gh78ij90kl12mn34op56qr78st90uv12wx34yz56ab78cd90ef12")
	if masked != "ab12•••ef12" {
		t.Fatalf("mask salah: %q", masked)
	}
	if maskIntegrationToken("abc") != "••••" {
		t.Fatalf("token pendek harus full sensor")
	}
}

func TestNormalizeInboxPhone(t *testing.T) {
	cases := []struct {
		in   string
		want string
		ok   bool
	}{
		{"6285751928963", "6285751928963", true},
		{"085751928963", "6285751928963", true},
		{"+62 857-1928-963", "628571928963", true},
		{"(0857) 192 8963", "628571928963", true},
		{"", "", false},
		{"abc123", "", false},
		{"123", "", false},
		{"62857519289631234567", "", false},
	}
	for _, c := range cases {
		got, ok := normalizeInboxPhone(c.in)
		if ok != c.ok || got != c.want {
			t.Fatalf("normalizeInboxPhone(%q) = (%q,%v), want (%q,%v)", c.in, got, ok, c.want, c.ok)
		}
	}
}

func TestRedactSensitivePayload(t *testing.T) {
	payload := map[string]interface{}{
		"to":       "628123",
		"api_key":  "rahasia",
		"password": "p455",
		"order": map[string]interface{}{
			"id":     float64(1),
			"secret": "s3cr3t",
		},
	}
	redacted := redactSensitivePayload(payload)
	if redacted["api_key"] != "•••" || redacted["password"] != "•••" {
		t.Fatalf("kunci sensitif tidak disensor: %v", redacted)
	}
	if redacted["to"] != "628123" {
		t.Fatalf("kunci non-sensitif ikut tersensor")
	}
	nested := redacted["order"].(map[string]interface{})
	if nested["secret"] != "•••" || nested["id"] != float64(1) {
		t.Fatalf("redaksi nested salah: %v", nested)
	}
	// Payload asli tidak boleh termutasi.
	if payload["api_key"] != "rahasia" {
		t.Fatalf("payload asli termutasi!")
	}
}

func TestSummarizePayloadTruncates(t *testing.T) {
	payload := map[string]interface{}{"blob": strings.Repeat("x", 5000)}
	s := summarizePayload(payload)
	if len(s) > 2100 {
		t.Fatalf("ringkasan terlalu panjang: %d", len(s))
	}
	if !strings.HasSuffix(s, "…(dipotong)") {
		t.Fatalf("ringkasan terpotong harus ditandai, got suffix %q", s[len(s)-20:])
	}
	// Payload pendek tidak terpotong.
	short := summarizePayload(map[string]interface{}{"to": "628123"})
	var m map[string]interface{}
	if err := json.Unmarshal([]byte(short), &m); err != nil {
		t.Fatalf("ringkasan pendek harus JSON valid: %v", err)
	}
	if m["to"] != "628123" {
		t.Fatalf("ringkasan pendek salah: %v", m)
	}
}

func TestInboxTokenRateLimit(t *testing.T) {
	resetInboxLimiter()
	token := "test-token-rate"
	for i := 0; i < 60; i++ {
		if !inboxTokenAllowed(token) {
			t.Fatalf("request ke-%d ditolak padahal masih di bawah limit", i+1)
		}
	}
	if inboxTokenAllowed(token) {
		t.Fatalf("request ke-61 harus ditolak (429)")
	}
	// Token lain punya bucket sendiri.
	if !inboxTokenAllowed("token-lain") {
		t.Fatalf("token berbeda tidak boleh ikut kena limit")
	}
	resetInboxLimiter()
}
