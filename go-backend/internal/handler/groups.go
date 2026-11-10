package handler

import (
	"net/http"
	"strconv"
	"unicode/utf8"

	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// registerGroupRoutes mendaftarkan endpoint manajemen grup WhatsApp.
func registerGroupRoutes(rg *gin.RouterGroup, db *gorm.DB, wm *whatsapp.Manager) {
	groups := rg.Group("/groups")
	{
		groups.GET("", listWAGroups(db, wm))
		groups.POST("", createWAGroup(db, wm))
		groups.POST("/:jid/participants", updateGroupParticipants(db, wm))
		groups.PATCH("/:jid", updateGroupMeta(db, wm))
	}
}

// listWAGroups mengembalikan grup yang diikuti device.
func listWAGroups(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

		var deviceID uint
		if n, err := strconv.ParseUint(c.Query("deviceId"), 10, 32); err != nil || n == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "deviceId wajib diisi", "code": "VALIDATION_ERROR"})
			return
		} else {
			deviceID = uint(n)
		}
		if !checkDeviceOwnership(c, udb, userID, deviceID) {
			return
		}

		groups, err := wm.GetGroups(deviceID)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal mengambil grup: " + err.Error(), "code": "WA_ERROR"})
			return
		}

		out := make([]gin.H, 0, len(groups))
		for _, g := range groups {
			out = append(out, gin.H{
				"jid":              g.JID.String(),
				"name":             g.Name,
				"participantCount": len(g.Participants),
				"topic":            g.Topic,
			})
		}
		c.JSON(http.StatusOK, gin.H{"groups": out})
	}
}

// createWAGroup membuat grup WA baru: POST /api/groups
func createWAGroup(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

		var req struct {
			DeviceID     uint     `json:"deviceId" binding:"required"`
			Name         string   `json:"name" binding:"required"`
			Participants []string `json:"participants"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid (deviceId & name wajib)", "code": "VALIDATION_ERROR"})
			return
		}
		if utf8.RuneCountInString(req.Name) > 25 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Nama grup maksimal 25 karakter (batasan WhatsApp)", "code": "VALIDATION_ERROR"})
			return
		}
		if len(req.Participants) > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Maksimal 100 peserta per request", "code": "VALIDATION_ERROR"})
			return
		}
		if !checkDeviceOwnership(c, udb, userID, req.DeviceID) {
			return
		}

		info, err := wm.CreateWAGroup(req.DeviceID, req.Name, req.Participants)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal membuat grup: " + err.Error(), "code": "WA_ERROR"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{
			"message": "Grup dibuat",
			"group": gin.H{
				"jid":              info.JID.String(),
				"name":             info.Name,
				"participantCount": len(info.Participants),
			},
		})
	}
}

// updateGroupParticipants menambah/mengurangi peserta: POST /api/groups/:jid/participants
func updateGroupParticipants(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

		var req struct {
			DeviceID     uint     `json:"deviceId" binding:"required"`
			Action       string   `json:"action" binding:"required"`
			Participants []string `json:"participants" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid (deviceId, action, participants wajib)", "code": "VALIDATION_ERROR"})
			return
		}
		if req.Action != "add" && req.Action != "remove" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "action harus 'add' atau 'remove'", "code": "VALIDATION_ERROR"})
			return
		}
		if len(req.Participants) == 0 || len(req.Participants) > 100 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "participants butuh 1-100 nomor", "code": "VALIDATION_ERROR"})
			return
		}
		if !checkDeviceOwnership(c, udb, userID, req.DeviceID) {
			return
		}

		if err := wm.UpdateWAGroupParticipants(req.DeviceID, c.Param("jid"), req.Participants, req.Action); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal update peserta: " + err.Error(), "code": "WA_ERROR"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Peserta grup diperbarui"})
	}
}

// updateGroupMeta mengubah nama/deskripsi grup: PATCH /api/groups/:jid
func updateGroupMeta(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)

		var req struct {
			DeviceID uint   `json:"deviceId" binding:"required"`
			Name     string `json:"name"`
			Topic    string `json:"topic"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid (deviceId wajib)", "code": "VALIDATION_ERROR"})
			return
		}
		if req.Name == "" && req.Topic == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Isi name dan/atau topic", "code": "VALIDATION_ERROR"})
			return
		}
		if utf8.RuneCountInString(req.Name) > 25 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Nama grup maksimal 25 karakter (batasan WhatsApp)", "code": "VALIDATION_ERROR"})
			return
		}
		if !checkDeviceOwnership(c, udb, userID, req.DeviceID) {
			return
		}

		if err := wm.SetWAGroupMeta(req.DeviceID, c.Param("jid"), req.Name, req.Topic); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal update grup: " + err.Error(), "code": "WA_ERROR"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "Grup diperbarui"})
	}
}
