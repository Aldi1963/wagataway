package handler

import (
	"net/http"
	"strconv"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// requestPairCode menerbitkan kode pairing 8 digit WhatsApp untuk device.
// Pengguna memasukkan kode di WhatsApp HP: Perangkat tertaut → Tautkan
// perangkat → "Tautkan dengan nomor telepon".
func requestPairCode(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)

		var device models.Device
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&device).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Perangkat tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		var req struct {
			Phone string `json:"phone"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || req.Phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Nomor HP wajib diisi", "code": "PHONE_REQUIRED"})
			return
		}

		code, err := wm.RequestPairCode(uint(id), req.Phone)
		if err != nil {
			c.JSON(http.StatusBadGateway, gin.H{"message": err.Error(), "code": "PAIR_FAILED"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"code": code, "expiresIn": 120})
	}
}
