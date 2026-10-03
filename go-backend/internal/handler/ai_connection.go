package handler

// CRUD "Koneksi AI" milik user: provider + API key (terenkripsi) + model.
// Dipakai semua fitur AI agar pemilik bot bisa memakai key sendiri.

import (
	"net/http"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/security"
	"github.com/Aldi1963/wagataway/internal/service"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerAIConnectionRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	ar := rg.Group("/ai-connection")
	{
		ar.GET("", getAIConnection(db))
		ar.PUT("", upsertAIConnection(db))
		ar.DELETE("", deleteAIConnection(db))
		ar.POST("/test", testAIConnection(db))
	}
}

// connectionDTO: bentuk aman koneksi untuk frontend (tanpa key asli).
func connectionDTO(conn *models.AIConnection) gin.H {
	if conn == nil {
		return gin.H{"configured": false}
	}
	return gin.H{
		"configured": true,
		"provider":   conn.Provider,
		"model":      conn.Model,
		"baseUrl":    conn.BaseURL,
		"keyHint":    "••••" + conn.KeyHint,
		"isActive":   conn.IsActive,
	}
}

func getAIConnection(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		conn := service.ConnectionForUser(udb, userID)
		// Sertakan juga yang nonaktif agar UI bisa menampilkan statusnya.
		if conn == nil {
			var inactive models.AIConnection
			if err := udb.Where("user_id = ?", userID).First(&inactive).Error; err == nil {
				conn = &inactive
			}
		}
		c.JSON(http.StatusOK, connectionDTO(conn))
	}
}

type aiConnectionReq struct {
	Provider string `json:"provider"`
	APIKey   string `json:"apiKey"`
	Model    string `json:"model"`
	BaseURL  string `json:"baseUrl"`
	IsActive *bool  `json:"isActive"`
}

func upsertAIConnection(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req aiConnectionReq
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		provider := strings.ToLower(strings.TrimSpace(req.Provider))
		if !service.IsValidProvider(provider) {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Provider tidak dikenal. Pilih: openai, gemini, anthropic, custom."})
			return
		}
		model := strings.TrimSpace(req.Model)
		if model == "" {
			model = service.DefaultModelFor(service.AIProvider(provider))
		}
		baseURL := strings.TrimSpace(req.BaseURL)
		prov := service.AIProvider(provider)
		if provider == string(service.ProviderCustom) {
			if baseURL == "" {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Base URL wajib diisi untuk provider custom"})
				return
			}
		}
		if baseURL != "" {
			if !strings.HasPrefix(baseURL, "http://") && !strings.HasPrefix(baseURL, "https://") {
				c.JSON(http.StatusBadRequest, gin.H{"message": "Base URL harus diawali http:// atau https://"})
				return
			}
			baseURL = strings.TrimSuffix(baseURL, "/")
		}
		if !service.IsBaseURLEditable(prov) {
			baseURL = "" // provider fixed: abaikan base URL kiriman
		}

		var conn models.AIConnection
		isNew := udb.Where("user_id = ?", userID).First(&conn).Error != nil

		// API key: wajib saat pertama kali; boleh kosong saat update (key lama dipertahankan).
		if strings.TrimSpace(req.APIKey) != "" {
			enc, err := security.Encrypt(strings.TrimSpace(req.APIKey))
			if err != nil {
				c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal mengenkripsi API key"})
				return
			}
			conn.APIKeyEnc = enc
			key := strings.TrimSpace(req.APIKey)
			if len(key) > 4 {
				conn.KeyHint = key[len(key)-4:]
			} else {
				conn.KeyHint = "••••"
			}
		} else if isNew {
			c.JSON(http.StatusBadRequest, gin.H{"message": "API key wajib diisi"})
			return
		}

		conn.UserID = userID
		conn.Provider = provider
		conn.Model = model
		conn.BaseURL = baseURL
		conn.IsActive = true
		if req.IsActive != nil {
			conn.IsActive = *req.IsActive
		}

		if err := udb.Save(&conn).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan koneksi AI"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"connection": connectionDTO(&conn), "message": "Koneksi AI disimpan"})
	}
}

func deleteAIConnection(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		if err := udb.Where("user_id = ?", userID).Delete(&models.AIConnection{}).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menghapus"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Koneksi AI dihapus. Fitur AI kembali memakai backend global."})
	}
}

// testAIConnection mencoba memanggil provider dengan prompt kecil.
// Body opsional: bila diisi, nilai tersebut diuji TANPA disimpan (untuk
// tombol "Test" sebelum user menekan Simpan).
func testAIConnection(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req aiConnectionReq
		_ = c.ShouldBindJSON(&req) // body boleh kosong → pakai yang tersimpan

		provider := strings.ToLower(strings.TrimSpace(req.Provider))
		model := strings.TrimSpace(req.Model)
		baseURL := strings.TrimSuffix(strings.TrimSpace(req.BaseURL), "/")
		apiKey := strings.TrimSpace(req.APIKey)

		if provider == "" || apiKey == "" {
			conn := service.ConnectionForUser(udb, userID)
			if conn == nil {
				c.JSON(http.StatusBadRequest, gin.H{"ok": false, "message": "Belum ada koneksi AI yang dikonfigurasi"})
				return
			}
			provider = conn.Provider
			if model == "" {
				model = conn.Model
			}
			baseURL = conn.BaseURL
			key, err := security.Decrypt(conn.APIKeyEnc)
			if err != nil || key == "" {
				c.JSON(http.StatusInternalServerError, gin.H{"ok": false, "message": "API key tersimpan tidak bisa dibaca"})
				return
			}
			apiKey = key
		}
		if !service.IsValidProvider(provider) {
			c.JSON(http.StatusBadRequest, gin.H{"ok": false, "message": "Provider tidak dikenal"})
			return
		}
		if model == "" {
			model = service.DefaultModelFor(service.AIProvider(provider))
		}

		svc := service.NewAIServiceForConnection(service.AIProvider(provider), apiKey, baseURL)
		start := time.Now()
		resp, err := svc.Complete(service.ChatRequest{
			Provider:  service.AIProvider(provider),
			Model:     model,
			Messages:  []service.ChatMessage{{Role: "user", Content: "Balas hanya dengan kata: ok"}},
			MaxTokens: 10,
		})
		latency := time.Since(start).Milliseconds()
		if err != nil {
			c.JSON(http.StatusOK, gin.H{"ok": false, "message": friendlyAITestError(err.Error()), "latencyMs": latency})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":        true,
			"message":   "Koneksi berhasil",
			"latencyMs": latency,
			"reply":     strings.TrimSpace(resp.Content),
		})
	}
}

// friendlyAITestError menerjemahkan error teknis menjadi pesan yang ramah.
func friendlyAITestError(errMsg string) string {
	lower := strings.ToLower(errMsg)
	switch {
	case strings.Contains(lower, "401") || strings.Contains(lower, "unauthorized") ||
		strings.Contains(lower, "invalid api key") || strings.Contains(lower, "api key not valid"):
		return "API key ditolak provider (401). Periksa kembali key-nya."
	case strings.Contains(lower, "404") && strings.Contains(lower, "model"):
		return "Model tidak ditemukan (404). Periksa nama modelnya."
	case strings.Contains(lower, "429") || strings.Contains(lower, "quota") || strings.Contains(lower, "rate"):
		return "Kena rate limit / kuota habis (429). Coba lagi nanti atau cek billing provider."
	case strings.Contains(lower, "timeout") || strings.Contains(lower, "connection"):
		return "Tidak bisa menghubungi provider. Periksa koneksi / base URL."
	default:
		if len(errMsg) > 200 {
			return errMsg[:200] + "…"
		}
		return errMsg
	}
}
