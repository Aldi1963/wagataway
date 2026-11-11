package handler

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Jendela berlaku voucher (Item 3): StartsAt/EndsAt di samping ExpiresAt.
//   - sekarang < StartsAt  → 403 "Voucher belum berlaku"
//   - sekarang > EndsAt    → 410 "Voucher sudah berakhir" (beda pesan dari
//     ExpiresAt: "Voucher sudah kadaluarsa")
//   - di dalam jendela / tanpa jadwal → lolos seperti dulu.
// Penolakan terjadi SEBELUM transaksi redeem: tidak ada pencatatan
// penukaran dan UsedCount tidak bertambah.

func mkScheduleVoucher(t *testing.T, db *gorm.DB, code string, planID uint, startsAt, endsAt, expiresAt *time.Time) models.Voucher {
	t.Helper()
	db.Unscoped().Where("code = ?", code).Delete(&models.Voucher{})
	v := models.Voucher{Code: code, Type: "plan", PlanID: &planID,
		Duration: 30, MaxUses: 10, UsedCount: 0, IsActive: true,
		StartsAt: startsAt, EndsAt: endsAt, ExpiresAt: expiresAt}
	if err := db.Create(&v).Error; err != nil {
		t.Fatalf("seed voucher %s: %v", code, err)
	}
	return v
}

// redeemScheduleVoucher memanggil handler redeemVoucher lewat HTTP seperti
// request asli (userID ditanam di context seperti middleware auth).
func redeemScheduleVoucher(t *testing.T, db *gorm.DB, uid uint, code string) (int, string) {
	t.Helper()
	gin.SetMode(gin.TestMode)
	r := gin.New()
	r.Use(func(c *gin.Context) { c.Set("userID", uid); c.Next() })
	r.POST("/voucher/redeem", redeemVoucher(db))
	body := `{"code":"` + code + `"}`
	w := httptest.NewRecorder()
	req := httptest.NewRequest(http.MethodPost, "/voucher/redeem", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	r.ServeHTTP(w, req)
	return w.Code, w.Body.String()
}

func TestRedeemVoucherSchedule(t *testing.T) {
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Plan{}, &models.Voucher{},
		&models.VoucherRedemption{}, &models.Subscription{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	plan := mkQueuePlan(t, db, "regular-schedule", "Regular Schedule", 100000)
	now := time.Now()
	past24h := now.Add(-24 * time.Hour)
	past48h := now.Add(-48 * time.Hour)
	next24h := now.Add(24 * time.Hour)
	next48h := now.Add(48 * time.Hour)
	past1h := now.Add(-1 * time.Hour)

	cases := []struct {
		name      string
		startsAt  *time.Time
		endsAt    *time.Time
		expiresAt *time.Time
		wantCode  int
		wantMsg   string
		wantOK    bool // redeem berhasil → langganan + UsedCount tercatat
	}{
		{"belum berlaku", &next24h, &next48h, nil, http.StatusForbidden, "Voucher belum berlaku", false},
		{"sudah berakhir", &past48h, &past24h, nil, http.StatusGone, "Voucher sudah berakhir", false},
		{"di dalam jendela", &past24h, &next24h, nil, http.StatusOK, "Voucher berhasil digunakan", true},
		{"tanpa jadwal", nil, nil, nil, http.StatusOK, "Voucher berhasil digunakan", true},
		{"hanya mulai di masa lalu", &past24h, nil, nil, http.StatusOK, "Voucher berhasil digunakan", true},
		{"hanya berakhir di masa depan", nil, &next24h, nil, http.StatusOK, "Voucher berhasil digunakan", true},
		// ExpiresAt yang lewat tetap memakai pesan lamanya, bukan pesan jendela.
		{"kadaluarsa ExpiresAt", nil, nil, &past1h, http.StatusGone, "Voucher sudah kadaluarsa", false},
	}

	for i, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			uid := uint(93001 + i)
			queueClean(t, db, uid)
			mkQueueUser(t, db, uid, "regular-schedule")
			code := "SCHED-" + strings.ToUpper(strings.ReplaceAll(tc.name, " ", "-"))
			v := mkScheduleVoucher(t, db, code, plan.ID, tc.startsAt, tc.endsAt, tc.expiresAt)

			status, body := redeemScheduleVoucher(t, db, uid, code)
			if status != tc.wantCode {
				t.Fatalf("status = %d (%s), mau %d", status, body, tc.wantCode)
			}
			if !strings.Contains(body, tc.wantMsg) {
				t.Errorf("body = %s, mau mengandung %q", body, tc.wantMsg)
			}

			// Penolakan tidak boleh meninggalkan jejak penukaran.
			var redCount int64
			db.Model(&models.VoucherRedemption{}).
				Where("voucher_id = ? AND user_id = ?", v.ID, uid).Count(&redCount)
			var after models.Voucher
			db.First(&after, v.ID)
			if tc.wantOK {
				if redCount != 1 {
					t.Errorf("redemption = %d, mau 1", redCount)
				}
				if after.UsedCount != 1 {
					t.Errorf("usedCount = %d, mau 1", after.UsedCount)
				}
				var sub models.Subscription
				if err := db.Where("user_id = ? AND plan_id = ?", uid, plan.ID).First(&sub).Error; err != nil {
					t.Errorf("langganan tidak terbentuk: %v", err)
				}
			} else {
				if redCount != 0 {
					t.Errorf("redemption = %d, mau 0 (redeem ditolak)", redCount)
				}
				if after.UsedCount != 0 {
					t.Errorf("usedCount = %d, mau 0 (redeem ditolak)", after.UsedCount)
				}
			}
		})
	}
}
