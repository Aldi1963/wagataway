package handler

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"strconv"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

func registerApiKeyRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	keys := rg.Group("/api-keys")
	{
		keys.GET("", listApiKeys(db))
		keys.GET("/scopes", listAPIScopes())
		keys.POST("", createApiKey(db))
		keys.POST("/:id/rotate", rotateApiKey(db))
		keys.DELETE("/:id", deleteApiKey(db))
	}
}

func listAPIScopes() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"scopes": middleware.AvailableAPIScopes})
	}
}

type apiKeyResponse struct {
	ID         uint       `json:"id"`
	Name       string     `json:"name"`
	KeyPreview string     `json:"keyPreview"`
	IsActive   bool       `json:"isActive"`
	Scopes     []string   `json:"scopes"`
	LastUsed   *time.Time `json:"lastUsed"`
	ExpiresAt  *time.Time `json:"expiresAt"`
	Expired    bool       `json:"expired"`
	CreatedAt  time.Time  `json:"createdAt"`
}

func maskAPIKey(key string) string {
	if len(key) <= 4 {
		return "****"
	}
	return "****" + key[len(key)-4:]
}

func toAPIKeyResponse(k models.ApiKey) apiKeyResponse {
	expired := k.ExpiresAt != nil && k.ExpiresAt.Before(time.Now())
	return apiKeyResponse{
		ID:         k.ID,
		Name:       k.Name,
		KeyPreview: maskAPIKey(k.Key),
		IsActive:   k.IsActive && !expired,
		Scopes:     middleware.ParseAPIKeyScopes(k.Scopes),
		LastUsed:   k.LastUsed,
		ExpiresAt:  k.ExpiresAt,
		Expired:    expired,
		CreatedAt:  k.CreatedAt,
	}
}

func listApiKeys(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
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
		db = rls.Scoped(db, userID)
		var req struct {
			Name          string   `json:"name" binding:"required"`
			Scopes        []string `json:"scopes"`
			ExpiresInDays *int     `json:"expiresInDays"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Nama wajib diisi"})
			return
		}
		// Validasi scopes; kosong = akses penuh.
		scopes := req.Scopes
		if len(scopes) == 0 {
			scopes = []string{"full"}
		}
		for _, s := range scopes {
			if !middleware.ValidAPIScope(s) {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Scope tidak dikenal: " + s})
				return
			}
		}
		scopesJSON, _ := json.Marshal(scopes)

		var expiresAt *time.Time
		if req.ExpiresInDays != nil && *req.ExpiresInDays > 0 {
			t := time.Now().Add(time.Duration(*req.ExpiresInDays) * 24 * time.Hour)
			expiresAt = &t
		}

		buf := make([]byte, 16)
		if _, err := rand.Read(buf); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat API key"})
			return
		}
		rawKey := "wg_" + hex.EncodeToString(buf)
		key := models.ApiKey{
			UserID:    userID,
			Name:      req.Name,
			Key:       "", // key mentah TIDAK disimpan — hanya hash-nya
			KeyHash:   models.HashAPIKey(rawKey),
			IsActive:  true,
			Scopes:    string(scopesJSON),
			ExpiresAt: expiresAt,
		}
		if err := db.Create(&key).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan API key"})
			return
		}
		// Key penuh hanya dikembalikan sekali — frontend harus menampilkannya
		// sekali lalu tidak bisa dilihat lagi.
		resp := toAPIKeyResponse(key)
		resp.KeyPreview = maskAPIKey(rawKey)
		c.JSON(http.StatusCreated, gin.H{
			"message": "API key dibuat",
			"apiKey":  rawKey,
			"key":     resp,
		})
	}
}

// rotateApiKey mengganti key dengan nilai baru (key lama langsung mati).
// Key baru hanya dikembalikan sekali dalam respons ini.
func rotateApiKey(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		var key models.ApiKey
		if err := db.Where("id = ? AND user_id = ?", id, userID).First(&key).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "API key tidak ditemukan"})
			return
		}
		buf := make([]byte, 16)
		if _, err := rand.Read(buf); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat key baru"})
			return
		}
		rawKey := "wg_" + hex.EncodeToString(buf)
		now := time.Now()
		key.KeyHash = models.HashAPIKey(rawKey)
		key.LastUsed = nil
		key.UpdatedAt = now
		if err := db.Save(&key).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal merotasi API key"})
			return
		}
		log.Info().Uint("user", userID).Uint("key", key.ID).Msg("API key dirotasi")
		resp := toAPIKeyResponse(key)
		resp.KeyPreview = maskAPIKey(rawKey)
		c.JSON(http.StatusOK, gin.H{
			"message": "API key dirotasi — key lama sudah tidak berlaku",
			"apiKey":  rawKey,
			"key":     resp,
		})
	}
}

func deleteApiKey(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		id, _ := strconv.ParseUint(c.Param("id"), 10, 32)
		res := db.Where("id = ? AND user_id = ?", id, userID).Delete(&models.ApiKey{})
		if res.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "API key tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "API key dihapus"})
	}
}
