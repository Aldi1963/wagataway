package handler

import (
	"crypto/rand"
	"math/big"
	"net/http"
	"strings"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerAffiliateRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	af := rg.Group("/affiliate")
	{
		af.GET("", getAffiliateInfo(db))
		af.POST("", createOrGetAffiliate(db))
		af.GET("/earnings", listAffiliateEarnings(db))
	}
}

// generateAffiliateCode membuat kode unik 8 karakter alfanumerik.
func generateAffiliateCode(db *gorm.DB) string {
	const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	for {
		b := make([]byte, 8)
		for i := range b {
			n, _ := rand.Int(rand.Reader, big.NewInt(int64(len(chars))))
			b[i] = chars[n.Int64()]
		}
		code := string(b)
		var count int64
		db.Model(&models.Affiliate{}).Where("code = ?", code).Count(&count)
		if count == 0 {
			return code
		}
	}
}

// GET /api/affiliate — info afiliasi user + statistik earning.
func getAffiliateInfo(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var aff models.Affiliate
		if err := db.Where("user_id = ?", userID).First(&aff).Error; err != nil {
			c.JSON(http.StatusOK, gin.H{"affiliate": nil})
			return
		}
		var pending, paid float64
		db.Model(&models.AffiliateEarning{}).Where("affiliate_id = ? AND status = ?", aff.ID, "pending").
			Select("COALESCE(SUM(amount),0)").Scan(&pending)
		db.Model(&models.AffiliateEarning{}).Where("affiliate_id = ? AND status = ?", aff.ID, "paid").
			Select("COALESCE(SUM(amount),0)").Scan(&paid)
		var referrals int64
		db.Model(&models.AffiliateEarning{}).Where("affiliate_id = ?", aff.ID).Count(&referrals)
		c.JSON(http.StatusOK, gin.H{
			"affiliate": aff,
			"stats": gin.H{
				"pending":   pending,
				"paid":      paid,
				"referrals": referrals,
			},
		})
	}
}

// POST /api/affiliate — buat kode referral bila belum ada (idempotent).
func createOrGetAffiliate(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var aff models.Affiliate
		if err := db.Where("user_id = ?", userID).First(&aff).Error; err == nil {
			c.JSON(http.StatusOK, gin.H{"affiliate": aff})
			return
		}
		var req struct {
			Code string `json:"code"` // opsional: kode custom
		}
		_ = c.ShouldBindJSON(&req)
		code := strings.ToUpper(strings.TrimSpace(req.Code))
		if code != "" {
			var count int64
			db.Model(&models.Affiliate{}).Where("code = ?", code).Count(&count)
			if count > 0 {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Kode sudah dipakai"})
				return
			}
		} else {
			code = generateAffiliateCode(db)
		}
		aff = models.Affiliate{UserID: userID, Code: code, CommissionRate: 0.2}
		if err := db.Create(&aff).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal membuat kode afiliasi"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"affiliate": aff})
	}
}

// GET /api/affiliate/earnings — daftar komisi.
func listAffiliateEarnings(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var aff models.Affiliate
		if err := db.Where("user_id = ?", userID).First(&aff).Error; err != nil {
			c.JSON(http.StatusOK, gin.H{"earnings": []models.AffiliateEarning{}, "total": 0})
			return
		}
		page, limit := getPageLimit(c)
		query := db.Where("affiliate_id = ?", aff.ID)
		if status := c.Query("status"); status == "pending" || status == "paid" {
			query = query.Where("status = ?", status)
		}
		var total int64
		query.Model(&models.AffiliateEarning{}).Count(&total)
		var items []models.AffiliateEarning
		query.Order("created_at DESC").Offset((page - 1) * limit).Limit(limit).Find(&items)
		c.JSON(http.StatusOK, gin.H{
			"earnings": items,
			"page":     page,
			"limit":    limit,
			"total":    total,
		})
	}
}
