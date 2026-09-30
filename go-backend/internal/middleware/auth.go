package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/sseauth"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"gorm.io/gorm"
)

// apiKeyDB dipakai untuk lookup X-API-Key. Di-set sekali saat startup
// via SetAPIKeyDB agar middleware tetap tanpa state global lain.
var apiKeyDB *gorm.DB

// SetAPIKeyDB wires the database used for X-API-Key lookups.
func SetAPIKeyDB(db *gorm.DB) {
	apiKeyDB = db
}

type Claims struct {
	UserID uint   `json:"userId"`
	Email  string `json:"email"`
	Role   string `json:"role"`
	jwt.RegisteredClaims
}

func AuthRequired(cfg *config.Config) gin.HandlerFunc {
	return func(c *gin.Context) {
		// API key auth (alternatif JWT) untuk integrasi developer:
		// kirim header X-API-Key dengan nilai key yang dibuat di /api-keys.
		if key := c.GetHeader("X-API-Key"); key != "" && apiKeyDB != nil {
			var ak models.ApiKey
			if err := apiKeyDB.Where("key_hash = ? AND is_active = ?", models.HashAPIKey(key), true).First(&ak).Error; err != nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"message": "API key tidak valid",
					"code":    "INVALID_API_KEY",
				})
				return
			}
			if ak.ExpiresAt != nil && ak.ExpiresAt.Before(time.Now()) {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"message": "API key sudah kadaluarsa",
					"code":    "API_KEY_EXPIRED",
				})
				return
			}
			now := time.Now()
			apiKeyDB.Model(&ak).Update("last_used", now)
			email, role := "", "user"
			var user models.User
			if err := apiKeyDB.Where("id = ?", ak.UserID).First(&user).Error; err == nil {
				email, role = user.Email, user.Role
			}
			c.Set("userID", ak.UserID)
			c.Set("email", email)
			c.Set("role", role)
			c.Next()
			return
		}

		authHeader := c.GetHeader("Authorization")

		// SSE memakai EventSource yang tidak bisa mengirim header Authorization:
		// dukung ticket sekali pakai dari POST /api/sse/ticket sebagai alternatif.
		// Dukungan ?token= (JWT lewat URL) sudah dihapus agar token tidak bocor
		// ke log server, histori browser, atau header Referer.
		if authHeader == "" {
			if ticket := c.Query("ticket"); ticket != "" {
				t, err := sseauth.Consume(ticket)
				if err != nil {
					c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
						"message": "Ticket tidak valid atau sudah kadaluarsa",
						"code":    "INVALID_TICKET",
					})
					return
				}
				c.Set("userID", t.UserID)
				c.Set("email", t.Email)
				c.Set("role", t.Role)
				c.Next()
				return
			}
		}

		if authHeader == "" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"message": "Token tidak ditemukan",
				"code":    "UNAUTHORIZED",
			})
			return
		}

		tokenStr := strings.TrimPrefix(authHeader, "Bearer ")
		if tokenStr == authHeader {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"message": "Format token tidak valid",
				"code":    "INVALID_TOKEN_FORMAT",
			})
			return
		}

		claims := &Claims{}
		token, err := jwt.ParseWithClaims(tokenStr, claims, func(t *jwt.Token) (interface{}, error) {
			return []byte(cfg.JWTSecret), nil
		})

		if err != nil || !token.Valid {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"message": "Token tidak valid atau sudah kadaluarsa",
				"code":    "INVALID_TOKEN",
			})
			return
		}

		// Set user context
		c.Set("userID", claims.UserID)
		c.Set("email", claims.Email)
		c.Set("role", claims.Role)

		c.Next()
	}
}

func AdminRequired() gin.HandlerFunc {
	return func(c *gin.Context) {
		role, exists := c.Get("role")
		if !exists || role.(string) != "admin" {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
				"message": "Akses ditolak. Hanya admin yang bisa mengakses.",
				"code":    "FORBIDDEN",
			})
			return
		}
		c.Next()
	}
}

// GetUserID extracts user ID from gin context
func GetUserID(c *gin.Context) uint {
	id, _ := c.Get("userID")
	return id.(uint)
}
