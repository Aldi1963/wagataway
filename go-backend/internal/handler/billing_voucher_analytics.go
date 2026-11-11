package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Analitik voucher (Item 7) — statistik pemakaian per kode voucher.
//
// Audit cara mendeteksi "pemakai trial yang lalu membayar":
//   - Jumlah pakai dihitung dari baris VoucherRedemption (jejak audit
//     penukaran; voucher.used_count hanyalah counter denormalisasi yang
//     dinaikkan dalam transaksi yang sama di redeemVoucherTx).
//   - "Konversi" = pemakai yang SETELAH menukar voucher punya transaksi
//     berbayar: transactions.status = 'paid' AND amount > 0 AND
//     created_at > redemption.created_at. amount > 0 penting: aktivasi
//     prorata bayar-0 juga menghasilkan transaksi 'paid' (lihat
//     createSubscription), tapi itu bukan pembayaran uang sungguhan.
//     Langganan non-trial saja (mis. dari voucher plan) bukan bukti bayar,
//     jadi tidak dihitung — hanya transaksi paid yang menjadi sinyal.
//   - Voucher diskon tidak pernah menghasilkan redemption (redeemVoucher
//     menolaknya 400), jadi tidak ada konversi untuk tipe itu.
//
// Tidak ada perubahan skema: semua angka dihitung dari tabel yang sudah
// ada (vouchers, voucher_redemptions, transactions).

// voucherAnalyticsRow adalah satu baris statistik per voucher.
type voucherAnalyticsRow struct {
	VoucherID      uint       `json:"voucherId"`
	Code           string     `json:"code"`
	Type           string     `json:"type"`
	PlanID         *uint      `json:"planId"`
	PlanName       string     `json:"planName"`
	Duration       int        `json:"duration"`
	Discount       int        `json:"discount"`
	MaxUses        int        `json:"maxUses"`
	UsedCount      int        `json:"usedCount"`
	IsActive       bool       `json:"isActive"`
	ExpiresAt      *time.Time `json:"expiresAt"`
	CreatedAt      time.Time  `json:"createdAt"`
	Redemptions    int        `json:"redemptions"`
	ConvertedCount int        `json:"convertedCount"`
	ConversionRate float64    `json:"conversionRate"` // persen, 0 bila belum ada penukaran
	FirstRedeemed  *time.Time `json:"firstRedeemedAt"`
	LastRedeemed   *time.Time `json:"lastRedeemedAt"`
}

// voucherAnalyticsSummary adalah ringkasan analitik voucher. Konversi
// trial→berbayar hanya dihitung dari voucher bertipe trial.
type voucherAnalyticsSummary struct {
	TotalVouchers      int     `json:"totalVouchers"`
	TotalRedemptions   int     `json:"totalRedemptions"`
	TrialRedemptions   int     `json:"trialRedemptions"`
	TrialConverted     int     `json:"trialConverted"`
	TrialConversionRate float64 `json:"trialConversionRate"` // persen
}

func conversionRate(converted, total int) float64 {
	if total <= 0 {
		return 0
	}
	return float64(converted) / float64(total) * 100
}

// computeVoucherAnalytics menghitung statistik per voucher + ringkasan.
func computeVoucherAnalytics(db *gorm.DB) (voucherAnalyticsSummary, []voucherAnalyticsRow, error) {
	var rows []voucherAnalyticsRow
	// Satu query agregat: jumlah penukaran + jumlah pemakai yang lalu
	// membayar (transaksi paid bernominal > 0 setelah penukaran).
	// COUNT(DISTINCT ...) menahan duplikasi bila satu pemakai punya
	// beberapa transaksi berbayar setelah menukar voucher yang sama.
	err := db.Raw(`
		SELECT v.id AS voucher_id, v.code, v.type, v.plan_id, v.duration,
			v.discount, v.max_uses, v.used_count, v.is_active, v.expires_at,
			v.created_at,
			COUNT(r.id) AS redemptions,
			COUNT(DISTINCT CASE WHEN t.id IS NOT NULL THEN r.user_id END) AS converted_count,
			MIN(r.created_at) AS first_redeemed,
			MAX(r.created_at) AS last_redeemed
		FROM vouchers v
		LEFT JOIN voucher_redemptions r ON r.voucher_id = v.id
		LEFT JOIN transactions t
			ON t.user_id = r.user_id
			AND t.status = 'paid' AND t.amount > 0
			AND t.created_at > r.created_at
		GROUP BY v.id
		ORDER BY v.created_at DESC`).Scan(&rows).Error
	if err != nil {
		return voucherAnalyticsSummary{}, nil, err
	}

	// Nama paket untuk voucher bertipe plan (sekali jalan, tanpa N+1).
	planIDs := make([]uint, 0, len(rows))
	for _, r := range rows {
		if r.PlanID != nil {
			planIDs = append(planIDs, *r.PlanID)
		}
	}
	if len(planIDs) > 0 {
		var plans []models.Plan
		db.Where("id IN ?", planIDs).Find(&plans)
		planNames := map[uint]string{}
		for _, p := range plans {
			planNames[p.ID] = p.Name
		}
		for i := range rows {
			if rows[i].PlanID != nil {
				rows[i].PlanName = planNames[*rows[i].PlanID]
			}
		}
	}

	summary := voucherAnalyticsSummary{TotalVouchers: len(rows)}
	for i := range rows {
		rows[i].ConversionRate = conversionRate(rows[i].ConvertedCount, rows[i].Redemptions)
		summary.TotalRedemptions += rows[i].Redemptions
		if rows[i].Type == "trial" {
			summary.TrialRedemptions += rows[i].Redemptions
			summary.TrialConverted += rows[i].ConvertedCount
		}
	}
	summary.TrialConversionRate = conversionRate(summary.TrialConverted, summary.TrialRedemptions)
	return summary, rows, nil
}

// GET /api/admin/vouchers/analytics — ringkasan + statistik per voucher.
func adminVoucherAnalytics(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		summary, rows, err := computeVoucherAnalytics(db)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memuat analitik voucher"})
			return
		}
		if rows == nil {
			rows = []voucherAnalyticsRow{}
		}
		c.JSON(http.StatusOK, gin.H{"summary": summary, "vouchers": rows})
	}
}

// voucherRedemptionItem adalah satu baris riwayat penukaran sebuah voucher.
type voucherRedemptionItem struct {
	ID         uint       `json:"id"`
	UserID     uint       `json:"userId"`
	UserName   string     `json:"userName"`
	UserEmail  string     `json:"userEmail"`
	RedeemedAt time.Time  `json:"redeemedAt"`
	Converted  bool       `json:"converted"` // punya transaksi paid > 0 setelah penukaran
	FirstPaid  *time.Time `json:"firstPaidAt"`
}

// GET /api/admin/vouchers/:id/redemptions — riwayat siapa saja yang memakai
// sebuah voucher, terbaru dulu (maks. 100), beserta status konversinya.
func adminListVoucherRedemptions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var voucher models.Voucher
		if err := db.First(&voucher, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Voucher tidak ditemukan"})
			return
		}
		var items []voucherRedemptionItem
		err := db.Raw(`
			SELECT r.id, r.user_id, u.name AS user_name, u.email AS user_email,
				r.created_at AS redeemed_at,
				MIN(t.paid_at) AS first_paid
			FROM voucher_redemptions r
			JOIN users u ON u.id = r.user_id
			LEFT JOIN transactions t
				ON t.user_id = r.user_id
				AND t.status = 'paid' AND t.amount > 0
				AND t.created_at > r.created_at
			WHERE r.voucher_id = ?
			GROUP BY r.id, r.user_id, u.name, u.email, r.created_at
			ORDER BY r.created_at DESC
			LIMIT 100`, id).Scan(&items).Error
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memuat riwayat voucher"})
			return
		}
		if items == nil {
			items = []voucherRedemptionItem{}
		}
		for i := range items {
			items[i].Converted = items[i].FirstPaid != nil
		}
		c.JSON(http.StatusOK, gin.H{"voucher": voucher, "redemptions": items})
	}
}
