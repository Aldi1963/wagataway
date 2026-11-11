// Test voucher hadiah referral (Item 9): aktivasi berbayar pertama teman
// yang diajak menerbitkan tepat satu voucher trial 7 hari untuk pengajak,
// dan aktivasi ulang / pembayaran berikutnya tidak menerbitkan hadiah lagi.
//
// DB-backed (postgres test; skip bila tidak tersedia), mengikuti pola
// trialTestDB.
package handler

import (
	"fmt"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func referralRewardTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL tidak diset — lewati test referral reward")
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Skipf("DATABASE_URL tidak valid: %v", err)
	}
	u.Path = "/wagataway_test"
	db, err := gorm.Open(postgres.Open(u.String()), &gorm.Config{})
	if err != nil {
		t.Skipf("postgres test tidak terjangkau: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Skipf("gagal ambil sql.DB: %v", err)
	}
	if err := sqlDB.Ping(); err != nil {
		t.Skipf("postgres test tidak terjangkau: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.Affiliate{},
		&models.AffiliateEarning{}, &models.ReferralReward{}, &models.Transaction{},
		&models.Voucher{}, &models.Subscription{}); err != nil {
		t.Fatalf("AutoMigrate gagal: %v", err)
	}
	return db
}

func seedReferralPair(t *testing.T, db *gorm.DB) (referrer, referred models.User, aff models.Affiliate, plan models.Plan) {
	t.Helper()
	plan = models.Plan{Name: "Regular Uji", Slug: "regular-uji-rr", Price: 66000, Duration: 30, IsActive: true}
	if err := db.Where("slug = ?", plan.Slug).FirstOrCreate(&plan).Error; err != nil {
		t.Fatalf("seed plan: %v", err)
	}
	referrer = models.User{
		Name: "Pengajak Uji", Email: "pengajak-rr@test.local", Password: "x", Role: "user", Plan: "free",
	}
	if err := db.Where("email = ?", referrer.Email).FirstOrCreate(&referrer).Error; err != nil {
		t.Fatalf("seed referrer: %v", err)
	}
	aff = models.Affiliate{UserID: referrer.ID, Code: "RRTEST01", CommissionRate: 0.2}
	if err := db.Where("user_id = ?", referrer.ID).FirstOrCreate(&aff).Error; err != nil {
		t.Fatalf("seed affiliate: %v", err)
	}
	referred = models.User{
		Name: "Teman Uji", Email: "teman-rr@test.local", Password: "x", Role: "user", Plan: "free",
		ReferredByAffiliateID: &aff.ID,
	}
	if err := db.Where("email = ?", referred.Email).FirstOrCreate(&referred).Error; err != nil {
		t.Fatalf("seed referred: %v", err)
	}
	// Bersihkan sisa run sebelumnya untuk pasangan ini.
	db.Unscoped().Where("referred_user_id = ?", referred.ID).Delete(&models.ReferralReward{})
	db.Unscoped().Where("referred_user_id = ?", referred.ID).Delete(&models.AffiliateEarning{})
	db.Unscoped().Where("user_id = ?", referred.ID).Delete(&models.Subscription{})
	db.Unscoped().Where("user_id = ?", referred.ID).Delete(&models.Transaction{})
	return referrer, referred, aff, plan
}

func TestActivateSubscriptionIssuesReferralRewardOnce(t *testing.T) {
	db := referralRewardTestDB(t)
	_, referred, _, plan := seedReferralPair(t, db)

	tx := models.Transaction{
		UserID: referred.ID, PlanID: &plan.ID, Amount: 66000,
		Status: "pending", ExternalID: fmt.Sprintf("WAG-RR-%d", time.Now().UnixNano()),
	}
	if err := db.Create(&tx).Error; err != nil {
		t.Fatalf("seed tx: %v", err)
	}

	// Aktivasi pertama → hadiah terbit.
	activated, err := activateSubscription(db, tx.ID)
	if err != nil {
		t.Fatalf("activateSubscription: %v", err)
	}
	if !activated {
		t.Fatalf("aktivasi pertama harus melaporkan activated=true")
	}
	var rewards []models.ReferralReward
	db.Where("referred_user_id = ?", referred.ID).Find(&rewards)
	if len(rewards) != 1 {
		t.Fatalf("hadiah setelah aktivasi pertama = %d, mau 1", len(rewards))
	}
	if rewards[0].ReferredUserID != referred.ID {
		t.Fatalf("referred_user_id = %d, mau %d", rewards[0].ReferredUserID, referred.ID)
	}
	if rewards[0].TransactionID == nil || *rewards[0].TransactionID != tx.ID {
		t.Fatalf("transaction_id hadiah tidak menunjuk transaksi pemicu")
	}
	var voucher models.Voucher
	if err := db.First(&voucher, rewards[0].VoucherID).Error; err != nil {
		t.Fatalf("voucher hadiah tidak ditemukan: %v", err)
	}
	if voucher.Type != "trial" || voucher.Duration != models.ReferralRewardDurationDays {
		t.Fatalf("voucher hadiah = type %q duration %d, mau trial/%d",
			voucher.Type, voucher.Duration, models.ReferralRewardDurationDays)
	}
	if voucher.MaxUses != 1 || !voucher.IsActive {
		t.Fatalf("voucher hadiah harus maxUses=1 & aktif (maxUses=%d isActive=%v)",
			voucher.MaxUses, voucher.IsActive)
	}
	if voucher.Source != models.VoucherSourceReferralReward {
		t.Fatalf("voucher source = %q, mau %q", voucher.Source, models.VoucherSourceReferralReward)
	}
	if len(voucher.Code) < len(models.ReferralRewardVoucherPrefix)+8 ||
		voucher.Code[:len(models.ReferralRewardVoucherPrefix)] != models.ReferralRewardVoucherPrefix {
		t.Fatalf("kode voucher hadiah = %q, mau berawalan %q", voucher.Code, models.ReferralRewardVoucherPrefix)
	}
	if voucher.ExpiresAt == nil || voucher.ExpiresAt.Before(time.Now().AddDate(0, 0, models.ReferralRewardExpiryDays-1)) {
		t.Fatalf("voucher hadiah harus kedaluwarsa ~%d hari lagi", models.ReferralRewardExpiryDays)
	}
	// Komisi tetap tercatat seperti biasa.
	var earnings []models.AffiliateEarning
	db.Where("referred_user_id = ?", referred.ID).Find(&earnings)
	if len(earnings) != 1 {
		t.Fatalf("komisi = %d, mau 1", len(earnings))
	}

	// Webhook terulang (aktivasi kedua atas transaksi yang sama) → tidak
	// ada hadiah kedua.
	activated, err = activateSubscription(db, tx.ID)
	if err != nil {
		t.Fatalf("aktivasi ulang: %v", err)
	}
	if activated {
		t.Fatalf("aktivasi ulang harus melaporkan activated=false")
	}
	db.Where("referred_user_id = ?", referred.ID).Find(&rewards)
	if len(rewards) != 1 {
		t.Fatalf("hadiah setelah aktivasi ulang = %d, mau tetap 1", len(rewards))
	}

	// Pembayaran KEDUA teman yang sama → tidak ada hadiah kedua.
	tx2 := models.Transaction{
		UserID: referred.ID, PlanID: &plan.ID, Amount: 66000,
		Status: "pending", ExternalID: fmt.Sprintf("WAG-RR2-%d", time.Now().UnixNano()),
	}
	if err := db.Create(&tx2).Error; err != nil {
		t.Fatalf("seed tx2: %v", err)
	}
	if _, err := activateSubscription(db, tx2.ID); err != nil {
		t.Fatalf("aktivasi kedua: %v", err)
	}
	db.Where("referred_user_id = ?", referred.ID).Find(&rewards)
	if len(rewards) != 1 {
		t.Fatalf("hadiah setelah pembayaran kedua = %d, mau tetap 1", len(rewards))
	}
}

func TestIssueReferralRewardVoucherSkipsNonFirstPayment(t *testing.T) {
	db := referralRewardTestDB(t)
	_, referred, aff, plan := seedReferralPair(t, db)

	// Teman sudah punya satu transaksi paid sebelumnya (mis. aktivasi lama
	// sebelum fitur ini) → pembayaran baru TIDAK memberi hadiah.
	old := models.Transaction{
		UserID: referred.ID, PlanID: &plan.ID, Amount: 66000,
		Status: "paid", ExternalID: fmt.Sprintf("WAG-RR-OLD-%d", time.Now().UnixNano()),
	}
	if err := db.Create(&old).Error; err != nil {
		t.Fatalf("seed old tx: %v", err)
	}
	tx := models.Transaction{
		UserID: referred.ID, PlanID: &plan.ID, Amount: 66000,
		Status: "paid", ExternalID: fmt.Sprintf("WAG-RR-NEW-%d", time.Now().UnixNano()),
	}
	if err := db.Create(&tx).Error; err != nil {
		t.Fatalf("seed tx: %v", err)
	}
	issueReferralRewardVoucher(db, aff, tx)
	var count int64
	db.Model(&models.ReferralReward{}).Where("referred_user_id = ?", referred.ID).Count(&count)
	if count != 0 {
		t.Fatalf("hadiah untuk pembayaran non-pertama = %d, mau 0", count)
	}

	// Panggilan ganda langsung (balapan webhook) untuk pembayaran pertama
	// tetap menghasilkan satu hadiah.
	db.Unscoped().Where("user_id = ?", referred.ID).Delete(&models.Transaction{})
	tx2 := models.Transaction{
		UserID: referred.ID, PlanID: &plan.ID, Amount: 66000,
		Status: "paid", ExternalID: fmt.Sprintf("WAG-RR-DUP-%d", time.Now().UnixNano()),
	}
	if err := db.Create(&tx2).Error; err != nil {
		t.Fatalf("seed tx2: %v", err)
	}
	issueReferralRewardVoucher(db, aff, tx2)
	issueReferralRewardVoucher(db, aff, tx2)
	db.Model(&models.ReferralReward{}).Where("referred_user_id = ?", referred.ID).Count(&count)
	if count != 1 {
		t.Fatalf("hadiah setelah panggilan ganda = %d, mau 1", count)
	}
}
