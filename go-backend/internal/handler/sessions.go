package handler

import (
	"net/http"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerSessionRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	s := rg.Group("/sessions")
	{
		s.GET("", handleListSessions(db))
		s.DELETE("/:id", handleRevokeSession(db))
		s.POST("/revoke-others", handleRevokeOtherSessions(db))
	}
}

// issueSession mencatat sesi baru setiap kali token penuh diterbitkan.
func issueSession(db *gorm.DB, userID uint, jti string, c *gin.Context) {
	ua := c.GetHeader("User-Agent")
	if len(ua) > 500 {
		ua = ua[:500]
	}
	now := time.Now()
	db.Create(&models.Session{
		UserID:    userID,
		JTI:       jti,
		IP:        c.ClientIP(),
		UserAgent: ua,
		CreatedAt: now,
		LastSeen:  now,
	})
	// Prune: hapus sesi yang sudah dicabut > 30 hari.
	db.Where("revoked_at IS NOT NULL AND revoked_at < ?", now.Add(-30*24*time.Hour)).
		Delete(&models.Session{})
}

type sessionDTO struct {
	ID        uint       `json:"id"`
	IP        string     `json:"ip"`
	UserAgent string     `json:"userAgent"`
	CreatedAt time.Time  `json:"createdAt"`
	LastSeen  time.Time  `json:"lastSeen"`
	Current   bool       `json:"current"`
	RevokedAt *time.Time `json:"revokedAt,omitempty"`
}

func currentJTI(c *gin.Context) string {
	jti, _ := c.Get("sessionJTI")
	s, _ := jti.(string)
	return s
}

func handleListSessions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		var sessions []models.Session
		if err := db.Where("revoked_at IS NULL").Order("last_seen DESC").Limit(50).Find(&sessions).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memuat sesi"})
			return
		}
		jti := currentJTI(c)
		out := make([]sessionDTO, 0, len(sessions))
		for _, s := range sessions {
			out = append(out, sessionDTO{
				ID: s.ID, IP: s.IP, UserAgent: s.UserAgent,
				CreatedAt: s.CreatedAt, LastSeen: s.LastSeen,
				Current: s.JTI == jti && jti != "",
			})
		}
		c.JSON(http.StatusOK, gin.H{"sessions": out})
	}
}

func handleRevokeSession(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		var s models.Session
		if err := db.Where("id = ? AND revoked_at IS NULL", c.Param("id")).First(&s).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Sesi tidak ditemukan"})
			return
		}
		now := time.Now()
		db.Model(&s).Update("revoked_at", now)
		c.JSON(http.StatusOK, gin.H{"message": "Sesi dicabut"})
	}
}

func handleRevokeOtherSessions(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		db = rls.Scoped(db, userID)
		jti := currentJTI(c)
		q := db.Model(&models.Session{}).Where("revoked_at IS NULL")
		if jti != "" {
			q = q.Where("jti <> ?", jti)
		}
		res := q.Update("revoked_at", time.Now())
		c.JSON(http.StatusOK, gin.H{"message": "Sesi lain dicabut", "revoked": res.RowsAffected})
	}
}
