package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerMenuBotRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	mb := rg.Group("/menu-bots")
	{
		mb.GET("", listMenuBots(db))
		mb.POST("", createMenuBot(db))
		mb.GET("/:id", getMenuBot(db))
		mb.PUT("/:id", updateMenuBot(db))
		mb.DELETE("/:id", deleteMenuBot(db))
		mb.PATCH("/:id/toggle", toggleMenuBot(db))
		mb.POST("/:id/items", createMenuBotItem(db))
		mb.PUT("/:id/items/:itemId", updateMenuBotItem(db))
		mb.DELETE("/:id/items/:itemId", deleteMenuBotItem(db))
		mb.GET("/:id/sessions", listMenuBotSessions(db))
		mb.DELETE("/sessions/:sessionId", deleteMenuBotSession(db))
	}
}

// menuBotOwned memuat MenuBot milik user (404 bila tidak ada / bukan miliknya).
func menuBotOwned(db *gorm.DB, userID uint, id uint) (*models.MenuBot, bool) {
	var bot models.MenuBot
	if err := db.Preload("Items", func(db *gorm.DB) *gorm.DB {
		return db.Order("position ASC, id ASC")
	}).Where("id = ? AND user_id = ?", id, userID).First(&bot).Error; err != nil {
		return nil, false
	}
	return &bot, true
}

// menuBotDeviceOK memastikan deviceId (bila diisi) milik user.
func menuBotDeviceOK(db *gorm.DB, userID uint, deviceID *uint) bool {
	if deviceID == nil {
		return true
	}
	var d models.Device
	return db.Where("id = ? AND user_id = ?", *deviceID, userID).First(&d).Error == nil
}

func listMenuBots(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		var bots []models.MenuBot
		db.Where("user_id = ?", userID).
			Preload("Items", func(db *gorm.DB) *gorm.DB { return db.Order("position ASC, id ASC") }).
			Order("created_at DESC").
			Find(&bots)
		// Hitung sesi aktif per menu (root_menu_id).
		var counts []struct {
			RootMenuID uint
			Count      int64
		}
		db.Model(&models.MenuBotSession{}).
			Select("root_menu_id, COUNT(*) as count").
			Where("user_id = ?", userID).
			Group("root_menu_id").
			Scan(&counts)
		countMap := map[uint]int64{}
		for _, r := range counts {
			countMap[r.RootMenuID] = r.Count
		}
		out := make([]gin.H, 0, len(bots))
		for _, b := range bots {
			out = append(out, gin.H{
				"bot":            b,
				"activeSessions": countMap[b.ID],
			})
		}
		c.JSON(http.StatusOK, gin.H{"menuBots": out})
	}
}

func createMenuBot(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		var req struct {
			Name           string `json:"name" binding:"required"`
			DeviceID       *uint  `json:"deviceId"`
			TriggerKeyword string `json:"triggerKeyword" binding:"required"`
			IntroText      string `json:"introText"`
			AlwaysActive   bool   `json:"alwaysActive"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if !menuBotDeviceOK(db, userID, req.DeviceID) {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Perangkat tidak ditemukan"})
			return
		}
		bot := models.MenuBot{
			UserID:         userID,
			DeviceID:       req.DeviceID,
			Name:           strings.TrimSpace(req.Name),
			TriggerKeyword: strings.TrimSpace(req.TriggerKeyword),
			IntroText:      req.IntroText,
			AlwaysActive:   req.AlwaysActive,
			IsActive:       false, // default NONAKTIF — diaktifkan eksplisit via toggle
		}
		if err := db.Create(&bot).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"menuBot": bot})
	}
}

func getMenuBot(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		bot, ok := menuBotOwned(db, userID, uint(id))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"message": "Menu bot tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"menuBot": bot})
	}
}

func updateMenuBot(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		bot, ok := menuBotOwned(db, userID, uint(id))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"message": "Menu bot tidak ditemukan"})
			return
		}
		var req struct {
			Name           *string `json:"name"`
			DeviceID       *uint   `json:"deviceId"`
			ClearDeviceID  bool    `json:"clearDeviceId"`
			TriggerKeyword *string `json:"triggerKeyword"`
			IntroText      *string `json:"introText"`
			AlwaysActive   *bool   `json:"alwaysActive"`
			IsActive       *bool   `json:"isActive"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		updates := map[string]interface{}{}
		if req.Name != nil {
			updates["name"] = strings.TrimSpace(*req.Name)
		}
		if req.ClearDeviceID {
			updates["device_id"] = nil
		} else if req.DeviceID != nil {
			if !menuBotDeviceOK(db, userID, req.DeviceID) {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Perangkat tidak ditemukan"})
				return
			}
			updates["device_id"] = *req.DeviceID
		}
		if req.TriggerKeyword != nil {
			updates["trigger_keyword"] = strings.TrimSpace(*req.TriggerKeyword)
		}
		if req.IntroText != nil {
			updates["intro_text"] = *req.IntroText
		}
		if req.AlwaysActive != nil {
			updates["always_active"] = *req.AlwaysActive
		}
		if req.IsActive != nil {
			updates["is_active"] = *req.IsActive
		}
		if len(updates) > 0 {
			db.Model(bot).Updates(updates)
		}
		// Muat ulang beserta items untuk respons
		fresh, _ := menuBotOwned(db, userID, bot.ID)
		c.JSON(http.StatusOK, gin.H{"menuBot": fresh, "message": "Diperbarui"})
	}
}

func deleteMenuBot(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		bot, ok := menuBotOwned(db, userID, uint(id))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"message": "Menu bot tidak ditemukan"})
			return
		}
		// Item lain yang menunjuk ke menu ini sebagai sub-menu → putuskan tautannya
		db.Model(&models.MenuBotItem{}).
			Where("sub_menu_id = ?", bot.ID).
			Updates(map[string]interface{}{"sub_menu_id": nil, "action_type": "reply"})
		db.Where("menu_bot_id = ?", bot.ID).Delete(&models.MenuBotItem{})
		db.Where("root_menu_id = ? OR current_menu_id = ?", bot.ID, bot.ID).Delete(&models.MenuBotSession{})
		db.Delete(bot)
		c.JSON(http.StatusOK, gin.H{"message": "Menu bot dihapus"})
	}
}

func toggleMenuBot(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		bot, ok := menuBotOwned(db, userID, uint(id))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"message": "Menu bot tidak ditemukan"})
			return
		}
		newVal := !bot.IsActive
		db.Model(bot).Update("is_active", newVal)
		c.JSON(http.StatusOK, gin.H{"isActive": newVal})
	}
}

// validateMenuBotItem memastikan aksi sub-menu valid: subMenuId wajib ada,
// milik user yang sama, dan bukan menu itu sendiri (anti loop langsung).
func validateMenuBotItem(db *gorm.DB, userID, botID uint, actionType string, subMenuID *uint) (string, bool) {
	actionType = strings.ToLower(strings.TrimSpace(actionType))
	if actionType != "submenu" {
		return "reply", true
	}
	if subMenuID == nil {
		return "", false
	}
	if *subMenuID == botID {
		return "", false
	}
	var sub models.MenuBot
	if err := db.Where("id = ? AND user_id = ?", *subMenuID, userID).First(&sub).Error; err != nil {
		return "", false
	}
	return "submenu", true
}

func createMenuBotItem(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		bot, ok := menuBotOwned(db, userID, uint(id))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"message": "Menu bot tidak ditemukan"})
			return
		}
		var req struct {
			Label      string `json:"label" binding:"required"`
			ActionType string `json:"actionType"`
			ReplyText  string `json:"replyText"`
			SubMenuID  *uint  `json:"subMenuId"`
			Position   *int   `json:"position"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		actionType, valid := validateMenuBotItem(db, userID, bot.ID, req.ActionType, req.SubMenuID)
		if !valid {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Sub-menu tidak valid"})
			return
		}
		position := 0
		if req.Position != nil {
			position = *req.Position
		} else {
			var maxPos *int
			db.Model(&models.MenuBotItem{}).Where("menu_bot_id = ?", bot.ID).
				Select("MAX(position)").Scan(&maxPos)
			if maxPos != nil {
				position = *maxPos + 1
			} else {
				position = 1
			}
		}
		item := models.MenuBotItem{
			MenuBotID:  bot.ID,
			Position:   position,
			Label:      strings.TrimSpace(req.Label),
			ActionType: actionType,
			ReplyText:  req.ReplyText,
			SubMenuID:  req.SubMenuID,
		}
		if actionType == "reply" {
			item.SubMenuID = nil
		}
		if err := db.Create(&item).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan"})
			return
		}
		c.JSON(http.StatusCreated, gin.H{"item": item})
	}
}

func updateMenuBotItem(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		itemID, _ := strconv.ParseUint(c.Param("itemId"), 10, 32)
		bot, ok := menuBotOwned(db, userID, uint(id))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"message": "Menu bot tidak ditemukan"})
			return
		}
		var item models.MenuBotItem
		if err := db.Where("id = ? AND menu_bot_id = ?", itemID, bot.ID).First(&item).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Opsi tidak ditemukan"})
			return
		}
		var req struct {
			Label      *string `json:"label"`
			ActionType *string `json:"actionType"`
			ReplyText  *string `json:"replyText"`
			SubMenuID  *uint   `json:"subMenuId"`
			ClearSub   bool    `json:"clearSubMenuId"`
			Position   *int    `json:"position"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		updates := map[string]interface{}{}
		if req.Label != nil {
			updates["label"] = strings.TrimSpace(*req.Label)
		}
		if req.ActionType != nil {
			actionType, valid := validateMenuBotItem(db, userID, bot.ID, *req.ActionType, req.SubMenuID)
			if !valid {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Sub-menu tidak valid"})
				return
			}
			updates["action_type"] = actionType
			if actionType == "submenu" {
				updates["sub_menu_id"] = *req.SubMenuID
			} else {
				updates["sub_menu_id"] = nil
			}
		} else if req.ClearSub {
			updates["sub_menu_id"] = nil
		}
		if req.ReplyText != nil {
			updates["reply_text"] = *req.ReplyText
		}
		if req.Position != nil {
			updates["position"] = *req.Position
		}
		if len(updates) > 0 {
			db.Model(&item).Updates(updates)
		}
		db.First(&item, item.ID)
		c.JSON(http.StatusOK, gin.H{"item": item, "message": "Diperbarui"})
	}
}

func deleteMenuBotItem(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		itemID, _ := strconv.ParseUint(c.Param("itemId"), 10, 32)
		bot, ok := menuBotOwned(db, userID, uint(id))
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"message": "Menu bot tidak ditemukan"})
			return
		}
		result := db.Where("id = ? AND menu_bot_id = ?", itemID, bot.ID).Delete(&models.MenuBotItem{})
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Opsi tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Opsi dihapus"})
	}
}

func listMenuBotSessions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		if _, ok := menuBotOwned(db, userID, uint(id)); !ok {
			c.JSON(http.StatusNotFound, gin.H{"message": "Menu bot tidak ditemukan"})
			return
		}
		var sessions []models.MenuBotSession
		db.Where("user_id = ? AND root_menu_id = ?", userID, id).
			Order("last_active_at DESC").
			Find(&sessions)
		c.JSON(http.StatusOK, gin.H{"sessions": sessions})
	}
}

func deleteMenuBotSession(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		sessionID, _ := strconv.ParseUint(c.Param("sessionId"), 10, 32)
		result := db.Where("id = ? AND user_id = ?", sessionID, userID).Delete(&models.MenuBotSession{})
		if result.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Sesi tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Sesi diakhiri"})
	}
}
