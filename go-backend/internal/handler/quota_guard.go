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
	c.JSON(http.StatusTooManyRequests, gin.H{
		"message": quota.ExceededMessage(qr),
		"code":    "QUOTA_EXCEEDED",
		"quota": gin.H{
			"planName":      qr.PlanName,
			"usedThisMonth": qr.Used,
			"limit":         qr.Limit,
			"remaining":     qr.Remaining(),
			"isTrial":       qr.IsTrial,
		},
	})
	return false
}
