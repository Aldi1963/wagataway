package handler

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/Aldi1963/wagataway/internal/catalog"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerBotProductRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	products := rg.Group("/bot-products")
	{
		products.GET("", listBotProducts(db))
		products.POST("", createBotProduct(db))
		products.GET("/:id", getBotProduct(db))
		products.PUT("/:id", updateBotProduct(db))
		products.PATCH("/:id/toggle", toggleBotProduct(db))
		products.DELETE("/:id", deleteBotProduct(db))
	}
}

func registerBotOrderRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	orders := rg.Group("/bot-orders")
	{
		orders.GET("", listBotOrders(db))
		orders.POST("", createBotOrder(db))
		orders.GET("/:id", getBotOrder(db))
		orders.GET("/stats/summary", botOrderStats(db))
		orders.PATCH("/:id/status", updateBotOrderStatus(db))
	}
}

// botProductOwned memuat produk milik user (404 bila tidak ada / bukan miliknya).
func botProductOwned(db *gorm.DB, userID uint, id uint) (*models.BotProduct, bool) {
	var p models.BotProduct
	if err := db.Where("id = ? AND user_id = ?", id, userID).First(&p).Error; err != nil {
		return nil, false
	}
	return &p, true
}

func listBotProducts(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		q := udb.Where("user_id = ?", userID)
		if cat := strings.TrimSpace(c.Query("category")); cat != "" {
			q = q.Where("category = ?", cat)
		}
		if act := c.Query("active"); act == "true" {
			q = q.Where("is_active = ?", true)
		} else if act == "false" {
			q = q.Where("is_active = ?", false)
		}
		if s := strings.TrimSpace(c.Query("search")); s != "" {
			like := "%" + s + "%"
			q = q.Where("name ILIKE ? OR description ILIKE ?", like, like)
		}
		var products []models.BotProduct
		q.Order("created_at DESC").Find(&products)
		var categories []string
		udb.Model(&models.BotProduct{}).Where("user_id = ? AND category <> ''", userID).
			Distinct("category").Pluck("category", &categories)
		c.JSON(http.StatusOK, gin.H{"products": products, "categories": categories})
	}
}

func createBotProduct(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req struct {
			Name        string `json:"name" binding:"required"`
			Description string `json:"description"`
			Price       int64  `json:"price"`
			Stock       int    `json:"stock"`
			Category    string `json:"category"`
			ImageURL    string `json:"imageUrl"`
			IsActive    *bool  `json:"isActive"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if strings.TrimSpace(req.Name) == "" || req.Price < 0 || req.Stock < 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Nama wajib diisi, harga & stok tidak boleh negatif"})
			return
		}
		p := models.BotProduct{
			UserID:      userID,
			Name:        strings.TrimSpace(req.Name),
			Description: req.Description,
			Price:       req.Price,
			Stock:       req.Stock,
			Category:    strings.TrimSpace(req.Category),
			ImageURL:    strings.TrimSpace(req.ImageURL),
			IsActive:    true,
		}
		if req.IsActive != nil {
			p.IsActive = *req.IsActive
		}
		if err := udb.Create(&p).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan produk"})
			return
		}
		if req.IsActive != nil && !*req.IsActive {
			// GORM mengabaikan false pada Create bila kolom punya `default:true`.
			udb.Model(&p).Update("is_active", false)
			p.IsActive = false
		}
		c.JSON(http.StatusCreated, gin.H{"product": p})
	}
}

func getBotProduct(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		p, ok := botProductOwned(udb, userID, uint(id))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"message": "Produk tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"product": p})
	}
}

func updateBotProduct(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		p, ok := botProductOwned(udb, userID, uint(id))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"message": "Produk tidak ditemukan"})
			return
		}
		var req struct {
			Name        *string `json:"name"`
			Description *string `json:"description"`
			Price       *int64  `json:"price"`
			Stock       *int    `json:"stock"`
			Category    *string `json:"category"`
			ImageURL    *string `json:"imageUrl"`
			IsActive    *bool   `json:"isActive"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		updates := map[string]interface{}{}
		if req.Name != nil {
			if strings.TrimSpace(*req.Name) == "" {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Nama tidak boleh kosong"})
				return
			}
			updates["name"] = strings.TrimSpace(*req.Name)
		}
		if req.Description != nil {
			updates["description"] = *req.Description
		}
		if req.Price != nil {
			if *req.Price < 0 {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Harga tidak boleh negatif"})
				return
			}
			updates["price"] = *req.Price
		}
		if req.Stock != nil {
			if *req.Stock < 0 {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Stok tidak boleh negatif"})
				return
			}
			updates["stock"] = *req.Stock
		}
		if req.Category != nil {
			updates["category"] = strings.TrimSpace(*req.Category)
		}
		if req.ImageURL != nil {
			updates["image_url"] = strings.TrimSpace(*req.ImageURL)
		}
		if req.IsActive != nil {
			updates["is_active"] = *req.IsActive
		}
		if len(updates) > 0 {
			udb.Model(p).Updates(updates)
		}
		udb.First(p, p.ID)
		c.JSON(http.StatusOK, gin.H{"product": p, "message": "Produk diperbarui"})
	}
}

func toggleBotProduct(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		p, ok := botProductOwned(udb, userID, uint(id))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"message": "Produk tidak ditemukan"})
			return
		}
		udb.Model(p).Update("is_active", !p.IsActive)
		c.JSON(http.StatusOK, gin.H{"isActive": !p.IsActive})
	}
}

func deleteBotProduct(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		p, ok := botProductOwned(udb, userID, uint(id))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"message": "Produk tidak ditemukan"})
			return
		}
		var used int64
		udb.Model(&models.BotOrderItem{}).Where("product_id = ?", p.ID).Count(&used)
		if used > 0 {
			c.JSON(http.StatusConflict, gin.H{"message": "Produk sudah dipakai di pesanan — nonaktifkan saja, jangan dihapus"})
			return
		}
		udb.Delete(p)
		c.JSON(http.StatusOK, gin.H{"message": "Produk dihapus"})
	}
}

// ── Orders ──────────────────────────────────────────────────────────────────

func botOrderOwned(db *gorm.DB, userID uint, id uint) (*models.BotOrder, bool) {
	var o models.BotOrder
	if err := db.Preload("Items").Where("id = ? AND user_id = ?", id, userID).First(&o).Error; err != nil {
		return nil, false
	}
	return &o, true
}

func listBotOrders(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		q := udb.Preload("Items").Where("user_id = ?", userID)
		if st := strings.TrimSpace(c.Query("status")); st != "" {
			if !catalog.ValidStatuses[st] {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Status tidak dikenal"})
				return
			}
			q = q.Where("status = ?", st)
		}
		if s := strings.TrimSpace(c.Query("search")); s != "" {
			like := "%" + s + "%"
			q = q.Where("order_number ILIKE ? OR buyer_phone ILIKE ? OR buyer_name ILIKE ?", like, like, like)
		}
		var orders []models.BotOrder
		q.Order("created_at DESC").Limit(200).Find(&orders)
		c.JSON(http.StatusOK, gin.H{"orders": orders})
	}
}

func createBotOrder(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req struct {
			BuyerPhone string `json:"buyerPhone" binding:"required"`
			BuyerName  string `json:"buyerName"`
			Notes      string `json:"notes"`
			Items      []struct {
				ProductID uint `json:"productId" binding:"required"`
				Quantity  int  `json:"quantity" binding:"required"`
			} `json:"items" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		lines := make([]catalog.OrderLine, 0, len(req.Items))
		for _, it := range req.Items {
			lines = append(lines, catalog.OrderLine{ProductID: it.ProductID, Quantity: it.Quantity})
		}
		order, err := catalog.CreateOrder(udb, userID, strings.TrimSpace(req.BuyerPhone), strings.TrimSpace(req.BuyerName), req.Notes, lines)
		if err != nil {
			if errors.Is(err, catalog.ErrInsufficientStock) {
				c.JSON(http.StatusConflict, gin.H{"message": err.Error()})
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"order": order})
	}
}

func getBotOrder(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		o, ok := botOrderOwned(udb, userID, uint(id))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"message": "Pesanan tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"order": o})
	}
}

func updateBotOrderStatus(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var req struct {
			Status string `json:"status" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		order, err := catalog.TransitionOrder(udb, userID, uint(id), strings.ToLower(strings.TrimSpace(req.Status)))
		if err != nil {
			if errors.Is(err, catalog.ErrInsufficientStock) {
				c.JSON(http.StatusConflict, gin.H{"message": err.Error()})
				return
			}
			if errors.Is(err, gorm.ErrRecordNotFound) {
				c.JSON(http.StatusNotFound, gin.H{"message": "Pesanan tidak ditemukan"})
				return
			}
			c.JSON(http.StatusBadRequest, gin.H{"message": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"order": order, "message": "Status pesanan diperbarui"})
	}
}

func botOrderStats(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var rows []struct {
			Status string
			Count  int64
		}
		udb.Model(&models.BotOrder{}).Select("status, COUNT(*) as count").
			Where("user_id = ?", userID).Group("status").Scan(&rows)
		byStatus := map[string]int64{}
		var total int64
		for _, r := range rows {
			byStatus[r.Status] = r.Count
			total += r.Count
		}
		c.JSON(http.StatusOK, gin.H{"byStatus": byStatus, "total": total})
	}
}
