package handler

import (
	"net/http"

	"github.com/Aldi1963/wagataway/internal/quota"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// requireMessageQuota memeriksa kuota pesan bulanan user sebelum mengirim.
// n = jumlah pesan yang akan dikirim (bulk: jumlah penerima).
// Bila kuota habis, menulis respons 429 dengan code QUOTA_EXCEEDED dan
// mengembalikan false — caller harus langsung return.
//
// Gate langganan (Fitur 5) terintegrasi via quota.CheckN: expired >= 3 hari
// → respons 403 code SUBSCRIPTION_EXCEEDED... (lihat quota.Result.Code);
// batas 20 pesan/hari selama grace → 429 code SUBSCRIPTION_GRACE_LIMIT.
//
// Pemeriksaan level manager (whatsapp.SendMessageWithOptions) tetap menjadi
// backstop untuk jalur non-HTTP (automation, worker); helper ini memberi
// respons API yang jelas untuk jalur HTTP.
func requireMessageQuota(c *gin.Context, db *gorm.DB, userID uint, n int64) bool {
	qr, err := quota.CheckN(db, userID, n)
	if err != nil {
		// Gagal baca DB bukan alasan memblokir user: biarkan jalan,
		// backstop manager akan mencatat peringatan di log.
		return true
	}
	if qr.Allowed {
		return true
	}
	code := qr.Code()
	status := http.StatusTooManyRequests
	if qr.SubExpired {
		status = http.StatusForbidden
	}
	c.JSON(status, gin.H{
		"message": quota.ExceededMessage(qr),
		"code":    code,
		"quota": gin.H{
			"planName":      qr.PlanName,
			"usedThisMonth": qr.Used,
			"limit":         qr.Limit,
			"remaining":     qr.Remaining(),
			"isTrial":       qr.IsTrial,
		},
		"subscription": gin.H{
			"state":          qr.SubState,
			"graceDaysLeft":  qr.SubGraceDaysLeft,
			"graceUsedToday": qr.SubGraceUsed,
			"graceDailyLimit": qr.SubGraceLimit,
		},
	})
	return false
}
