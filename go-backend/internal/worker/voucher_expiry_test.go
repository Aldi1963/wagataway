package worker

import (
	"fmt"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
)

// TestVoucherUsageAlerts: ambang peringatan 90% — di bawah 90% tenang,
// tepat 90% dan di atasnya (tapi belum habis) "hampir habis", 100% "habis".
func TestVoucherUsageAlerts(t *testing.T) {
	cases := []struct {
		name   string
		used   int
		max    int
		nearly bool
		spent  bool
	}{
		{"di bawah ambang", 8, 10, false, false},
		{"tepat 90%", 9, 10, true, false},
		{"di atas 90%", 19, 20, true, false},
		{"tepat habis", 10, 10, false, true},
		{"lewat kuota", 11, 10, false, true},
		{"tanpa batas kuota", 999, 0, false, false},
	}
	for _, tc := range cases {
		v := models.Voucher{UsedCount: tc.used, MaxUses: tc.max}
		if got := IsVoucherNearlyExhausted(v); got != tc.nearly {
			t.Errorf("%s: nearly=%v, mau %v", tc.name, got, tc.nearly)
		}
		if got := IsVoucherExhausted(v); got != tc.spent {
			t.Errorf("%s: exhausted=%v, mau %v", tc.name, got, tc.spent)
		}
	}
}

// TestVoucherExpiryCheck: ExpiresAt nil = tanpa batas waktu, tidak pernah
// dianggap kedaluwarsa.
func TestVoucherExpiryCheck(t *testing.T) {
	now := time.Now()
	past := now.Add(-time.Hour)
	future := now.Add(time.Hour)
	if IsVoucherExpired(models.Voucher{}, now) {
		t.Error("ExpiresAt nil tidak boleh dianggap kedaluwarsa")
	}
	if !IsVoucherExpired(models.Voucher{ExpiresAt: &past}, now) {
		t.Error("ExpiresAt yang sudah lewat harus dianggap kedaluwarsa")
	}
	if IsVoucherExpired(models.Voucher{ExpiresAt: &future}, now) {
		t.Error("ExpiresAt di masa depan tidak boleh dianggap kedaluwarsa")
	}
}

// TestDeactivateExpiredVouchers: job menonaktifkan HANYA voucher aktif yang
// ExpiresAt-nya lewat — voucher tanpa batas waktu, yang masih berlaku, dan
// yang sudah nonaktif tidak disentuh. Idempoten: jalan kedua 0 baris.
func TestDeactivateExpiredVouchers(t *testing.T) {
	db := schedulerTestDB(t)
	if err := db.AutoMigrate(&models.Voucher{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	now := time.Now()
	past := now.Add(-time.Hour)
	future := now.Add(time.Hour)
	// Prefix unik per run: DB test dipakai bersama worker paralel lain.
	prefix := fmt.Sprintf("ALERT-%d-", time.Now().UnixNano())
	seed := []models.Voucher{
		{Code: prefix + "EXPIRED", Type: "trial", MaxUses: 10, IsActive: true, ExpiresAt: &past},
		{Code: prefix + "FUTURE", Type: "trial", MaxUses: 10, IsActive: true, ExpiresAt: &future},
		{Code: prefix + "NOEXPIRY", Type: "trial", MaxUses: 10, IsActive: true},
		{Code: prefix + "ALREADY-OFF", Type: "trial", MaxUses: 10, IsActive: false, ExpiresAt: &past},
	}
	for i := range seed {
		if err := db.Create(&seed[i]).Error; err != nil {
			t.Fatalf("seed %s: %v", seed[i].Code, err)
		}
	}
	ids := []uint{seed[0].ID, seed[1].ID, seed[2].ID, seed[3].ID}
	t.Cleanup(func() {
		db.Unscoped().Where("id IN ?", ids).Delete(&models.Voucher{})
	})

	n, err := deactivateExpiredVouchers(db, now)
	if err != nil {
		t.Fatalf("deactivate: %v", err)
	}
	// Jumlah pasti tidak diasumsikan: test lain (worker paralel) memakai
	// DB test yang sama dan bisa ikut menyumbang voucher kedaluwarsa.
	// Yang dijamin: keempat baris seed kami berakhir pada status yang benar.
	if n < 1 {
		t.Fatalf("dinonaktifkan=%d, mau >= 1", n)
	}
	checkStates := func(label string) {
		t.Helper()
		for i, tc := range []struct {
			name string
			want bool
		}{
			{"EXPIRED", false},
			{"FUTURE", true},
			{"NOEXPIRY", true},
			{"ALREADY-OFF", false},
		} {
			// `got` harus fresh tiap iterasi: GORM ikut memakai primary key
			// yang sudah terisi di struct tujuan sebagai kondisi query.
			var got models.Voucher
			if err := db.First(&got, ids[i]).Error; err != nil {
				t.Fatalf("%s: baca %s (id=%d): %v", label, tc.name, ids[i], err)
			}
			if got.IsActive != tc.want {
				t.Errorf("%s: %s: isActive=%v, mau %v", label, tc.name, got.IsActive, tc.want)
			}
		}
	}
	checkStates("jalan pertama")

	// Jalan kedua: idempoten untuk baris kami — statusnya tidak berubah
	// (jumlah baris global tidak diasumsikan karena DB test dipakai bersama).
	if _, err := deactivateExpiredVouchers(db, now); err != nil {
		t.Fatalf("deactivate kedua: %v", err)
	}
	checkStates("jalan kedua")
}
