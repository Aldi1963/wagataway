package handler

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strconv"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerApiKeyRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	keys := rg.Group("/api-keys")
	{
		keys.GET("", listApiKeys(db))
		keys.POST("", createApiKey(db))
		keys.DELETE("/:id", deleteApiKey(db))
	}
}

type apiKeyResponse struct {
	ID         uint       `json:"id"`
	Name       string     `json:"name"`
	KeyPreview string     `json:"keyPreview"`
	IsActive   bool       `json:"isActive"`
	LastUsed   *time.Time `json:"lastUsed"`
	ExpiresAt  *time.Time `json:"expiresAt"`
	CreatedAt  time.Time  `json:"createdAt"`
}

func maskAPIKey(key string) string {
	if len(key) <= 4 {
		return "****"
	}
	return "****" + key[len(key)-4:]
}

func toAPIKeyResponse(k models.ApiKey) apiKeyResponse {
	return apiKeyResponse{
		ID:         k.ID,
		Name:       k.Name,
		KeyPreview: maskAPIKey(k.Key),
		IsActive:   k.IsActive,
		LastUsed:   k.LastUsed,
		ExpiresAt:  k.ExpiresAt,
		CreatedAt:  k.CreatedAt,
	}
}

func listApiKeys(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var keys []models.ApiKey
		db.Where("user_id = ?", userID).Order("created_at DESC").Find(&keys)
		out := make([]apiKeyResponse, 0, len(keys))
		for _, k := range keys {
			out = append(out, toAPIKeyResponse(k))
		}
		c.JSON(http.StatusOK, gin.H{"apiKeys": out})
	}
}

func createApiKey(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			Name string `json:"name" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Nama wajib diisi"})
			return
		}
		buf := make([]byte, 16)
		if _, err := rand.Read(buf); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat API key"})
			return
		}
		key := models.ApiKey{
			UserID:   userID,
			Name:     req.Name,
			Key:      "wg_" + hex.EncodeToString(buf),
			IsActive: true,
		}
		if err := db.Create(&key).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan API key"})
			return
		}
		// Key penuh hanya dikembalikan sekali — frontend harus menampilkannya
		// sekali lalu tidak bisa dilihat lagi.
		c.JSON(http.StatusCreated, gin.H{
			"message": "API key dibuat",
			"apiKey":  key.Key,
			"key":     toAPIKeyResponse(key),
		})
	}
}

func deleteApiKey(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		res := db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.ApiKey{})
		if res.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "API key tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "API key dihapus"})
	}
}
