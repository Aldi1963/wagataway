// Fitur 4 (Upgrade/Downgrade Prorata).
//
// Alur:
//   - GET /api/billing/prorate?planId=N → kalkulasi tanpa efek samping.
//   - POST /api/billing/subscribe (paket beda dari langganan aktif) → pakai
//     quote prorata; amount transaksi = payable. Bila payable 0, transaksi
//     langsung diaktifkan lewat activateSubscription (titik aktivasi yang sama
//     dipakai webhook Clipku Pay & sinkronisasi status).
package handler

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ProrateQuote adalah rincian kalkulasi pergantian paket.
type ProrateQuote struct {
	Prorate       bool   `json:"prorate"` // true bila pergantian dari langganan aktif yang belum expired
	OldPlanID     uint   `json:"oldPlanId,omitempty"`
	OldPlanName   string `json:"oldPlanName,omitempty"`
	NewPlanID     uint   `json:"newPlanId"`
	NewPlanName   string `json:"newPlanName"`
	NewPrice      int64  `json:"newPrice"`
	RemainingDays int    `json:"remainingDays"`
	CreditAmount  int64  `json:"creditAmount"`
	PayableAmount int64  `json:"payableAmount"`
	IsTrial       bool   `json:"isTrial,omitempty"`
}

// prorateQuotePure adalah inti kalkulasi prorata (murni, mudah dites):
//   sisa nilai = (sisa hari / total hari paket lama) × harga paket lama
//   bayar     = harga paket baru − sisa nilai, minimal 0
//
// Trial (isTrial=true) → sisa nilai 0.
func prorateQuotePure(now time.Time, sub *models.Subscription, newPlan *models.Plan) ProrateQuote {
	remainingDays := 0
	if sub != nil {
		remainingDays = int(math.Ceil(sub.EndDate.Sub(now).Hours() / 24))
		if remainingDays < 0 {
			remainingDays = 0
		}
	}
	var credit int64
	isTrial := sub != nil && sub.IsTrial
	if sub != nil && !isTrial {
		totalDays := sub.Plan.Duration
		if totalDays <= 0 {
			totalDays = 1
		}
		credit = sub.Plan.Price * int64(remainingDays) / int64(totalDays)
	}
	payable := newPlan.Price - credit
	if payable < 0 {
		payable = 0
	}
	q := ProrateQuote{
		Prorate:       sub != nil,
		NewPlanID:     newPlan.ID,
		NewPlanName:   newPlan.Name,
		NewPrice:      newPlan.Price,
		RemainingDays: remainingDays,
		CreditAmount:  credit,
		PayableAmount: payable,
		IsTrial:       isTrial,
	}
	if sub != nil {
		q.OldPlanID = sub.Plan.ID
		q.OldPlanName = sub.Plan.Name
	}
	return q
}

// prorateQuote mengambil langganan aktif yang belum expired lalu mengembalikan
// quote pergantian paket. Bila tidak ada langganan aktif → (Prorate=false, nil)
// sehingga caller jatuh ke alur pembelian baru biasa.
func prorateQuote(db *gorm.DB, userID uint, newPlan *models.Plan) (ProrateQuote, error) {
	var sub models.Subscription
	err := db.Where("user_id = ? AND status = ? AND end_date > ?", userID, "active", time.Now()).
		Preload("Plan").First(&sub).Error
	if err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return ProrateQuote{
				Prorate:       false,
				NewPlanID:     newPlan.ID,
				NewPlanName:   newPlan.Name,
				NewPrice:      newPlan.Price,
				PayableAmount: newPlan.Price,
			}, nil
		}
		return ProrateQuote{}, err
	}
	if sub.PlanID == newPlan.ID {
		// Bukan ganti paket (mis. perpanjangan) → beli baru biasa.
		return ProrateQuote{
			Prorate:       false,
			NewPlanID:     newPlan.ID,
			NewPlanName:   newPlan.Name,
			NewPrice:      newPlan.Price,
			PayableAmount: newPlan.Price,
		}, nil
	}
	return prorateQuotePure(time.Now(), &sub, newPlan), nil
}

// prorateMetadata adalah JSON audit di kolom transaction.metadata.
type prorateMetadata struct {
	Prorate       bool  `json:"prorate"`
	FromPlanID    uint  `json:"fromPlanId,omitempty"`
	CreditAmount  int64 `json:"creditAmount,omitempty"`
	RemainingDays int   `json:"remainingDays,omitempty"`
}

func prorateMetadataJSON(q ProrateQuote) string {
	m := prorateMetadata{
		Prorate:       q.Prorate,
		FromPlanID:    q.OldPlanID,
		CreditAmount:  q.CreditAmount,
		RemainingDays: q.RemainingDays,
	}
	b, err := json.Marshal(m)
	if err != nil {
		return ""
	}
	return string(b)
}

// GET /api/billing/prorate?planId=N — kalkulasi prorata tanpa efek samping.
func getProrateQuote(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		var req struct {
			PlanID uint `form:"planId" binding:"required"`
		}
		if err := c.ShouldBindQuery(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "planId wajib"})
			return
		}
		var plan models.Plan
		if err := db.Where("id = ? AND is_active = ?", req.PlanID, true).First(&plan).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Paket tidak ditemukan"})
			return
		}
		q, err := prorateQuote(db, userID, &plan)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menghitung prorata"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"quote": q})
	}
}
