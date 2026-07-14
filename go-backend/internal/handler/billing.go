package handler

import (
	"net/http"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerBillingRoutes(rg *gin.RouterGroup, cfg *config.Config, db *gorm.DB) {
	b := rg.Group("/billing")
	{
		b.GET("/plans", listPlans(db))
		b.GET("/subscription", getSubscription(db))
		b.POST("/subscribe", createSubscription(cfg, db))
		b.GET("/transactions", listTransactions(db))
		b.POST("/voucher/redeem", redeemVoucher(db))
	}
}

func listPlans(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var plans []models.Plan
		db.Where("is_active = ?", true).Order("sort_order ASC").Find(&plans)
		c.JSON(http.StatusOK, gin.H{"plans": plans})
	}
}

func getSubscription(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var sub models.Subscription
		err := db.Where("user_id = ? AND status = ?", userID, "active").
			Preload("Plan").First(&sub).Error
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"subscription": nil})
			return
		}
		c.JSON(http.StatusOK, gin.H{"subscription": sub})
	}
}

func createSubscription(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			PlanID        uint   `json:"planId" binding:"required"`
			PaymentMethod string `json:"paymentMethod"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Plan wajib dipilih"})
			return
		}

		var plan models.Plan
		if err := db.First(&plan, req.PlanID).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Paket tidak ditemukan"})
			return
		}

		// Create transaction record
		tx := models.Transaction{
			UserID:        userID,
			PlanID:        &req.PlanID,
			Amount:        plan.Price,
			Status:        "pending",
			PaymentMethod: req.PaymentMethod,
		}
		db.Create(&tx)

		// TODO: integrate with payment gateway (Midtrans/Xendit)
		// For now return transaction for manual confirmation
		c.JSON(http.StatusCreated, gin.H{
			"transaction": tx,
			"plan":        plan,
			"message":     "Transaksi dibuat, menunggu pembayaran",
		})
	}
}


func listTransactions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var txs []models.Transaction
		db.Where("user_id = ?", userID).Preload("Plan").
			Order("created_at DESC").Limit(50).Find(&txs)
		c.JSON(http.StatusOK, gin.H{"transactions": txs})
	}
}

func redeemVoucher(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			Code string `json:"code" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Kode voucher wajib"})
			return
		}

		var voucher models.Voucher
		if err := db.Where("code = ? AND is_active = ?", req.Code, true).First(&voucher).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Voucher tidak valid atau sudah tidak aktif"})
			return
		}

		if voucher.MaxUses > 0 && voucher.UsedCount >= voucher.MaxUses {
			c.JSON(http.StatusConflict, gin.H{"message": "Voucher sudah habis dipakai"})
			return
		}

		if voucher.ExpiresAt != nil && voucher.ExpiresAt.Before(java_time_now()) {
			c.JSON(http.StatusGone, gin.H{"message": "Voucher sudah kadaluarsa"})
			return
		}

		// Apply voucher based on type
		switch voucher.Type {
		case "trial":
			// Extend subscription with trial days
			db.Model(&models.User{}).Where("id = ?", userID).Update("plan", "trial")
		case "discount":
			// Store discount for next payment
		}

		// Increment used count
		db.Model(&voucher).Update("used_count", gorm.Expr("used_count + 1"))

		c.JSON(http.StatusOK, gin.H{
			"message": "Voucher berhasil digunakan",
			"voucher": voucher,
		})
	}
}

func java_time_now() time.Time {
	return time.Now()
}
