package service

import (
	"testing"

	"github.com/Aldi1963/wagataway/internal/database/models"
)

func TestScoreFAQExactAndKeyword(t *testing.T) {
	faq := &models.AIChatbotFAQ{
		Question: "Berapa harga produk X?",
		Answer:   "Rp10.000",
		Keywords: "harga, price list",
	}
	if s := scoreFAQ("berapa harga produk X", faq); s < 0.9 {
		t.Errorf("exact-ish question scored %v, want >= 0.9", s)
	}
	if s := scoreFAQ("harga", faq); s < 0.9 {
		t.Errorf("single keyword scored %v, want >= 0.9", s)
	}
	if s := scoreFAQ("halo, selamat pagi", faq); s != 0 {
		t.Errorf("unrelated message scored %v, want 0", s)
	}
	if s := scoreFAQ("cara bayar", faq); s >= FAQMatchThreshold {
		t.Errorf("partial unrelated scored %v, want < threshold", s)
	}
}

func TestFindBestFAQThresholdAndPriority(t *testing.T) {
	faqs := []models.AIChatbotFAQ{
		{ID: 1, Question: "Berapa ongkir ke Jakarta?", Answer: "Rp15rb", IsActive: true, Priority: 0},
		{ID: 2, Question: "Ongkir Jakarta", Answer: "Rp10rb", IsActive: true, Priority: 5},
		{ID: 3, Question: "Berapa ongkir ke Jakarta?", Answer: "nonaktif", IsActive: false, Priority: 99},
	}
	best, score := FindBestFAQ(faqs, "berapa ongkir jakarta")
	if best == nil {
		t.Fatal("expected a match")
	}
	if best.ID != 2 {
		t.Errorf("tie broken by priority: got FAQ %d, want 2", best.ID)
	}
	if score < FAQMatchThreshold {
		t.Errorf("score %v below threshold", score)
	}
	if best, _ := FindBestFAQ(faqs, "halo selamat pagi"); best != nil {
		t.Errorf("unrelated message matched FAQ %d", best.ID)
	}
	if best, _ := FindBestFAQ(nil, "ongkir"); best != nil {
		t.Error("empty FAQ list matched something")
	}
}

func TestTruncateReply(t *testing.T) {
	if got := TruncateReply("halo", 1000); got != "halo" {
		t.Errorf("short reply changed: %q", got)
	}
	long := "abcdefghij"
	if got := TruncateReply(long, 5); got != "abcde…" {
		t.Errorf("truncated = %q, want %q", got, "abcde…")
	}
	if got := TruncateReply(long, 0); got != long {
		t.Errorf("zero maxLen should use default, got %q", got)
	}
	if got := TruncateReply(long, 99999); got != long {
		t.Errorf("over-cap maxLen should still return short reply, got %q", got)
	}
}

func TestIsChatbotPlan(t *testing.T) {
	for _, p := range []string{"pro", "Pro", "PRO", "master", "Master"} {
		if !IsChatbotPlan(p) {
			t.Errorf("%q should be a chatbot plan", p)
		}
	}
	for _, p := range []string{"free", "lite", "regular", "", "enterprise"} {
		if IsChatbotPlan(p) {
			t.Errorf("%q should NOT be a chatbot plan", p)
		}
	}
}

func TestEffectiveChatbotConfig(t *testing.T) {
	cfg := &models.AIReplyConfig{MaxReplyLength: 0, ContextMessages: 10}
	if got := EffectiveMaxReplyLength(cfg); got != DefaultMaxReplyLength {
		t.Errorf("maxLen 0 -> %d, want %d", got, DefaultMaxReplyLength)
	}
	if got := EffectiveContextMessages(cfg); got != 10 {
		t.Errorf("context 10 -> %d", got)
	}
	cfg.MaxReplyLength = 99999
	if got := EffectiveMaxReplyLength(cfg); got != MaxReplyLengthCap {
		t.Errorf("maxLen capped at %d, got %d", MaxReplyLengthCap, got)
	}
	cfg.ContextMessages = 99
	if got := EffectiveContextMessages(cfg); got != MaxContextMessages {
		t.Errorf("context capped at %d, got %d", MaxContextMessages, got)
	}
	cfg.ContextMessages = -3
	if got := EffectiveContextMessages(cfg); got != 0 {
		t.Errorf("negative context -> %d, want 0", got)
	}
	if got := EffectiveMaxReplyLength(nil); got != DefaultMaxReplyLength {
		t.Errorf("nil cfg maxLen -> %d", got)
	}
	if got := EffectiveContextMessages(nil); got != 10 {
		t.Errorf("nil cfg context -> %d, want 10", got)
	}
}
