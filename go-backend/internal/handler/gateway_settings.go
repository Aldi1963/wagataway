package handler

// Helper baca pengaturan dari tabel settings dengan cache in-memory sederhana.
// Dipakai untuk pengaturan sensitif seperti API key payment gateway.

import (
	"net/http"
	"strings"
	"sync"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

var (
	settingCache   = map[string]string{}
	settingCacheMu sync.RWMutex
)

// getDBSetting membaca satu nilai pengaturan dari DB (cache 60 detik implisit:
// cache hanya di-invalidate saat admin menyimpan pengaturan).
func getDBSetting(db *gorm.DB, key string) string {
	settingCacheMu.RLock()
	if v, ok := settingCache[key]; ok {
		settingCacheMu.RUnlock()
		return v
	}
	settingCacheMu.RUnlock()

	var s models.Setting
	v := ""
	if err := db.Where("key = ?", key).First(&s).Error; err == nil {
		v = s.Value
	}
	settingCacheMu.Lock()
	settingCache[key] = v
	settingCacheMu.Unlock()
	return v
}

// invalidateSettingCache menghapus cache untuk key tertentu (atau semua bila key kosong).
func invalidateSettingCache(key string) {
	settingCacheMu.Lock()
	defer settingCacheMu.Unlock()
	if key == "" {
		settingCache = map[string]string{}
		return
	}
	delete(settingCache, key)
}

// Kunci pengaturan payment gateway.
const (
	settingClipkuAPIKey    = "clipkupay_api_key"
	settingClipkuWebhookURL = "clipkupay_webhook_url"
)

// clipkuAPIKeyFromSettings mengembalikan API key mentah dari pengaturan admin
// (atau env CLIPKUPAY_API_KEY). String kosong bila tidak ada.
func clipkuAPIKeyFromSettings(db *gorm.DB) string {
	if v := getDBSetting(db, settingClipkuAPIKey); v != "" {
		return v
	}
	return getenvClipku("CLIPKUPAY_API_KEY")
}

// clipkuWebhookURLFromSettings mengembalikan webhook URL dari pengaturan admin,
// lalu config, lalu default.
func clipkuWebhookURLFromSettings(db *gorm.DB, cfgWebhookURL string) string {
	if v := getDBSetting(db, settingClipkuWebhookURL); v != "" {
		return v
	}
	if cfgWebhookURL != "" {
		return cfgWebhookURL
	}
	return "https://wa.clipku.com/api/billing/clipkupay/webhook"
}

// ── Admin endpoints ──────────────────────────────────────────────────────────

// GET /api/admin/billing/gateway — status payment gateway untuk halaman admin.
// Tidak pernah mengembalikan API key mentah.
func adminGatewayStatus(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		kp := newClipkuPay(cfg, db)
		c.JSON(http.StatusOK, gin.H{
			"provider":    "clipkupay",
			"mode":        kp.mode(),
			"webhook_url": kp.webhookURL,
			"has_api_key": kp.apiKey != "",
		})
	}
}

// POST /api/admin/billing/gateway/test — uji koneksi ke Clipku Pay.
func adminGatewayTest(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		kp := newClipkuPay(cfg, db)
		if !kp.enabled() {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"ok":      false,
				"message": "Payment gateway belum dikonfigurasi",
			})
			return
		}
		// Uji dengan get_transaction pada order fiktif: 404 = koneksi OK,
		// error lain = masalah koneksi/autentikasi.
		_, err := kp.getTransaction("TEST-CONNECTION-PROBE")
		if err != nil {
			msg := err.Error()
			if strings.Contains(msg, "tidak ditemukan") ||
				strings.Contains(strings.ToLower(msg), "not found") ||
				strings.Contains(msg, "404") {
				c.JSON(http.StatusOK, gin.H{
					"ok":      true,
					"message": "Terhubung ke Clipku Pay (mode: " + kp.mode() + ")",
				})
				return
			}
			c.JSON(http.StatusBadGateway, gin.H{"ok": false, "message": msg})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"ok":      true,
			"message": "Terhubung ke Clipku Pay (mode: " + kp.mode() + ")",
		})
	}
}
