package handler

import (
	"net/http"
	"strconv"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerAdminRoutes(rg *gin.RouterGroup, cfg *config.Config, db *gorm.DB, wm *whatsapp.Manager) {
	rg.GET("/users", adminListUsers(db))
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
	rg.GET("/transactions", adminTransactions(db))
	rg.POST("/notifications", adminSendNotification(db))
	rg.PUT("/maintenance", adminToggleMaintenance())
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
		c.JSON(http.StatusOK, gin.H{"user": user, "message": "User diperbarui"})
	}
}

func adminDeleteUser(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		db.Delete(&models.User{}, id)
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
		c.JSON(http.StatusOK, gin.H{"package": plan})
	}
}

func adminDeletePackage(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		db.Delete(&models.Plan{}, id)
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
		c.JSON(http.StatusCreated, gin.H{"voucher": req})
	}
}

func adminDeleteVoucher(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		db.Delete(&models.Voucher{}, id)
		c.JSON(http.StatusOK, gin.H{"message": "Voucher dihapus"})
	}
}

func adminGetSettings(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var settings []models.Setting
		db.Find(&settings)
		result := map[string]string{}
		for _, s := range settings {
			result[s.Key] = s.Value
		}
		c.JSON(http.StatusOK, gin.H{"settings": result})
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
			db.Where("key = ?", key).Assign(models.Setting{Key: key, Value: value}).
				FirstOrCreate(&models.Setting{})
		}
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
		var txs []models.Transaction
		var total int64
		db.Model(&models.Transaction{}).Count(&total)
		db.Preload("User").Preload("Plan").Order("created_at DESC").
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
