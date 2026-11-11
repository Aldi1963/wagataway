package handler

import (
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Batas aman generate massal: satu request tidak boleh membuat lebih dari
// 500 voucher sekaligus.
const maxBulkVouchers = 500

// Prefix kode voucher massal: huruf, angka, dan dash; maks 20 karakter.
// Kode hasil akhirnya "{PREFIX}-{NNN}" (maks 24 karakter, di bawah batas
// kolom code 50).
var voucherBulkPrefixRe = regexp.MustCompile(`^[A-Za-z0-9-]+$`)

// bulkVoucherRequest adalah payload POST /admin/vouchers/bulk. Parameter
// vouchernya sama seperti create satuan, ditambah prefix + jumlah.
type bulkVoucherRequest struct {
	Prefix   string `json:"prefix"`
	Count    int    `json:"count"`
	Type     string `json:"type"`
	PlanID   *uint  `json:"plan_id"`
	Duration int    `json:"duration"`
	Discount int    `json:"discount"`
	MaxUses  int    `json:"max_uses"`
}

// bulkVoucherFailure mencatat satu kode yang gagal dibuat beserta alasannya.
// Kegagalan sebagian TIDAK PERNAH diam-diam: setiap nomor yang gagal selalu
// muncul di daftar ini.
type bulkVoucherFailure struct {
	Code   string `json:"code"`
	Reason string `json:"reason"`
}

// bulkVoucherResult adalah ringkasan hasil generate massal.
type bulkVoucherResult struct {
	Created      []models.Voucher     `json:"created"`
	Failed       []bulkVoucherFailure `json:"failed"`
	CreatedCount int                  `json:"createdCount"`
	FailedCount  int                  `json:"failedCount"`
	Total        int                  `json:"total"`
}

// validateBulkVoucherRequest memeriksa prefix, jumlah, dan parameter voucher
// seperti create satuan. Mengembalikan pesan error (Indonesia) bila tidak
// valid, atau "" bila lolos.
func validateBulkVoucherRequest(db *gorm.DB, req *bulkVoucherRequest) string {
	req.Prefix = strings.ToUpper(strings.TrimSpace(req.Prefix))
	if req.Prefix == "" {
		return "Prefix kode wajib diisi"
	}
	if len(req.Prefix) > 20 {
		return "Prefix kode maks 20 karakter"
	}
	if !voucherBulkPrefixRe.MatchString(req.Prefix) {
		return "Prefix kode hanya boleh huruf, angka, dan dash (-)"
	}
	if req.Count < 1 {
		return "Jumlah kode minimal 1"
	}
	if req.Count > maxBulkVouchers {
		return fmt.Sprintf("Jumlah kode maks %d per request", maxBulkVouchers)
	}
	if req.Type == "" {
		req.Type = "trial"
	}
	// Tipe hanya trial dan plan — sama seperti create satuan + update;
	// "discount" sudah dihapus dari admin dan tidak boleh dibuat lagi,
	// termasuk lewat generate massal.
	switch req.Type {
	case "trial", "plan":
	default:
		return "Tipe voucher tidak valid (trial atau plan)"
	}
	if req.Type == "plan" && req.PlanID == nil {
		return "Pilih paket dulu"
	}
	if req.Type == "plan" {
		var plan models.Plan
		if err := db.First(&plan, *req.PlanID).Error; err != nil {
			return "Paket tidak ditemukan"
		}
	}
	if req.Duration < 0 {
		return "Durasi tidak boleh negatif"
	}
	if req.Discount < 0 || req.Discount > 100 {
		return "Diskon harus 0–100"
	}
	if req.MaxUses < 1 {
		req.MaxUses = 1
	}
	return ""
}

// bulkCreateVouchers menghasilkan kode {PREFIX}-{NNN} (NNN = 001..jumlah)
// satu per satu. Kode yang bentrok dengan kode lama (unique constraint Code)
// dicatat sebagai gagal dan batch LANJUT ke nomor berikutnya — satu bentrok
// tidak pernah membatalkan seluruh batch.
//
// Dibuat lewat map seperti create satuan: Create(struct) mengganti
// duration=0 dengan nilai `default:` tag model (7), sementara map menyimpan
// nilai persis seperti yang dikirim form.
func bulkCreateVouchers(db *gorm.DB, req bulkVoucherRequest) bulkVoucherResult {
	result := bulkVoucherResult{
		Created: []models.Voucher{},
		Failed:  []bulkVoucherFailure{},
		Total:   req.Count,
	}
	// Semua field yang ditulis bulk dianggap dikirim.
	present := map[string]bool{
		"code": true, "type": true, "planId": true, "duration": true,
		"discount": true, "maxUses": true, "isActive": true,
	}
	for i := 1; i <= req.Count; i++ {
		code := fmt.Sprintf("%s-%03d", req.Prefix, i)
		v := models.Voucher{
			Code:     code,
			Type:     req.Type,
			PlanID:   req.PlanID,
			Duration: req.Duration,
			Discount: req.Discount,
			MaxUses:  req.MaxUses,
			IsActive: true,
		}
		create := voucherCreateMap(&v, present)
		now := time.Now().UTC()
		create["created_at"] = now
		create["updated_at"] = now
		if err := db.Model(&models.Voucher{}).Create(create).Error; err != nil {
			reason := "Gagal menyimpan voucher"
			if strings.Contains(err.Error(), "duplicate key") || strings.Contains(err.Error(), "UNIQUE constraint") {
				reason = "Kode sudah ada"
			}
			result.Failed = append(result.Failed, bulkVoucherFailure{Code: code, Reason: reason})
			continue
		}
		var created models.Voucher
		if err := db.Where("code = ?", code).First(&created).Error; err != nil {
			result.Failed = append(result.Failed, bulkVoucherFailure{Code: code, Reason: "Gagal membaca voucher"})
			continue
		}
		result.Created = append(result.Created, created)
	}
	result.CreatedCount = len(result.Created)
	result.FailedCount = len(result.Failed)
	return result
}

func adminBulkCreateVouchers(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req bulkVoucherRequest
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if msg := validateBulkVoucherRequest(db, &req); msg != "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": msg})
			return
		}
		result := bulkCreateVouchers(db, req)
		logAdminAction(db, middleware.GetUserID(c), "create_voucher_bulk", "voucher",
			req.Prefix, fmt.Sprintf("massal %s: %d berhasil, %d gagal dari %d",
				req.Prefix, result.CreatedCount, result.FailedCount, result.Total))
		// 207 bila ada yang gagal sebagian — frontend tetap membaca JSON
		// yang sama (apiPost hanya menolak non-2xx).
		status := http.StatusCreated
		if result.FailedCount > 0 {
			status = http.StatusMultiStatus
		}
		c.JSON(status, result)
	}
}
