package handler

import (
	"fmt"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
)

func registerAdminRoutes(rg *gin.RouterGroup, cfg *config.Config, db *gorm.DB, wm *whatsapp.Manager) {
	rg.GET("/users", adminListUsers(db))
	rg.POST("/users", adminCreateUser(db))
	rg.PUT("/users/:id", adminUpdateUser(db))
	rg.DELETE("/users/:id", adminDeleteUser(db))
	rg.GET("/packages", adminListPackages(db))
	rg.POST("/packages", adminCreatePackage(db))
	rg.PUT("/packages/:id", adminUpdatePackage(db))
	rg.DELETE("/packages/:id", adminDeletePackage(db))
	rg.GET("/vouchers", adminListVouchers(db))
	rg.POST("/vouchers", adminCreateVoucher(db))
	rg.DELETE("/vouchers/:id", adminDeleteVoucher(db))
	rg.GET("/settings", adminGetSettings(db))
	rg.PUT("/settings", adminUpdateSettings(db))
	rg.GET("/analytics", adminAnalytics(db))
	rg.GET("/trends", adminTrends(db))
	rg.GET("/transactions", adminTransactions(db))
	rg.POST("/notifications", adminSendNotification(db))
	rg.PUT("/maintenance", adminToggleMaintenance())
	rg.GET("/activity-logs", adminActivityLogs(db))
	rg.GET("/health", adminHealth(cfg, db))
	rg.GET("/billing/gateway", adminGatewayStatus(cfg, db))
	rg.POST("/billing/gateway/test", adminGatewayTest(cfg, db))
	rg.POST("/broadcast-wa", adminBroadcastWA(db, wm))
}

// logAdminAction mencatat aktivitas admin ke tabel admin_activity_logs.
// Error logging diabaikan agar tidak menggagalkan request utama.
func logAdminAction(db *gorm.DB, adminID uint, action, targetType, targetID, detail string) {
	if db == nil {
		return
	}
	db.Create(&models.AdminActivityLog{
		AdminID:    adminID,
		Action:     action,
		TargetType: targetType,
		TargetID:   targetID,
		Detail:     detail,
	})
}

// summarizeChanges membuat ringkasan field yang diubah dari map request.
func summarizeChanges(req map[string]interface{}) string {
	keys := make([]string, 0, len(req))
	for k := range req {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return strings.Join(keys, ", ")
}

// summarizeStringMap membuat ringkasan kunci dari map[string]string.
func summarizeStringMap(req map[string]string) string {
	keys := make([]string, 0, len(req))
	for k := range req {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	return strings.Join(keys, ", ")
}

func adminListUsers(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		search := c.Query("search")

		query := db.Model(&models.User{})
		if search != "" {
			query = query.Where("name ILIKE ? OR email ILIKE ?", "%"+search+"%", "%"+search+"%")
		}

		var total int64
		query.Count(&total)

		var users []models.User
		query.Order("created_at DESC").Offset((page - 1) * limit).Limit(limit).Find(&users)

		c.JSON(http.StatusOK, gin.H{"users": users, "total": total, "page": page})
	}
}

func adminCreateUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Name     string `json:"name" binding:"required"`
			Email    string `json:"email" binding:"required"`
			Password string `json:"password" binding:"required"`
			Role     string `json:"role"`
			Plan     string `json:"plan"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		email := strings.TrimSpace(strings.ToLower(req.Email))
		if len(req.Password) < 6 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Password minimal 6 karakter"})
			return
		}
		var count int64
		db.Model(&models.User{}).Where("email = ?", email).Count(&count)
		if count > 0 {
			c.JSON(http.StatusConflict, gin.H{"message": "Email sudah terdaftar"})
			return
		}
		hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memproses password"})
			return
		}
		role := req.Role
		if role != "admin" && role != "user" {
			role = "user"
		}
		plan := strings.TrimSpace(req.Plan)
		if plan == "" {
			plan = "free"
		}
		user := models.User{
			Name:     strings.TrimSpace(req.Name),
			Email:    email,
			Password: string(hashed),
			Role:     role,
			Plan:     plan,
			Status:   "active",
			Timezone: "Asia/Jakarta",
		}
		if err := db.Create(&user).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat pengguna"})
			return
		}
		logAdminAction(db, middleware.GetUserID(c), "create_user", "user",
			strconv.FormatUint(uint64(user.ID), 10), "Buat: "+email)
		c.JSON(http.StatusCreated, gin.H{"user": user, "message": "Pengguna dibuat"})
	}
}

func adminUpdateUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var user models.User
		if err := db.First(&user, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "User tidak ditemukan"})
			return
		}
		var req map[string]interface{}
		c.ShouldBindJSON(&req)
		// Prevent changing password via this endpoint
		delete(req, "password")
		db.Model(&user).Updates(req)
		logAdminAction(db, middleware.GetUserID(c), "update_user", "user",
			strconv.FormatUint(id, 10), "Ubah: "+summarizeChanges(req))
		c.JSON(http.StatusOK, gin.H{"user": user, "message": "User diperbarui"})
	}
}

func adminDeleteUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		db.Delete(&models.User{}, id)
		logAdminAction(db, middleware.GetUserID(c), "delete_user", "user",
			strconv.FormatUint(id, 10), "")
		c.JSON(http.StatusOK, gin.H{"message": "User dihapus"})
	}
}


func adminListPackages(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var plans []models.Plan
		db.Order("sort_order ASC").Find(&plans)
		c.JSON(http.StatusOK, gin.H{"packages": plans})
	}
}

func adminCreatePackage(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req models.Plan
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		db.Create(&req)
		logAdminAction(db, middleware.GetUserID(c), "create_package", "package",
			strconv.FormatUint(uint64(req.ID), 10), req.Name)
		c.JSON(http.StatusCreated, gin.H{"package": req})
	}
}

func adminUpdatePackage(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var plan models.Plan
		if err := db.First(&plan, id).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Paket tidak ditemukan"})
			return
		}
		var req map[string]interface{}
		c.ShouldBindJSON(&req)
		db.Model(&plan).Updates(req)
		logAdminAction(db, middleware.GetUserID(c), "update_package", "package",
			strconv.FormatUint(id, 10), "Ubah: "+summarizeChanges(req))
		c.JSON(http.StatusOK, gin.H{"package": plan})
	}
}

func adminDeletePackage(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		db.Delete(&models.Plan{}, id)
		logAdminAction(db, middleware.GetUserID(c), "delete_package", "package",
			strconv.FormatUint(id, 10), "")
		c.JSON(http.StatusOK, gin.H{"message": "Paket dihapus"})
	}
}

func adminListVouchers(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var vouchers []models.Voucher
		db.Order("created_at DESC").Find(&vouchers)
		c.JSON(http.StatusOK, gin.H{"vouchers": vouchers})
	}
}

func adminCreateVoucher(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req models.Voucher
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		db.Create(&req)
		logAdminAction(db, middleware.GetUserID(c), "create_voucher", "voucher",
			strconv.FormatUint(uint64(req.ID), 10), req.Code)
		c.JSON(http.StatusCreated, gin.H{"voucher": req})
	}
}

func adminDeleteVoucher(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		db.Delete(&models.Voucher{}, id)
		logAdminAction(db, middleware.GetUserID(c), "delete_voucher", "voucher",
			strconv.FormatUint(id, 10), "")
		c.JSON(http.StatusOK, gin.H{"message": "Voucher dihapus"})
	}
}

func adminGetSettings(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var settings []models.Setting
		db.Find(&settings)
		result := map[string]string{}
		hasAPIKey := false
		for _, s := range settings {
			// Jangan kirim API key mentah ke frontend.
			if s.Key == settingClipkuAPIKey {
				if s.Value != "" {
					hasAPIKey = true
				}
				result[s.Key] = ""
				continue
			}
			result[s.Key] = s.Value
		}
		c.JSON(http.StatusOK, gin.H{
			"settings":              result,
			"has_clipkupay_api_key": hasAPIKey,
		})
	}
}

func adminUpdateSettings(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req map[string]string
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		for key, value := range req {
			// Nilai kosong untuk API key = jangan timpa yang sudah ada.
			if key == settingClipkuAPIKey && value == "" {
				continue
			}
			db.Where("key = ?", key).Assign(models.Setting{Key: key, Value: value}).
				FirstOrCreate(&models.Setting{})
			invalidateSettingCache(key)
		}
		logAdminAction(db, middleware.GetUserID(c), "update_settings", "setting",
			"", "Kunci: "+summarizeStringMap(req))
		c.JSON(http.StatusOK, gin.H{"message": "Settings diperbarui"})
	}
}

func adminAnalytics(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var totalUsers int64
		db.Model(&models.User{}).Count(&totalUsers)
		var totalDevices int64
		db.Model(&models.Device{}).Count(&totalDevices)
		var totalMessages int64
		db.Model(&models.Message{}).Count(&totalMessages)
		var totalRevenue int64
		db.Model(&models.Transaction{}).Where("status = ?", "paid").
			Select("COALESCE(SUM(amount), 0)").Row().Scan(&totalRevenue)

		c.JSON(http.StatusOK, gin.H{
			"totalUsers":    totalUsers,
			"totalDevices":  totalDevices,
			"totalMessages": totalMessages,
			"totalRevenue":  totalRevenue,
		})
	}
}

func adminTransactions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		status := strings.TrimSpace(c.Query("status"))
		var txs []models.Transaction
		var total int64
		q := db.Model(&models.Transaction{})
		if status != "" {
			q = q.Where("status = ?", status)
		}
		q.Count(&total)
		q.Preload("User").Preload("Plan").Order("created_at DESC").
			Offset((page - 1) * limit).Limit(limit).Find(&txs)
		c.JSON(http.StatusOK, gin.H{"transactions": txs, "total": total})
	}
}

func adminSendNotification(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			UserID  *uint  `json:"userId"` // nil = broadcast
			Type    string `json:"type" binding:"required"`
			Title   string `json:"title" binding:"required"`
			Message string `json:"message" binding:"required"`
			Link    string `json:"link"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		notif := models.Notification{
			UserID: req.UserID, Type: req.Type,
			Title: req.Title, Message: req.Message, Link: req.Link,
		}
		db.Create(&notif)
		logAdminAction(db, middleware.GetUserID(c), "send_notification", "notification",
			strconv.FormatUint(uint64(notif.ID), 10), req.Title)
		c.JSON(http.StatusCreated, gin.H{"notification": notif, "message": "Notifikasi dikirim"})
	}
}

func adminToggleMaintenance() gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Enabled bool `json:"enabled"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		middleware.SetMaintenance(req.Enabled)
		c.JSON(http.StatusOK, gin.H{
			"maintenance": req.Enabled,
			"message":     "Maintenance mode diperbarui",
		})
	}
}

func adminTrends(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		days, _ := strconv.Atoi(c.DefaultQuery("days", "30"))
		if days < 1 {
			days = 30
		}
		if days > 90 {
			days = 90
		}

		type dayPoint struct {
			Date    string `json:"date"`
			Signups int64  `json:"signups"`
			Revenue int64  `json:"revenue"`
		}

		now := time.Now()
		points := make([]dayPoint, 0, days)
		for i := days - 1; i >= 0; i-- {
			dateStr := now.AddDate(0, 0, -i).Format("2006-01-02")

			var signups int64
			db.Model(&models.User{}).
				Where("DATE(created_at) = ?", dateStr).
				Count(&signups)

			var revenue int64
			db.Model(&models.Transaction{}).
				Where("status = ?", "paid").
				Where("DATE(created_at) = ?", dateStr).
				Select("COALESCE(SUM(amount), 0)").Row().Scan(&revenue)

			points = append(points, dayPoint{
				Date:    dateStr,
				Signups: signups,
				Revenue: revenue,
			})
		}

		c.JSON(http.StatusOK, gin.H{"days": points})
	}
}

// ── Log Aktivitas Admin ──────────────────────────────────────────────────────

func adminActivityLogs(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 100 {
			limit = 20
		}

		var total int64
		db.Model(&models.AdminActivityLog{}).Count(&total)

		type logRow struct {
			models.AdminActivityLog
			AdminEmail string `json:"adminEmail"`
		}
		var logs []logRow
		db.Table("admin_activity_logs l").
			Select("l.*, u.email AS admin_email").
			Joins("LEFT JOIN users u ON u.id = l.admin_id").
			Order("l.created_at DESC").
			Offset((page - 1) * limit).Limit(limit).
			Scan(&logs)

		c.JSON(http.StatusOK, gin.H{
			"logs":  logs,
			"total": total,
			"page":  page,
			"limit": limit,
		})
	}
}

// ── Kesehatan Sistem ─────────────────────────────────────────────────────────

func adminHealth(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		dbStatus := "ok"
		if sqlDB, err := db.DB(); err != nil {
			dbStatus = "error"
		} else if err := sqlDB.Ping(); err != nil {
			dbStatus = "error"
		} else if err := db.Exec("SELECT 1").Error; err != nil {
			dbStatus = "error"
		}

		redisStatus := "disabled"
		if cfg.RedisURL != "" {
			redisStatus = "ok"
			if !pingRedis(cfg.RedisURL) {
				redisStatus = "error"
			}
		}

		clipkuStatus := "disabled"
		if newClipkuPay(cfg, db).enabled() {
			clipkuStatus = "ok"
		}

		c.JSON(http.StatusOK, gin.H{
			"database":  dbStatus,
			"redis":     redisStatus,
			"clipkupay": clipkuStatus,
			"timestamp": time.Now().Unix(),
		})
	}
}

// pingRedis memeriksa konektivitas Redis via perintah PING mentah (tanpa lib tambahan).
func pingRedis(redisURL string) bool {
	u, err := url.Parse(redisURL)
	if err != nil {
		return false
	}
	host := u.Hostname()
	if host == "" {
		return false
	}
	port := u.Port()
	if port == "" {
		port = "6379"
	}
	conn, err := net.DialTimeout("tcp", net.JoinHostPort(host, port), 3*time.Second)
	if err != nil {
		return false
	}
	defer conn.Close()
	_ = conn.SetDeadline(time.Now().Add(3 * time.Second))
	if _, err := conn.Write([]byte("PING\r\n")); err != nil {
		return false
	}
	reply := make([]byte, 16)
	n, err := conn.Read(reply)
	if err != nil {
		return false
	}
	return strings.HasPrefix(string(reply[:n]), "+PONG")
}

// ── Broadcast WhatsApp ───────────────────────────────────────────────────────

// adminBroadcastWA mengirim pesan pengumuman via WhatsApp ke nomor milik
// setiap device yang sedang terhubung (Device.Phone = nomor akun yang terpair).
func adminBroadcastWA(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Message string `json:"message" binding:"required,max=1000"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Pesan wajib diisi (maks 1000 karakter)"})
			return
		}

		var devices []models.Device
		db.Where("status = ? AND phone <> ''", "connected").Find(&devices)

		sent, failed := 0, 0
		for i, d := range devices {
			if i > 0 {
				time.Sleep(time.Second) // jeda agar tidak membanjiri WhatsApp
			}
			if err := wm.SendMessage(d.ID, d.Phone, "text", req.Message, ""); err != nil {
				failed++
			} else {
				sent++
			}
		}

		logAdminAction(db, middleware.GetUserID(c), "broadcast_wa", "", "",
			fmt.Sprintf("Pesan ke %d device terhubung, terkirim %d, gagal %d", len(devices), sent, failed))

		c.JSON(http.StatusOK, gin.H{"sent": sent, "failed": failed})
	}
}
