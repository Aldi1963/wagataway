package handler

import (
	"errors"
	"fmt"
	"net/http"
	"strings"
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
		b.GET("/usage", getBillingUsage(db))
		b.POST("/subscribe", createSubscription(cfg, db))
		b.GET("/transactions", listTransactions(db))
		b.GET("/transactions/:id", getBillingTransaction(cfg, db))
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

// GET /api/billing/usage — kuota paket & pemakaian pesan bulan ini
func getBillingUsage(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		planName := "Free"
		quota := 1000
		var sub models.Subscription
		if err := db.Where("user_id = ? AND status = ?", userID, "active").
			Preload("Plan").First(&sub).Error; err == nil {
			planName = sub.Plan.Name
			quota = sub.Plan.MaxMessages
		}

		now := time.Now()
		startOfMonth := time.Date(now.Year(), now.Month(), 1, 0, 0, 0, 0, now.Location())
		var used int64
		db.Model(&models.Message{}).
			Where("user_id = ? AND direction = ? AND created_at >= ?", userID, "outgoing", startOfMonth).
			Count(&used)

		remaining := quota - int(used)
		if remaining < 0 {
			remaining = 0
		}

		c.JSON(http.StatusOK, gin.H{
			"planName":      planName,
			"quota":         quota,
			"usedThisMonth": int(used),
			"remaining":     remaining,
		})
	}
}

func createSubscription(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			PlanID uint `json:"planId" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Plan wajib dipilih"})
			return
		}

		var plan models.Plan
		if err := db.Where("id = ? AND is_active = ?", req.PlanID, true).First(&plan).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Paket tidak ditemukan"})
			return
		}
		if plan.Price <= 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Paket gratis tidak perlu pembayaran"})
			return
		}

		kp := newClipkuPay(cfg, db)
		if !kp.enabled() {
			c.JSON(http.StatusServiceUnavailable, gin.H{"message": "Payment gateway belum dikonfigurasi"})
			return
		}

		var user models.User
		if err := db.First(&user, userID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "User tidak ditemukan"})
			return
		}

		orderID := fmt.Sprintf("WAG-%d-%d", userID, time.Now().Unix())

		// Catat transaksi lokal dulu sebagai pending
		tx := models.Transaction{
			UserID:        userID,
			PlanID:        &req.PlanID,
			Amount:        plan.Price,
			Status:        "pending",
			PaymentMethod: "clipkupay",
			ExternalID:    orderID,
		}
		if err := db.Create(&tx).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat transaksi"})
			return
		}

		// Buat transaksi di Clipku Pay
		data, err := kp.createTransaction(orderID, plan.Price, user.Name, user.Email)
		if err != nil {
			db.Model(&tx).Update("status", "failed")
			c.JSON(http.StatusBadGateway, gin.H{"message": "Gagal membuat pembayaran: " + err.Error()})
			return
		}
		db.Model(&tx).Updates(map[string]any{"payment_ref": data.PaymentURL})

		c.JSON(http.StatusCreated, gin.H{
			"transaction": tx,
			"plan":        plan,
			"orderId":     orderID,
			"paymentUrl":  data.PaymentURL,
			"qrUrl":       data.QrURL,
			"message":     "Transaksi dibuat, silakan selesaikan pembayaran",
		})
	}
}

// GET /api/billing/transactions/:id — cek status + sinkron dari Clipku Pay bila pending.
func getBillingTransaction(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	kp := newClipkuPay(cfg, db)
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var tx models.Transaction
		if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).
			Preload("Plan").First(&tx).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Transaksi tidak ditemukan"})
			return
		}

		// Sinkronkan status dari Clipku Pay bila masih pending
		if tx.Status == "pending" && tx.ExternalID != "" && kp.enabled() {
			if remote, err := kp.getTransaction(tx.ExternalID); err == nil {
				if clipkuIsPaid(remote.Status) {
					_ = activateSubscription(db, tx.ID)
					db.Where("id = ?", tx.ID).Preload("Plan").First(&tx)
				} else {
					st := strings.ToLower(strings.TrimSpace(remote.Status))
					if st == "expired" || st == "failed" || st == "cancelled" {
						db.Model(&tx).Update("status", st)
						tx.Status = st
					}
				}
			}
		}
		tx.InvoiceNumber = invoiceNumber(tx.ID, tx.CreatedAt)
		c.JSON(http.StatusOK, gin.H{"transaction": tx})
	}
}

func listTransactions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var txs []models.Transaction
		db.Where("user_id = ?", userID).Preload("Plan").
			Order("created_at DESC").Limit(50).Find(&txs)
		for i := range txs {
			txs[i].InvoiceNumber = invoiceNumber(txs[i].ID, txs[i].CreatedAt)
		}
		c.JSON(http.StatusOK, gin.H{"transactions": txs})
	}
}

// invoiceNumber mengembalikan nomor invoice deterministik dari ID transaksi.
// Memakai tahun & bulan dari CreatedAt sehingga stabil (tidak berubah antar
// request) tanpa perlu kolom baru di DB.
func invoiceNumber(txID uint, createdAt time.Time) string {
	romans := [12]string{"I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII"}
	m := int(createdAt.Month())
	if m < 1 || m > 12 {
		m = 1
	}
	return fmt.Sprintf("INV/%04d/%s/%06d", createdAt.Year(), romans[m-1], txID)
}

// errAlreadyRedeemed menandai percobaan redeem ganda oleh user yang sama.
var errAlreadyRedeemed = errors.New("voucher already redeemed by user")

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

		// Cek + catat redeem + increment used_count + terapkan efek voucher
		// berjalan atomik dalam satu transaksi.
		err := db.Transaction(func(tx *gorm.DB) error {
			var count int64
			if err := tx.Model(&models.VoucherRedemption{}).
				Where("voucher_id = ? AND user_id = ?", voucher.ID, userID).
				Count(&count).Error; err != nil {
				return err
			}
			if count > 0 {
				return errAlreadyRedeemed
			}

			if err := tx.Create(&models.VoucherRedemption{
				VoucherID: voucher.ID,
				UserID:    userID,
			}).Error; err != nil {
				// Balapan dua request bersamaan: unique index gabungan
				// menjadi penjaga terakhir.
				if strings.Contains(err.Error(), "duplicate key") {
					return errAlreadyRedeemed
				}
				return err
			}

			if err := tx.Model(&models.Voucher{}).Where("id = ?", voucher.ID).
				Update("used_count", gorm.Expr("used_count + 1")).Error; err != nil {
				return err
			}

			// Apply voucher based on type
			switch voucher.Type {
			case "trial":
				// Extend subscription with trial days
				if err := tx.Model(&models.User{}).Where("id = ?", userID).Update("plan", "trial").Error; err != nil {
					return err
				}
			case "discount":
				// Store discount for next payment
			}
			return nil
		})
		if err != nil {
			if errors.Is(err, errAlreadyRedeemed) {
				c.JSON(http.StatusConflict, gin.H{"message": "Voucher ini sudah pernah Anda gunakan"})
				return
			}
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menggunakan voucher"})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"message": "Voucher berhasil digunakan",
			"voucher": voucher,
		})
	}
}

func java_time_now() time.Time {
	return time.Now()
}
