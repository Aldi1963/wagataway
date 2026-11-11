package handler

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"
	"net/http"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"
	"time"
)

func registerTeamMemberRoutes(rg *gin.RouterGroup, cfg *config.Config, db *gorm.DB) {
	// Manajemen anggota tim adalah ranah pemilik akun — hanya key "full"
	// (atau JWT dashboard) yang boleh mengelolanya.
	team := rg.Group("/team", middleware.RequireScope("full"))
	{
		team.GET("", listTeamMembers(db))
		team.POST("", inviteTeamMember(db))
		team.PUT("/:id", updateTeamMember(db))
		team.DELETE("/:id", deleteTeamMember(db))
		team.POST("/:id/toggle", toggleTeamMember(db))
	}
}

// POST /api/auth/team-login didaftarkan terpisah (publik, di bawah).
// Tetap di bawah AuthRateLimit yang sama dengan login utama (10/menit/IP)
// agar tidak jadi jalur brute-force di luar grup /auth.
func registerTeamLoginRoute(rg *gin.RouterGroup, cfg *config.Config, db *gorm.DB) {
	rg.POST("/auth/team-login", middleware.AuthRateLimit.Middleware(), handleTeamLogin(cfg, db))
}

func listTeamMembers(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		page, limit := getPageLimit(c)
		query := udb.Where("owner_id = ?", userID)
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
		udb := rls.Scoped(db, userID)
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
		udb.Model(&models.User{}).Where("email = ?", req.Email).Count(&count)
		udb.Model(&models.TeamMember{}).Where("email = ?", req.Email).Count(&count)
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
		if err := udb.Create(&member).Error; err != nil {
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
		udb := rls.Scoped(db, userID)
		var member models.TeamMember
		if err := udb.Where("id = ? AND owner_id = ?", c.Param("id"), userID).First(&member).Error; err != nil {
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
		passwordChanged := false
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
			passwordChanged = true
		}
		udb.Save(&member)
		if passwordChanged {
			// Password diganti pemilik: token tim lama harus langsung mati.
			_ = revokeTeamSessions(udb, member.ID)
		}
		c.JSON(http.StatusOK, gin.H{"member": member})
	}
}

func deleteTeamMember(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var member models.TeamMember
		if err := udb.Where("id = ? AND owner_id = ?", c.Param("id"), userID).First(&member).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Anggota tidak ditemukan"})
			return
		}
		udb.Delete(&member)
		// Anggota dihapus: token tim-nya harus langsung mati (tanpa ini token
		// tetap lolos AuthRequired sampai kedaluwarsa karena hanya dicek ke
		// tabel sessions, bukan ke tabel team_members).
		_ = revokeTeamSessions(udb, member.ID)
		c.JSON(http.StatusOK, gin.H{"message": "Anggota dihapus"})
	}
}

func toggleTeamMember(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var member models.TeamMember
		if err := udb.Where("id = ? AND owner_id = ?", c.Param("id"), userID).First(&member).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Anggota tidak ditemukan"})
			return
		}
		member.IsActive = !member.IsActive
		wasActive := !member.IsActive
		udb.Save(&member)
		if wasActive {
			// Anggota dinonaktifkan: token tim-nya harus langsung mati.
			_ = revokeTeamSessions(udb, member.ID)
		}
		c.JSON(http.StatusOK, gin.H{"member": member})
	}
}

// registerTeamFailedAttempt menaikkan hitungan gagal team-login; mengunci
// anggota 15 menit setelah 5x gagal beruntun. Cermin registerFailedAttempt
// untuk login utama (konstanta yang sama: maxFailedAttempts,
// accountLockDuration di auth.go).
func registerTeamFailedAttempt(db *gorm.DB, member *models.TeamMember) {
	member.FailedAttempts++
	if member.FailedAttempts >= maxFailedAttempts {
		until := time.Now().Add(accountLockDuration)
		member.LockedUntil = &until
		member.FailedAttempts = 0
	}
	db.Save(member)
}

// handleTeamLogin memverifikasi sub-akun dan menerbitkan JWT.
// Token membawa owner_id agar request sub-akun beroperasi atas data pemilik.
// Token membawa jti + tercatat di tabel sessions agar bisa dicabut
// (logout / ganti password / nonaktifkan / hapus anggota).
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

		// Proteksi brute-force: tolak login selama masa kunci.
		if member.LockedUntil != nil && member.LockedUntil.After(time.Now()) {
			sisa := int(time.Until(*member.LockedUntil).Minutes()) + 1
			c.JSON(http.StatusTooManyRequests, gin.H{
				"message": fmt.Sprintf("Akun dikunci sementara karena terlalu banyak percobaan gagal. Coba lagi dalam %d menit.", sisa),
				"code":    "ACCOUNT_LOCKED",
			})
			return
		}

		if err := bcrypt.CompareHashAndPassword([]byte(member.Password), []byte(req.Password)); err != nil {
			registerTeamFailedAttempt(db, &member)
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Email atau password salah"})
			return
		}

		// Login berhasil: reset hitungan gagal.
		if member.FailedAttempts != 0 || member.LockedUntil != nil {
			member.FailedAttempts = 0
			member.LockedUntil = nil
			db.Save(&member)
		}

		var owner models.User
		if err := db.First(&owner, member.OwnerID).Error; err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"message": "Akun pemilik tidak ditemukan"})
			return
		}
		jti := uuid.NewString()
		claims := &middleware.Claims{
			UserID: owner.ID,
			Email:  member.Email,
			Role:   "team_" + member.Role,
			RegisteredClaims: jwt.RegisteredClaims{
				ID:        jti,
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
		// Catat sesi agar token bisa dicabut; tandai milik anggota tim ini
		// (bukan pemilik) agar revoke saat nonaktif/hapus tidak ikut
		// mencabut sesi pemilik.
		issueSession(db, owner.ID, jti, c)
		db.Model(&models.Session{}).Where("jti = ?", jti).Update("team_member_id", member.ID)
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
