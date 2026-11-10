package middleware

import (
	"encoding/json"
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
	// Purpose membedakan token penuh ("") vs token sementara 2FA ("2fa_pending").
	// Token sementara TIDAK boleh dipakai untuk route terproteksi.
	Purpose string `json:"purpose,omitempty"`
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
			c.Set("apiKeyScopes", ParseAPIKeyScopes(ak.Scopes))
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

		// Token sementara 2FA (pending) tidak boleh mengakses route terproteksi.
		if claims.Purpose == "2fa_pending" {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
				"message": "Verifikasi 2FA belum selesai",
				"code":    "2FA_REQUIRED",
			})
			return
		}

		// Sesi yang dicabut tidak boleh dipakai lagi. Token lama tanpa jti
		// (terbit sebelum fitur sesi) dilewati agar tetap valid sampai expired.
		if apiKeyDB != nil && claims.ID != "" {
			var sess models.Session
			if err := apiKeyDB.Where("jti = ? AND revoked_at IS NULL", claims.ID).First(&sess).Error; err != nil {
				c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{
					"message": "Sesi telah dicabut, silakan login ulang",
					"code":    "SESSION_REVOKED",
				})
				return
			}
			// Update last_seen secukupnya (maks 1x per 5 menit) agar tidak
			// membebani DB di tiap request.
			if time.Since(sess.LastSeen) > 5*time.Minute {
				apiKeyDB.Model(&sess).Update("last_seen", time.Now())
			}
			c.Set("sessionJTI", claims.ID)
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

// ── API key scopes ────────────────────────────────────────────────────────────

// AvailableAPIScopes adalah daftar scope yang bisa dipilih saat membuat API key.
var AvailableAPIScopes = []struct {
	Value string
	Label string
}{
	{"full", "Akses penuh"},
	{"messages:send", "Kirim pesan"},
	{"messages:read", "Baca riwayat pesan"},
	{"contacts", "Kelola kontak & grup"},
	{"devices:read", "Lihat perangkat"},
	{"devices:write", "Kelola perangkat"},
}

func ValidAPIScope(s string) bool {
	for _, sc := range AvailableAPIScopes {
		if sc.Value == s {
			return true
		}
	}
	return false
}

// ParseAPIKeyScopes mengubah JSON scopes menjadi slice; kosong = ["full"]
// agar key lama tetap berfungsi penuh.
func ParseAPIKeyScopes(raw string) []string {
	if strings.TrimSpace(raw) == "" {
		return []string{"full"}
	}
	var scopes []string
	if err := json.Unmarshal([]byte(raw), &scopes); err != nil || len(scopes) == 0 {
		return []string{"full"}
	}
	return scopes
}

// RequireScope menolak request berbasis X-API-Key yang tidak punya scope.
// Request JWT (dashboard) tidak dibatasi scope.
func RequireScope(scope string) gin.HandlerFunc {
	return func(c *gin.Context) {
		v, ok := c.Get("apiKeyScopes")
		if !ok {
			c.Next()
			return
		}
		scopes, _ := v.([]string)
		for _, s := range scopes {
			if s == "full" || s == scope {
				c.Next()
				return
			}
		}
		c.AbortWithStatusJSON(http.StatusForbidden, gin.H{
			"message": "API key tidak memiliki akses: " + scope,
			"code":    "INSUFFICIENT_SCOPE",
		})
	}
}

// GetUserID extracts user ID from gin context
func GetUserID(c *gin.Context) uint {
	id, _ := c.Get("userID")
	return id.(uint)
}
