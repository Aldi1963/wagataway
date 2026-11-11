package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Analitik voucher (Item 7): jumlah pakai dari VoucherRedemption +
// konversi trial→berbayar (transaksi paid bernominal > 0 SETELAH penukaran).
// DB-backed (postgres test wagataway_test; skip bila tidak tersedia).

func anlTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.Plan{}, &models.User{}, &models.Voucher{},
		&models.VoucherRedemption{}, &models.Transaction{}); err != nil {
		t.Fatalf("AutoMigrate gagal: %v", err)
	}
	return db
}

func anlUser(t *testing.T, db *gorm.DB, suffix string) models.User {
	t.Helper()
	u := models.User{
		UUID:  fmt.Sprintf("00000000-0000-4000-8000-%012d", time.Now().UnixNano()%1000000000000),
		Name:  "Anl " + suffix,
		Email: fmt.Sprintf("anl-%s@test.local", suffix),
		Plan:  "free",
	}
	if err := db.Create(&u).Error; err != nil {
		t.Fatalf("seed user: %v", err)
	}
	return u
}

func anlSetCreatedAt(t *testing.T, db *gorm.DB, model any, id uint, at time.Time) {
	t.Helper()
	if err := db.Model(model).Where("id = ?", id).UpdateColumn("created_at", at).Error; err != nil {
		t.Fatalf("set created_at: %v", err)
	}
}

func TestVoucherAnalyticsTrialConversion(t *testing.T) {
	db := anlTestDB(t)
	tag := fmt.Sprintf("%d", time.Now().UnixNano()%100000000)
	// Ringkasan bersifat global (semua voucher di DB test) — ambil baseline
	// dulu supaya run berulang / sisa run lain tidak menggagalkan assert.
	baseSummary, _, err := computeVoucherAnalytics(db)
	if err != nil {
		t.Fatalf("baseline analytics: %v", err)
	}
	plan := models.Plan{Name: "Regular " + tag, Slug: "regular-" + tag, Price: 66000, Duration: 30, IsActive: true}
	if err := db.Create(&plan).Error; err != nil {
		t.Fatalf("seed plan: %v", err)
	}
	t.Cleanup(func() {
		db.Unscoped().Where("user_id IN (?)",
			db.Model(&models.User{}).Select("id").Where("email LIKE ?", "anl-"+tag+"-%")).
			Delete(&models.Transaction{})
		db.Unscoped().Where("voucher_id IN (?)",
			db.Model(&models.Voucher{}).Select("id").Where("code LIKE ?", "ANL-%-"+tag)).
			Delete(&models.VoucherRedemption{})
		db.Unscoped().Where("code LIKE ?", "ANL-%-"+tag).Delete(&models.Voucher{})
		db.Unscoped().Where("email LIKE ?", "anl-"+tag+"-%").Delete(&models.User{})
		db.Unscoped().Where("id = ?", plan.ID).Delete(&models.Plan{})
	})
	trialCode := "ANL-TRIAL-" + tag
	planCode := "ANL-PLAN-" + tag
	trial := models.Voucher{Code: trialCode, Type: "trial", PlanID: &plan.ID, Duration: 7, MaxUses: 100, UsedCount: 5, IsActive: true}
	planV := models.Voucher{Code: planCode, Type: "plan", PlanID: &plan.ID, Duration: 30, MaxUses: 100, UsedCount: 1, IsActive: true}
	if err := db.Create(&trial).Error; err != nil {
		t.Fatalf("seed trial voucher: %v", err)
	}
	if err := db.Create(&planV).Error; err != nil {
		t.Fatalf("seed plan voucher: %v", err)
	}

	t0 := time.Now().Add(-48 * time.Hour).Truncate(time.Second)
	// u1: trial lalu BAYAR setelahnya → konversi.
	// u2: trial, transaksi masih pending → bukan konversi.
	// u3: trial, transaksi paid SEBELUM penukaran → bukan konversi.
	// u4: trial, hanya transaksi paid nominal 0 (prorata bayar-0) → bukan konversi.
	// u5: voucher plan lalu bayar setelahnya → konversi voucher plan,
	//     tapi TIDAK masuk ringkasan trial.
	users := make([]models.User, 0, 5)
	for i := 0; i < 5; i++ {
		users = append(users, anlUser(t, db, fmt.Sprintf("%s-%d", tag, i+1)))
	}
	redeem := func(v models.Voucher, u models.User) models.VoucherRedemption {
		r := models.VoucherRedemption{VoucherID: v.ID, UserID: u.ID}
		if err := db.Create(&r).Error; err != nil {
			t.Fatalf("seed redemption: %v", err)
		}
		anlSetCreatedAt(t, db, &models.VoucherRedemption{}, r.ID, t0)
		return r
	}
	redeem(trial, users[0])
	redeem(trial, users[1])
	redeem(trial, users[2])
	redeem(trial, users[3])
	redeem(planV, users[4])

	mkTx := func(u models.User, status string, amount int64, at time.Time) models.Transaction {
		paidAt := at
		tx := models.Transaction{UserID: u.ID, PlanID: &plan.ID, Amount: amount,
			Status: status, ExternalID: fmt.Sprintf("WAG-ANL-%s-%d", tag, u.ID), PaidAt: &paidAt}
		if err := db.Create(&tx).Error; err != nil {
			t.Fatalf("seed tx: %v", err)
		}
		anlSetCreatedAt(t, db, &models.Transaction{}, tx.ID, at)
		return tx
	}
	mkTx(users[0], "paid", 66000, t0.Add(time.Hour))       // konversi
	mkTx(users[1], "pending", 66000, t0.Add(time.Hour))    // belum bayar
	mkTx(users[2], "paid", 66000, t0.Add(-time.Hour))      // bayar SEBELUM trial
	mkTx(users[3], "paid", 0, t0.Add(time.Hour))           // prorata 0, bukan bayar
	mkTx(users[4], "paid", 66000, t0.Add(time.Hour))       // konversi voucher plan

	summary, rows, err := computeVoucherAnalytics(db)
	if err != nil {
		t.Fatalf("computeVoucherAnalytics: %v", err)
	}
	var trialRow, planRow *voucherAnalyticsRow
	for i := range rows {
		switch rows[i].Code {
		case trialCode:
			trialRow = &rows[i]
		case planCode:
			planRow = &rows[i]
		}
	}
	if trialRow == nil || planRow == nil {
		t.Fatalf("baris analitik tidak ditemukan (trial=%v plan=%v)", trialRow != nil, planRow != nil)
	}
	// Jumlah pakai = hitungan baris redemption, bukan UsedCount denormalisasi.
	if trialRow.Redemptions != 4 {
		t.Errorf("trial redemptions = %d, mau 4", trialRow.Redemptions)
	}
	if trialRow.ConvertedCount != 1 {
		t.Errorf("trial converted = %d, mau 1 (hanya u1)", trialRow.ConvertedCount)
	}
	if trialRow.ConversionRate != 25 {
		t.Errorf("trial conversionRate = %v, mau 25", trialRow.ConversionRate)
	}
	if planRow.Redemptions != 1 || planRow.ConvertedCount != 1 {
		t.Errorf("plan redemptions/converted = %d/%d, mau 1/1", planRow.Redemptions, planRow.ConvertedCount)
	}
	wantRate := float64(baseSummary.TrialConverted+1) / float64(baseSummary.TrialRedemptions+4) * 100
	if summary.TotalRedemptions != baseSummary.TotalRedemptions+5 ||
		summary.TrialRedemptions != baseSummary.TrialRedemptions+4 ||
		summary.TrialConverted != baseSummary.TrialConverted+1 ||
		summary.TrialConversionRate != wantRate {
		t.Errorf("summary = %+v, baseline = %+v, mau delta total +5 / trial +4 / converted +1 / rate %.2f", summary, baseSummary, wantRate)
	}

	// Handler riwayat per voucher: 4 penukar trial, hanya u1 converted.
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Params = gin.Params{{Key: "id", Value: fmt.Sprintf("%d", trial.ID)}}
	c.Request = httptest.NewRequest(http.MethodGet, "/api/admin/vouchers/"+fmt.Sprint(trial.ID)+"/redemptions", nil)
	adminListVoucherRedemptions(db)(c)
	if w.Code != http.StatusOK {
		t.Fatalf("redemptions handler status = %d, body = %s", w.Code, w.Body.String())
	}
	var body struct {
		Redemptions []voucherRedemptionItem `json:"redemptions"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &body); err != nil {
		t.Fatalf("decode redemptions: %v", err)
	}
	if len(body.Redemptions) != 4 {
		t.Fatalf("riwayat = %d baris, mau 4", len(body.Redemptions))
	}
	converted := 0
	for _, r := range body.Redemptions {
		if r.Converted {
			converted++
			if r.UserID != users[0].ID || r.FirstPaid == nil {
				t.Errorf("baris converted salah: %+v", r)
			}
		}
	}
	if converted != 1 {
		t.Errorf("riwayat converted = %d, mau 1", converted)
	}

	// Handler analitik mengembalikan JSON summary + vouchers.
	w = httptest.NewRecorder()
	c, _ = gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/api/admin/vouchers/analytics", nil)
	adminVoucherAnalytics(db)(c)
	if w.Code != http.StatusOK {
		t.Fatalf("analytics handler status = %d, body = %s", w.Code, w.Body.String())
	}
	var abody struct {
		Summary  voucherAnalyticsSummary `json:"summary"`
		Vouchers []voucherAnalyticsRow   `json:"vouchers"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &abody); err != nil {
		t.Fatalf("decode analytics: %v", err)
	}
	if abody.Summary.TrialRedemptions != baseSummary.TrialRedemptions+4 ||
		abody.Summary.TrialConverted != baseSummary.TrialConverted+1 {
		t.Errorf("analytics handler summary = %+v, baseline = %+v", abody.Summary, baseSummary)
	}
}
