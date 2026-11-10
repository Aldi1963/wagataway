package security

import (
	"net/http"
	"strings"
	"testing"
)

func TestGenerateWebhookSecret(t *testing.T) {
	s1, err := GenerateWebhookSecret()
	if err != nil {
		t.Fatalf("GenerateWebhookSecret error: %v", err)
	}
	s2, err := GenerateWebhookSecret()
	if err != nil {
		t.Fatalf("GenerateWebhookSecret error: %v", err)
	}
	if len(s1) != 64 {
		t.Fatalf("panjang secret = %d, mau 64 (32 byte hex)", len(s1))
	}
	if s1 == s2 {
		t.Fatal("dua secret berurutan tidak boleh sama")
	}
	for _, c := range s1 {
		if !strings.ContainsRune("0123456789abcdef", c) {
			t.Fatalf("secret mengandung karakter non-hex: %q", s1)
		}
	}
}

func TestSignVerifyWebhookPayload(t *testing.T) {
	secret := "rahasia-test-123"
	body := []byte(`{"event":"message.received","device_id":1}`)

	sig := SignWebhookPayload(secret, body)
	if !strings.HasPrefix(sig, "sha256=") {
		t.Fatalf("format signature salah: %q", sig)
	}
	if len(sig) != len("sha256=")+64 {
		t.Fatalf("panjang signature salah: %q", sig)
	}
	if !VerifyWebhookSignature(secret, body, sig) {
		t.Fatal("verifikasi signature yang benar gagal")
	}
}

func TestVerifyWebhookSignatureRejects(t *testing.T) {
	secret := "rahasia-test-123"
	body := []byte(`{"event":"message.received"}`)
	sig := SignWebhookPayload(secret, body)

	cases := []struct {
		name      string
		secret    string
		body      []byte
		signature string
	}{
		{"secret salah", "salah", body, sig},
		{"body diubah", secret, []byte(`{"event":"message.sent"}`), sig},
		{"signature kosong", secret, body, ""},
		{"signature sampah", secret, body, "sha256=zzz"},
		{"tanpa prefix", secret, body, strings.TrimPrefix(sig, "sha256=")},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if VerifyWebhookSignature(tc.secret, tc.body, tc.signature) {
				t.Fatal("verifikasi seharusnya gagal")
			}
		})
	}
}

func TestSetWebhookSignatureHeaders(t *testing.T) {
	body := []byte(`{"event":"message.sent"}`)

	// Dengan secret: kedua header harus ada dan signature valid.
	req, _ := http.NewRequest(http.MethodPost, "https://example.com/hook", nil)
	SetWebhookSignatureHeaders(req, "kunci", body)
	sig := req.Header.Get("X-Wagataway-Signature")
	if sig == "" {
		t.Fatal("X-Wagataway-Signature tidak di-set")
	}
	if !VerifyWebhookSignature("kunci", body, sig) {
		t.Fatal("signature di header tidak valid terhadap body")
	}
	if ts := req.Header.Get("X-Wagataway-Timestamp"); ts == "" {
		t.Fatal("X-Wagataway-Timestamp tidak di-set")
	}

	// Tanpa secret: tidak ada header yang ditambahkan (payload tetap polos).
	req2, _ := http.NewRequest(http.MethodPost, "https://example.com/hook", nil)
	SetWebhookSignatureHeaders(req2, "", body)
	if got := req2.Header.Get("X-Wagataway-Signature"); got != "" {
		t.Fatalf("secret kosong tapi signature ter-set: %q", got)
	}
	if got := req2.Header.Get("X-Wagataway-Timestamp"); got != "" {
		t.Fatalf("secret kosong tapi timestamp ter-set: %q", got)
	}
}
