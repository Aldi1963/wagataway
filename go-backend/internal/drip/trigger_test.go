package drip

import (
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

func testDB(t *testing.T) *gorm.DB {
	t.Helper()
	db, err := gorm.Open(sqlite.Open(":memory:"), &gorm.Config{})
	if err != nil {
		t.Fatalf("sqlite: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.Device{}, &models.DripCampaign{},
		&models.DripStep{}, &models.DripEnrollment{}, &models.BotOrder{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	return db
}

func seedCampaign(t *testing.T, db *gorm.DB, triggerType, triggerVal string) models.DripCampaign {
	t.Helper()
	db.Create(&models.User{ID: 1, UUID: "00000000-0000-0000-0000-000000000001", Name: "T", Email: "t@test.local", Password: "x"})
	db.Create(&models.Device{ID: 1, UserID: 1, Name: "D1", Status: "connected"})
	c := models.DripCampaign{
		UserID: 1, DeviceID: 1, Name: "C", TriggerType: triggerType,
		TriggerVal: triggerVal, IsActive: true, CancelOnReply: true, OptOutKeyword: "STOP",
	}
	if err := db.Create(&c).Error; err != nil {
		t.Fatalf("seed campaign: %v", err)
	}
	db.Create(&models.DripStep{CampaignID: c.ID, StepOrder: 1, DelayHours: 24, Type: "text", Content: "halo"})
	db.Create(&models.DripStep{CampaignID: c.ID, StepOrder: 2, DelayMinutes: 90, Type: "text", Content: "lagi"})
	return c
}

func TestStepDelayMinutes(t *testing.T) {
	if got := StepDelayMinutes(models.DripStep{DelayHours: 24}); got != 1440 {
		t.Errorf("DelayHours 24 -> %d menit, want 1440", got)
	}
	if got := StepDelayMinutes(models.DripStep{DelayHours: 24, DelayMinutes: 90}); got != 90 {
		t.Errorf("DelayMinutes menang -> %d, want 90", got)
	}
	if got := StepDelayMinutes(models.DripStep{}); got != 1440 {
		t.Errorf("default -> %d, want 1440", got)
	}
}

func TestEnrollPhoneIdempotent(t *testing.T) {
	db := testDB(t)
	c := seedCampaign(t, db, TriggerOrderPaid, "")

	created, err := EnrollPhone(db, c, "6281234567890", TriggerOrderPaid, "order:7", time.Now())
	if err != nil || !created {
		t.Fatalf("enroll pertama: created=%v err=%v", created, err)
	}
	// Ref sama (order sama) tidak boleh mendaftar ganda.
	created, err = EnrollPhone(db, c, "6281234567890", TriggerOrderPaid, "order:7", time.Now())
	if err != nil || created {
		t.Errorf("enroll ref sama: created=%v err=%v, want false/nil", created, err)
	}
	// Tanpa ref, enrollment aktif yang sama tidak boleh ganda.
	created, _ = EnrollPhone(db, c, "6281234567890", TriggerNewContact, "", time.Now())
	if created {
		t.Errorf("enroll aktif ganda tanpa ref: created=true, want false")
	}
	var n int64
	db.Model(&models.DripEnrollment{}).Count(&n)
	if n != 1 {
		t.Errorf("jumlah enrollment=%d, want 1", n)
	}
}

func TestFireEventOrderPaid(t *testing.T) {
	db := testDB(t)
	seedCampaign(t, db, TriggerOrderPaid, "")
	seedCampaign(t, db, TriggerOrderCreated, "")
	// Campaign order_paid dengan productId tertentu — tidak cocok.
	seedCampaign(t, db, TriggerOrderPaid, "999")

	n, err := FireEvent(db, 1, 1, TriggerOrderPaid, "6281234567890", "order:1", map[string]string{"productId": "5"})
	if err != nil || n != 1 {
		t.Fatalf("FireEvent order_paid: n=%d err=%v, want 1", n, err)
	}
	// Dipicu lagi dengan ref sama: tidak ada enrollment baru.
	n, err = FireEvent(db, 1, 1, TriggerOrderPaid, "6281234567890", "order:1", map[string]string{"productId": "5"})
	if err != nil || n != 0 {
		t.Fatalf("FireEvent ulang: n=%d err=%v, want 0", n, err)
	}
}

func TestFireNamedEvent(t *testing.T) {
	db := testDB(t)
	seedCampaign(t, db, TriggerEvent, "vip_joined")
	seedCampaign(t, db, TriggerEvent, "lain")

	n, err := FireNamedEvent(db, 1, 1, "vip_joined", "6281234567890", "")
	if err != nil || n != 1 {
		t.Fatalf("FireNamedEvent: n=%d err=%v, want 1", n, err)
	}
}

func TestHandleIncomingStopCancels(t *testing.T) {
	db := testDB(t)
	c := seedCampaign(t, db, TriggerOrderPaid, "")
	EnrollPhone(db, c, "6281234567890", TriggerOrderPaid, "order:1", time.Now())

	if err := HandleIncoming(db, 1, 1, "6281234567890", "STOP", false); err != nil {
		t.Fatalf("HandleIncoming STOP: %v", err)
	}
	var enr models.DripEnrollment
	db.First(&enr)
	if enr.Status != "cancelled" || enr.CancelReason != "stop_keyword" {
		t.Errorf("setelah STOP: status=%q reason=%q, want cancelled/stop_keyword", enr.Status, enr.CancelReason)
	}
}

func TestHandleIncomingReplyCancelsWhenCancelOnReply(t *testing.T) {
	db := testDB(t)
	c := seedCampaign(t, db, TriggerOrderPaid, "")
	EnrollPhone(db, c, "6281234567890", TriggerOrderPaid, "order:1", time.Now())

	if err := HandleIncoming(db, 1, 1, "6281234567890", "oke kak", false); err != nil {
		t.Fatalf("HandleIncoming reply: %v", err)
	}
	var enr models.DripEnrollment
	db.First(&enr)
	if enr.Status != "cancelled" || enr.CancelReason != "replied" {
		t.Errorf("setelah balas: status=%q reason=%q, want cancelled/replied", enr.Status, enr.CancelReason)
	}
	if enr.LastReplyAt == nil {
		t.Errorf("LastReplyAt tidak tercatat")
	}
}

func TestHandleIncomingNewContact(t *testing.T) {
	db := testDB(t)
	seedCampaign(t, db, TriggerNewContact, "")
	seedCampaign(t, db, TriggerKeyword, "daftar")

	if err := HandleIncoming(db, 1, 1, "6281234567890", "halo saya mau daftar", true); err != nil {
		t.Fatalf("HandleIncoming new: %v", err)
	}
	var n int64
	db.Model(&models.DripEnrollment{}).Count(&n)
	if n != 2 {
		t.Errorf("enrollment=%d, want 2 (new_contact + keyword)", n)
	}
}

func TestClaimEnrollmentSingleWinner(t *testing.T) {
	db := testDB(t)
	c := seedCampaign(t, db, TriggerOrderPaid, "")
	EnrollPhone(db, c, "6281234567890", TriggerOrderPaid, "order:1", time.Now())
	var enr models.DripEnrollment
	db.First(&enr)
	now := time.Now()

	if !ClaimEnrollment(db, enr.ID, now) {
		t.Fatalf("klaim pertama gagal")
	}
	// Worker kedua (atau proses yang sama jalan dua kali) tidak boleh menang.
	if ClaimEnrollment(db, enr.ID, now) {
		t.Errorf("klaim kedua berhasil — langkah bisa terkirim ganda")
	}
	// Klaim basi (>10 menit) boleh diambil alih.
	if !ClaimEnrollment(db, enr.ID, now.Add(11*time.Minute)) {
		t.Errorf("klaim basi tidak bisa diambil alih")
	}
}

func TestShouldSkipStepReply(t *testing.T) {
	db := testDB(t)
	c := seedCampaign(t, db, TriggerOrderPaid, "")
	now := time.Now()
	sent := now.Add(-2 * time.Hour)
	replied := now.Add(-1 * time.Hour)
	enr := models.DripEnrollment{
		CampaignID: c.ID, Phone: "6281234567890", CurrentStep: 1,
		Status: "active", LastSentAt: &sent, LastReplyAt: &replied,
	}
	step := models.DripStep{SkipIfReplied: true}
	if !ShouldSkipStep(db, enr, c, step) {
		t.Errorf("SkipIfReplied: kontak membalas setelah kirim — langkah harus dilewati")
	}
	// Balasan SEBELUM kirim terakhir bukan alasan lewati.
	oldReply := now.Add(-3 * time.Hour)
	enr.LastReplyAt = &oldReply
	if ShouldSkipStep(db, enr, c, step) {
		t.Errorf("SkipIfReplied: balasan lama — langkah tidak boleh dilewati")
	}
}

func TestShouldSkipStepOrderStatus(t *testing.T) {
	db := testDB(t)
	c := seedCampaign(t, db, TriggerOrderPaid, "")
	db.Create(&models.BotOrder{UserID: 1, ProductID: 1, BuyerPhone: "6281234567890", Total: 50000, Status: "pending"})
	enr := models.DripEnrollment{CampaignID: c.ID, Phone: "6281234567890", Status: "active"}

	step := models.DripStep{RequireOrderStatus: "paid"}
	if !ShouldSkipStep(db, enr, c, step) {
		t.Errorf("RequireOrderStatus=paid tapi order pending — langkah harus dilewati")
	}
	step.RequireOrderStatus = "pending"
	if ShouldSkipStep(db, enr, c, step) {
		t.Errorf("RequireOrderStatus=pending dan order pending — langkah harus dikirim")
	}
	// Kontak tanpa order: langkah bersyarat dilewati.
	enr.Phone = "6289999999999"
	if !ShouldSkipStep(db, enr, c, step) {
		t.Errorf("tanpa order — langkah bersyarat harus dilewati")
	}
}

func TestProcessTimeTriggers(t *testing.T) {
	db := testDB(t)
	now := time.Now()
	c := seedCampaign(t, db, TriggerDaysSincePurchase, "3")
	// Order lunas 4 hari lalu (melewati ambang 3 hari, dalam jendela 48 jam).
	old := now.Add(-4 * 24 * time.Hour)
	db.Create(&models.BotOrder{UserID: 1, ProductID: 1, BuyerPhone: "6281111111111", Total: 10000, Status: "paid", CreatedAt: old, UpdatedAt: old})
	// Order lunas 30 hari lalu — di luar jendela, jangan didaftarkan.
	veryOld := now.Add(-30 * 24 * time.Hour)
	db.Create(&models.BotOrder{UserID: 1, ProductID: 1, BuyerPhone: "6282222222222", Total: 10000, Status: "paid", CreatedAt: veryOld, UpdatedAt: veryOld})
	// Order masih pending 4 hari lalu — bukan pembelian.
	db.Create(&models.BotOrder{UserID: 1, ProductID: 1, BuyerPhone: "6283333333333", Total: 10000, Status: "pending", CreatedAt: old, UpdatedAt: old})

	n, err := ProcessTimeTriggers(db, now)
	if err != nil || n != 1 {
		t.Fatalf("ProcessTimeTriggers: n=%d err=%v, want 1", n, err)
	}
	// Pemindaian kedua: tidak ada enrollment baru (idempotent per order).
	n, err = ProcessTimeTriggers(db, now)
	if err != nil || n != 0 {
		t.Fatalf("ProcessTimeTriggers ulang: n=%d err=%v, want 0", n, err)
	}
	var enr models.DripEnrollment
	if err := db.Where("campaign_id = ?", c.ID).First(&enr).Error; err != nil {
		t.Fatalf("enrollment tidak ada: %v", err)
	}
	if enr.Phone != "6281111111111" {
		t.Errorf("enrollment phone=%s, want 6281111111111", enr.Phone)
	}
}
