package handler

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"time"
)

func registerTeamMemberRoutes(rg *gin.RouterGroup, cfg *config.Config, db *gorm.DB) {
	team := rg.Group("/team")
	{
		team.GET("", listTeamMembers(db))
		team.POST("", inviteTeamMember(db))
		team.PUT("/:id", updateTeamMember(db))
		team.DELETE("/:id", deleteTeamMember(db))
		team.POST("/:id/toggle", toggleTeamMember(db))
	}
}

// POST /api/auth/team-login didaftarkan terpisah (publik, di bawah).
func registerTeamLoginRoute(rg *gin.RouterGroup, cfg *config.Config, db *gorm.DB) {
	rg.POST("/auth/team-login", handleTeamLogin(cfg, db))
}

func listTeamMembers(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		page, limit := getPageLimit(c)
		query := db.Where("owner_id = ?", userID)
		var total int64
		query.Model(&models.TeamMember{}).Count(&total)
		var items []models.TeamMember
		query.Order("created_at DESC").Offset((page - 1) * limit).Limit(limit).Find(&items)
		c.JSON(http.StatusOK, gin.H{
			"members": items,
			"page":    page,
			"limit":   limit,
			"total":   total,
		})
	}
}

// inviteTeamMember membuat sub-akun dengan password acak yang ditampilkan sekali.
func inviteTeamMember(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			Email string `json:"email" binding:"required"`
			Name  string `json:"name" binding:"required"`
			Role  string `json:"role"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Email dan nama wajib diisi"})
			return
		}
		if req.Role != "admin" && req.Role != "viewer" {
			req.Role = "member"
		}
		// Email tidak boleh bentrok dengan user maupun team member lain.
		var count int64
		db.Model(&models.User{}).Where("email = ?", req.Email).Count(&count)
		db.Model(&models.TeamMember{}).Where("email = ?", req.Email).Count(&count)
		if count > 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Email sudah terdaftar"})
			return
		}
		raw := make([]byte, 12)
		if _, err := rand.Read(raw); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat password"})
			return
		}
		plain := base64.RawURLEncoding.EncodeToString(raw)
		hashed, err := bcrypt.GenerateFromPassword([]byte(plain), 12)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat password"})
			return
		}
		member := models.TeamMember{
			OwnerID:  userID,
			Email:    req.Email,
			Name:     req.Name,
			Role:     req.Role,
			IsActive: true,
			Password: string(hashed),
		}
		if err := db.Create(&member).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal mengundang anggota"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"member":   member,
			"password": plain, // ditampilkan sekali saja
			"message":  "Simpan password ini — hanya ditampilkan sekali",
		})
	}
}

func updateTeamMember(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var member models.TeamMember
		if err := db.Where("id = ? AND owner_id = ?", c.Param("id"), userID).First(&member).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Anggota tidak ditemukan"})
			return
		}
		var req struct {
			Name     string `json:"name"`
			Role     string `json:"role"`
			Password string `json:"password"` // opsional: reset password
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if req.Name != "" {
			member.Name = req.Name
		}
		if req.Role == "admin" || req.Role == "member" || req.Role == "viewer" {
			member.Role = req.Role
		}
		if req.Password != "" {
			if len(req.Password) < 6 {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Password minimal 6 karakter"})
				return
			}
			hashed, err := bcrypt.GenerateFromPassword([]byte(req.Password), 12)
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal mengubah password"})
				return
			}
			member.Password = string(hashed)
		}
		db.Save(&member)
		c.JSON(http.StatusOK, gin.H{"member": member})
	}
}

func deleteTeamMember(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		res := db.Where("id = ? AND owner_id = ?", c.Param("id"), userID).Delete(&models.TeamMember{})
		if res.RowsAffected == 0 {
			c.JSON(http.StatusNotFound, gin.H{"message": "Anggota tidak ditemukan"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Anggota dihapus"})
	}
}

func toggleTeamMember(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var member models.TeamMember
		if err := db.Where("id = ? AND owner_id = ?", c.Param("id"), userID).First(&member).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Anggota tidak ditemukan"})
			return
		}
		member.IsActive = !member.IsActive
		db.Save(&member)
		c.JSON(http.StatusOK, gin.H{"member": member})
	}
}

// handleTeamLogin memverifikasi sub-akun dan menerbitkan JWT.
// Token membawa owner_id agar request sub-akun beroperasi atas data pemilik.
func handleTeamLogin(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		var req struct {
			Email    string `json:"email" binding:"required"`
			Password string `json:"password" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Email dan password wajib diisi"})
			return
		}
		var member models.TeamMember
		if err := db.Where("email = ?", req.Email).First(&member).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Email atau password salah"})
			return
		}
		if !member.IsActive {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Akun dinonaktifkan"})
			return
		}
		if err := bcrypt.CompareHashAndPassword([]byte(member.Password), []byte(req.Password)); err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Email atau password salah"})
			return
		}
		var owner models.User
		if err := db.First(&owner, member.OwnerID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Akun pemilik tidak ditemukan"})
			return
		}
		claims := &middleware.Claims{
			UserID: owner.ID,
			Email:  member.Email,
			Role:   "team_" + member.Role,
			RegisteredClaims: jwt.RegisteredClaims{
				ExpiresAt: jwt.NewNumericDate(time.Now().Add(cfg.JWTExpiry)),
				IssuedAt:  jwt.NewNumericDate(time.Now()),
			},
		}
		token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
		signed, err := token.SignedString([]byte(cfg.JWTSecret))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat token"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"token": signed,
			"user": gin.H{
				"id":         owner.ID,
				"name":       member.Name,
				"email":      member.Email,
				"role":       "team_" + member.Role,
				"plan":       owner.Plan,
				"isTeam":     true,
				"teamRole":   member.Role,
				"teamMember": member.ID,
			},
		})
	}
}
