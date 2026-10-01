package handler

import (
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
)

// Fitur 4 (prorata): kalkulasi sisa nilai & total bayar.
func TestProrateQuoteUpgrade(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	oldPlan := models.Plan{ID: 1, Name: "Lite", Price: 30000, Duration: 30}
	// Sudah dipakai 10 hari → sisa 20 hari
	sub := &models.Subscription{
		PlanID:    1,
		StartDate: now.AddDate(0, 0, -10),
		EndDate:   now.AddDate(0, 0, 20),
		Plan:      oldPlan,
	}
	newPlan := &models.Plan{ID: 2, Name: "Regular", Price: 100000, Duration: 30}

	q := prorateQuotePure(now, sub, newPlan)
	if !q.Prorate {
		t.Fatal("harus prorata")
	}
	if q.RemainingDays != 20 {
		t.Errorf("remainingDays = %d, want 20", q.RemainingDays)
	}
	// kredit = 30000 * 20 / 30 = 20000
	if q.CreditAmount != 20000 {
		t.Errorf("creditAmount = %d, want 20000", q.CreditAmount)
	}
	// bayar = 100000 - 20000 = 80000
	if q.PayableAmount != 80000 {
		t.Errorf("payableAmount = %d, want 80000", q.PayableAmount)
	}
	if q.NewPrice != 100000 {
		t.Errorf("newPrice = %d, want 100000", q.NewPrice)
	}
}

// Downgrade: sisa nilai menutupi penuh → bayar 0.
func TestProrateQuoteDowngradeFullCover(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	oldPlan := models.Plan{ID: 2, Name: "Pro", Price: 300000, Duration: 30}
	// Baru jalan 5 hari → sisa 25 hari
	sub := &models.Subscription{
		PlanID:    2,
		StartDate: now.AddDate(0, 0, -5),
		EndDate:   now.AddDate(0, 0, 25),
		Plan:      oldPlan,
	}
	newPlan := &models.Plan{ID: 1, Name: "Lite", Price: 30000, Duration: 30}

	q := prorateQuotePure(now, sub, newPlan)
	// kredit = 300000 * 25 / 30 = 250000 ≥ 30000 → bayar 0
	if q.CreditAmount != 250000 {
		t.Errorf("creditAmount = %d, want 250000", q.CreditAmount)
	}
	if q.PayableAmount != 0 {
		t.Errorf("payableAmount = %d, want 0", q.PayableAmount)
	}
}

// Trial: is_trial=true → sisa nilai 0 walau paket acuan berbayar.
func TestProrateQuoteTrialZeroCredit(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	oldPlan := models.Plan{ID: 2, Name: "Regular", Price: 100000, Duration: 30}
	sub := &models.Subscription{
		PlanID:    2,
		IsTrial:   true,
		StartDate: now.AddDate(0, 0, -2),
		EndDate:   now.AddDate(0, 0, 5),
		Plan:      oldPlan,
	}
	newPlan := &models.Plan{ID: 1, Name: "Lite", Price: 30000, Duration: 30}

	q := prorateQuotePure(now, sub, newPlan)
	if q.CreditAmount != 0 {
		t.Errorf("trial creditAmount = %d, want 0", q.CreditAmount)
	}
	if !q.IsTrial {
		t.Error("isTrial harus true")
	}
	if q.PayableAmount != 30000 {
		t.Errorf("payableAmount = %d, want 30000", q.PayableAmount)
	}
}

// Paket lama sudah expired: tidak ada prorata (sub == nil → beli baru biasa).
func TestProrateQuoteNoActiveSub(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	newPlan := &models.Plan{ID: 1, Name: "Lite", Price: 30000, Duration: 30}

	q := prorateQuotePure(now, nil, newPlan)
	if q.Prorate {
		t.Error("tanpa langganan aktif tidak boleh prorata")
	}
	if q.PayableAmount != 30000 {
		t.Errorf("payableAmount = %d, want 30000", q.PayableAmount)
	}
	if q.RemainingDays != 0 {
		t.Errorf("remainingDays = %d, want 0", q.RemainingDays)
	}
}

// Paket lama gratis (harga 0): sisa nilai 0.
func TestProrateQuoteFreeOldPlan(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	oldPlan := models.Plan{ID: 0, Name: "Free", Price: 0, Duration: 30}
	sub := &models.Subscription{
		PlanID:    0,
		StartDate: now.AddDate(0, 0, -10),
		EndDate:   now.AddDate(0, 0, 20),
		Plan:      oldPlan,
	}
	newPlan := &models.Plan{ID: 1, Name: "Lite", Price: 30000, Duration: 30}

	q := prorateQuotePure(now, sub, newPlan)
	if q.CreditAmount != 0 {
		t.Errorf("creditAmount = %d, want 0", q.CreditAmount)
	}
	if q.PayableAmount != 30000 {
		t.Errorf("payableAmount = %d, want 30000", q.PayableAmount)
	}
}

// Sisa jam < 24 dibulatkan ke atas menjadi 1 hari.
func TestProrateQuoteCeilRemainingDays(t *testing.T) {
	now := time.Date(2026, 10, 1, 12, 0, 0, 0, time.UTC)
	oldPlan := models.Plan{ID: 1, Name: "Lite", Price: 30000, Duration: 30}
	sub := &models.Subscription{
		PlanID:    1,
		StartDate: now.AddDate(0, 0, -29),
		EndDate:   now.Add(6 * time.Hour), // sisa 6 jam
		Plan:      oldPlan,
	}
	newPlan := &models.Plan{ID: 2, Name: "Regular", Price: 100000, Duration: 30}

	q := prorateQuotePure(now, sub, newPlan)
	if q.RemainingDays != 1 {
		t.Errorf("remainingDays = %d, want 1 (ceil)", q.RemainingDays)
	}
	// kredit = 30000 * 1 / 30 = 1000
	if q.CreditAmount != 1000 {
		t.Errorf("creditAmount = %d, want 1000", q.CreditAmount)
	}
	if q.PayableAmount != 99000 {
		t.Errorf("payableAmount = %d, want 99000", q.PayableAmount)
	}
}

// Metadata audit: JSON berisi fromPlanId & creditAmount.
func TestProrateMetadataJSON(t *testing.T) {
	q := ProrateQuote{
		Prorate:       true,
		OldPlanID:     2,
		CreditAmount:  250000,
		RemainingDays: 25,
		PayableAmount: 0,
	}
	m := prorateMetadataJSON(q)
	for _, want := range []string{`"prorate":true`, `"fromPlanId":2`, `"creditAmount":250000`, `"remainingDays":25`} {
		if !contains(m, want) {
			t.Errorf("metadata %s tidak mengandung %s", m, want)
		}
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}
