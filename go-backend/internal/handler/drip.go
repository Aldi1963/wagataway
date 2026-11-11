package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/drip"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// validTriggerTypes: jenis lama dipertahankan, jenis berbasis aksi ditambah.
var validTriggerTypes = map[string]bool{
	"manual": true, "keyword": true, "webhook": true,
	"new_contact": true, "order_created": true, "order_paid": true,
	"tag_added": true, "days_since_purchase": true, "event": true,
}

func registerDripRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	d := rg.Group("/drip")
	{
		d.GET("", listDripCampaigns(db))
		d.POST("", createDripCampaign(db))
		d.GET("/:id", getDripCampaign(db))
		d.PUT("/:id", updateDripCampaign(db))
		d.DELETE("/:id", deleteDripCampaign(db))
		d.POST("/:id/steps", addDripStep(db))
		d.PUT("/:id/steps/:stepId", updateDripStep(db))
		d.DELETE("/:id/steps/:stepId", deleteDripStep(db))
		d.POST("/:id/enroll", enrollDrip(db))
		d.GET("/:id/analytics", dripAnalytics(db))
		// Drip berbasis aksi: daftar sequence + kontrol per enrollment.
		d.GET("/:id/enrollments", listDripEnrollments(db))
		d.POST("/enrollments/:enrollmentId/pause", setEnrollmentStatus(db, "paused"))
		d.POST("/enrollments/:enrollmentId/resume", setEnrollmentStatus(db, "active"))
		d.POST("/enrollments/:enrollmentId/cancel", setEnrollmentStatus(db, "cancelled"))
		// Event generik: dipanggil modul lain (order, integrasi, webhook)
		// untuk memicu campaign berbasis aksi.
		d.POST("/events", fireDripEvent(db))
	}
}

func listDripCampaigns(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var campaigns []models.DripCampaign
		udb.Where("user_id = ?", userID).Preload("Steps").
			Order("created_at DESC").Find(&campaigns)
		c.JSON(http.StatusOK, gin.H{"campaigns": campaigns})
	}
}

func createDripCampaign(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req struct {
			Name          string `json:"name" binding:"required"`
			Description   string `json:"description"`
			DeviceID      uint   `json:"deviceId" binding:"required"`
			TriggerType   string `json:"triggerType"`
			TriggerVal    string `json:"triggerVal"`
			CancelOnReply *bool  `json:"cancelOnReply"`
			OptOutKeyword string `json:"optOutKeyword"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if req.TriggerType == "" {
			req.TriggerType = "manual"
		}
		if !validTriggerTypes[req.TriggerType] {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Tipe trigger tidak dikenal"})
			return
		}
		// days_since_purchase: TriggerVal harus jumlah hari yang valid.
		if req.TriggerType == "days_since_purchase" {
			days, err := strconv.Atoi(req.TriggerVal)
			if err != nil || days < 0 {
				c.JSON(http.StatusBadRequest, gin.H{"message": "TriggerVal harus jumlah hari (angka >= 0)"})
				return
			}
			_ = days
		}
		cancelOnReply := true
		if req.CancelOnReply != nil {
			cancelOnReply = *req.CancelOnReply
		}
		optOut := req.OptOutKeyword
		if optOut == "" {
			optOut = "STOP"
		}
		// Cek kepemilikan device
		var device models.Device
		if err := udb.Where("id = ? AND user_id = ?", req.DeviceID, userID).First(&device).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}
		campaign := models.DripCampaign{
			UserID: userID, DeviceID: req.DeviceID, Name: req.Name,
			Description: req.Description, TriggerType: req.TriggerType,
			TriggerVal: req.TriggerVal, IsActive: true,
			CancelOnReply: cancelOnReply, OptOutKeyword: optOut,
		}
		udb.Create(&campaign)
		c.JSON(http.StatusCreated, gin.H{"campaign": campaign})
	}
}

func getDripCampaign(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var campaign models.DripCampaign
		if err := udb.Where("id = ? AND user_id = ?", id, userID).
			Preload("Steps", func(d *gorm.DB) *gorm.DB { return d.Order("step_order ASC") }).
			First(&campaign).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Campaign tidak ditemukan"})
			return
		}
		// Count enrollments
		var enrolled int64
		udb.Model(&models.DripEnrollment{}).Where("campaign_id = ?", id).Count(&enrolled)
		c.JSON(http.StatusOK, gin.H{"campaign": campaign, "enrolled": enrolled})
	}
}

func updateDripCampaign(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var campaign models.DripCampaign
		if err := udb.Where("id = ? AND user_id = ?", id, userID).First(&campaign).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Campaign tidak ditemukan"})
			return
		}
		var req map[string]interface{}
		c.ShouldBindJSON(&req)
		udb.Model(&campaign).Updates(snakeKeys(req))
		c.JSON(http.StatusOK, gin.H{"campaign": campaign, "message": "Diperbarui"})
	}
}

func deleteDripCampaign(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		result := udb.Where("id = ? AND user_id = ?", id, userID).Delete(&models.DripCampaign{})
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Campaign tidak ditemukan"})
			return
		}
		// Delete steps and enrollments
		udb.Where("campaign_id = ?", id).Delete(&models.DripStep{})
		udb.Where("campaign_id = ?", id).Delete(&models.DripEnrollment{})
		c.JSON(http.StatusOK, gin.H{"message": "Campaign dihapus"})
	}
}

func addDripStep(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var campaign models.DripCampaign
		if err := udb.Where("id = ? AND user_id = ?", id, userID).First(&campaign).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Campaign tidak ditemukan"})
			return
		}
		var req struct {
			StepOrder          int    `json:"stepOrder"`
			DelayHours         int    `json:"delayHours"`
			DelayMinutes       int    `json:"delayMinutes"`
			Type               string `json:"type"`
			Content            string `json:"content" binding:"required"`
			MediaURL           string `json:"mediaUrl"`
			SkipIfReplied      bool   `json:"skipIfReplied"`
			RequireOrderStatus string `json:"requireOrderStatus"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Content wajib"})
			return
		}
		if req.Type == "" {
			req.Type = "text"
		}
		if req.DelayHours == 0 && req.DelayMinutes == 0 {
			req.DelayHours = 24
		}
		// Auto step order
		if req.StepOrder == 0 {
			var count int64
			udb.Model(&models.DripStep{}).Where("campaign_id = ?", id).Count(&count)
			req.StepOrder = int(count) + 1
		}
		step := models.DripStep{
			CampaignID: uint(id), StepOrder: req.StepOrder,
			DelayHours: req.DelayHours, DelayMinutes: req.DelayMinutes,
			Type: req.Type, Content: req.Content, MediaURL: req.MediaURL,
			SkipIfReplied: req.SkipIfReplied, RequireOrderStatus: req.RequireOrderStatus,
		}
		udb.Create(&step)
		c.JSON(http.StatusCreated, gin.H{"step": step})
	}
}

func updateDripStep(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		stepId, _ := strconv.ParseUint(c.Param("stepId"), 10, 32)
		var step models.DripStep
		if err := udb.Joins("JOIN drip_campaigns ON drip_campaigns.id = drip_steps.campaign_id").
			Where("drip_steps.id = ? AND drip_steps.campaign_id = ? AND drip_campaigns.user_id = ?", stepId, id, userID).
			First(&step).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Step tidak ditemukan"})
			return
		}
		// Allowlist field yang boleh diubah (hindari mass assignment)
		var req struct {
			StepOrder          *int    `json:"stepOrder"`
			DelayHours         *int    `json:"delayHours"`
			DelayMinutes       *int    `json:"delayMinutes"`
			Type               *string `json:"type"`
			Content            *string `json:"content"`
			MediaURL           *string `json:"mediaUrl"`
			SkipIfReplied      *bool   `json:"skipIfReplied"`
			RequireOrderStatus *string `json:"requireOrderStatus"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		updates := map[string]interface{}{}
		if req.StepOrder != nil {
			updates["step_order"] = *req.StepOrder
		}
		if req.DelayHours != nil {
			updates["delay_hours"] = *req.DelayHours
		}
		if req.DelayMinutes != nil {
			updates["delay_minutes"] = *req.DelayMinutes
		}
		if req.Type != nil {
			updates["type"] = *req.Type
		}
		if req.Content != nil {
			updates["content"] = *req.Content
		}
		if req.MediaURL != nil {
			updates["media_url"] = *req.MediaURL
		}
		if req.SkipIfReplied != nil {
			updates["skip_if_replied"] = *req.SkipIfReplied
		}
		if req.RequireOrderStatus != nil {
			updates["require_order_status"] = *req.RequireOrderStatus
		}
		udb.Model(&step).Updates(updates)
		c.JSON(http.StatusOK, gin.H{"step": step})
	}
}

func deleteDripStep(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		stepId, _ := strconv.ParseUint(c.Param("stepId"), 10, 32)
		var step models.DripStep
		if err := udb.Joins("JOIN drip_campaigns ON drip_campaigns.id = drip_steps.campaign_id").
			Where("drip_steps.id = ? AND drip_steps.campaign_id = ? AND drip_campaigns.user_id = ?", stepId, id, userID).
			First(&step).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Step tidak ditemukan"})
			return
		}
		udb.Delete(&step)
		c.JSON(http.StatusOK, gin.H{"message": "Step dihapus"})
	}
}

func enrollDrip(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var campaign models.DripCampaign
		if err := udb.Where("id = ? AND user_id = ?", id, userID).First(&campaign).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Campaign tidak ditemukan"})
			return
		}
		var req struct {
			Phones []string `json:"phones" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Daftar nomor wajib"})
			return
		}

		enrolled := 0
		now := time.Now()
		for _, phone := range req.Phones {
			if phone == "" {
				continue
			}
			// Idempoten: nomor yang sudah aktif di campaign ini tidak
			// didaftarkan ganda.
			created, err := drip.EnrollPhone(udb, campaign, phone, "manual", "", now)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal mendaftarkan kontak"})
				return
			}
			if created {
				enrolled++
			}
		}

		c.JSON(http.StatusOK, gin.H{
			"message":  "Berhasil enroll",
			"enrolled": enrolled,
		})
	}
}

// dripAnalytics mengembalikan ringkasan performa satu campaign:
// jumlah enrollment per status, progres tiap step, dan total enrollment.
func dripAnalytics(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var campaign models.DripCampaign
		if err := udb.Where("id = ? AND user_id = ?", id, userID).First(&campaign).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Campaign tidak ditemukan"})
			return
		}

		type statusCount struct {
			Status string
			Count  int64
		}
		var rows []statusCount
		udb.Model(&models.DripEnrollment{}).Select("status, COUNT(*) AS count").
			Where("campaign_id = ?", id).Group("status").Scan(&rows)
		byStatus := gin.H{"active": int64(0), "paused": int64(0), "completed": int64(0), "cancelled": int64(0)}
		for _, r := range rows {
			byStatus[r.Status] = r.Count
		}

		var steps []models.DripStep
		udb.Where("campaign_id = ?", id).Order("step_order ASC").Find(&steps)
		progress := make([]gin.H, 0, len(steps))
		for _, st := range steps {
			var reached int64
			udb.Model(&models.DripEnrollment{}).
				Where("campaign_id = ? AND current_step >= ?", id, st.StepOrder).
				Count(&reached)
			progress = append(progress, gin.H{"stepOrder": st.StepOrder, "reached": reached})
		}

		var total int64
		udb.Model(&models.DripEnrollment{}).Where("campaign_id = ?", id).Count(&total)

		c.JSON(http.StatusOK, gin.H{
			"enrollmentsByStatus": byStatus,
			"stepProgress":        progress,
			"totalEnrolled":       total,
		})
	}
}

// listDripEnrollments mengembalikan sequence aktif per kontak untuk satu
// campaign: langkah terakhir, langkah berikutnya + waktu kirim, dan status.
func listDripEnrollments(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var campaign models.DripCampaign
		if err := udb.Where("id = ? AND user_id = ?", id, userID).First(&campaign).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Campaign tidak ditemukan"})
			return
		}
		page, limit := getPageLimit(c)
		query := udb.Where("campaign_id = ?", id)
		if st := c.Query("status"); st != "" {
			query = query.Where("status = ?", st)
		}
		var total int64
		query.Model(&models.DripEnrollment{}).Count(&total)
		var items []models.DripEnrollment
		query.Order("updated_at DESC").Offset((page - 1) * limit).Limit(limit).Find(&items)
		var totalSteps int64
		udb.Model(&models.DripStep{}).Where("campaign_id = ?", id).Count(&totalSteps)
		c.JSON(http.StatusOK, gin.H{
			"enrollments": items, "total": total,
			"page": page, "limit": limit, "totalSteps": totalSteps,
		})
	}
}

// setEnrollmentStatus mengubah status satu enrollment (jeda/lanjutkan/batalkan).
// Transisi yang diizinkan: active -> paused/cancelled, paused -> active/cancelled.
func setEnrollmentStatus(db *gorm.DB, target string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		enrID, _ := strconv.ParseUint(c.Param("enrollmentId"), 10, 32)
		var enr models.DripEnrollment
		if err := udb.Joins("JOIN drip_campaigns ON drip_campaigns.id = drip_enrollments.campaign_id").
			Where("drip_enrollments.id = ? AND drip_campaigns.user_id = ?", enrID, userID).
			First(&enr).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Enrollment tidak ditemukan"})
			return
		}
		allowed := map[string][]string{
			"paused":    {"active"},
			"active":    {"paused"},
			"cancelled": {"active", "paused"},
		}
		ok := false
		for _, from := range allowed[target] {
			if enr.Status == from {
				ok = true
			}
		}
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Status saat ini tidak bisa diubah ke " + target})
			return
		}
		updates := map[string]interface{}{"status": target}
		if target == "cancelled" {
			updates["cancel_reason"] = "manual"
		}
		udb.Model(&enr).Updates(updates)
		c.JSON(http.StatusOK, gin.H{"enrollment": enr, "message": "Status diubah"})
	}
}

// fireDripEvent adalah titik masuk HTTP untuk pemicu generik: modul lain
// (order, integrasi, webhook) memanggil endpoint ini saat sebuah kejadian
// terjadi, dan campaign berbasis aksi yang cocok akan mendaftarkan kontak.
// Body: {event, deviceId?, phone, ref?, productId?, label?}.
//   - event "order_created"/"order_paid"/"tag_added"/"new_contact": pemicu bertipe.
//   - event lainnya: dianggap nama event generik (trigger_type "event",
//     trigger_val = nama event).
func fireDripEvent(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req struct {
			Event     string `json:"event" binding:"required"`
			DeviceID  uint   `json:"deviceId"`
			Phone     string `json:"phone" binding:"required"`
			Ref       string `json:"ref"`
			ProductID string `json:"productId"`
			Label     string `json:"label"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "event dan phone wajib diisi"})
			return
		}
		if req.DeviceID != 0 {
			var device models.Device
			if err := udb.Where("id = ? AND user_id = ?", req.DeviceID, userID).First(&device).Error; err != nil {
				c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
				return
			}
		}
		data := map[string]string{"productId": req.ProductID, "label": req.Label}
		var enrolled int
		var err error
		switch req.Event {
		case drip.TriggerNewContact, drip.TriggerOrderCreated, drip.TriggerOrderPaid, drip.TriggerTagAdded:
			enrolled, err = drip.FireEvent(udb, userID, req.DeviceID, req.Event, req.Phone, req.Ref, data)
		default:
			enrolled, err = drip.FireNamedEvent(udb, userID, req.DeviceID, req.Event, req.Phone, req.Ref)
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memicu drip"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"enrolled": enrolled})
	}
}
