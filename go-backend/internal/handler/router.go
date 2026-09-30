package handler

import (
	"net/http"
	"os"
	"path/filepath"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func NewRouter(cfg *config.Config, db *gorm.DB, waManager *whatsapp.Manager) *gin.Engine {
	if cfg.GinMode == "release" {
		gin.SetMode(gin.ReleaseMode)
	}

	// DB untuk lookup X-API-Key di middleware auth
	middleware.SetAPIKeyDB(db)

	r := gin.New()

	// ── Global Middleware ───────────────────────────────────────────────────
	r.Use(gin.Recovery())
	r.Use(middleware.SecurityHeaders())
	r.Use(middleware.CORS())
	r.Use(middleware.GlobalRateLimit.Middleware())

	// ── Health Check ───────────────────────────────────────────────────────
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// ── Static files (uploads) ─────────────────────────────────────────────
	r.Static("/uploads", "./public/uploads")
	r.Static("/assets", "./web/dist/assets")
	r.Static("/illustrations", "./web/dist/illustrations")

	// ── API Routes ─────────────────────────────────────────────────────────
	api := r.Group("/api")
	api.Use(middleware.MaintenanceGuard())
	{
		// ── Public routes (no auth) ────────────────────────────────────────
		registerAuthRoutes(api, cfg, db)
		registerOAuthRoutes(api, cfg, db)
		registerPublicRoutes(api, cfg, db)
		registerOtpAuthRoutes(api, cfg, db)
		registerLinkRoutes(api, db) // /l/:code redirect

		// Webhook Clipku Pay — publik, diverifikasi via X-Signature
		api.POST("/billing/clipkupay/webhook", clipkuPayWebhook(cfg, db))

		// ── Public API (stricter rate limit) ───────────────────────────────
		publicAPI := api.Group("")
		publicAPI.Use(middleware.PublicAPIRateLimit.Middleware())
		registerPublicAPIRoutes(publicAPI, cfg, db, waManager)

		// ── Protected routes (auth required) ───────────────────────────────
		protected := api.Group("")
		protected.Use(middleware.AuthRequired(cfg))
		{
			registerDashboardRoutes(protected, db)
			registerDeviceRoutes(protected, db, waManager)
			registerMessageRoutes(protected, db, waManager)
			registerFileRoutes(protected, db)
			registerContactRoutes(protected, db, waManager)
			registerContactGroupRoutes(protected, db, waManager)
			registerAutoReplyRoutes(protected, db)
			registerApiKeyRoutes(protected, db)
			registerBillingRoutes(protected, cfg, db)
			registerScheduleRoutes(protected, db)
			registerWebhookRoutes(protected, db)
			registerPluginRoutes(protected, db)
			registerTemplateRoutes(protected, db)
			registerCsBotRoutes(protected, cfg, db)
			registerAntiBannedRoutes(protected, db, waManager)
			registerNotificationRoutes(protected, db)
			registerUploadRoutes(protected)
			registerChatRoutes(protected, db, waManager)
			registerAnalyticsRoutes(protected, db)
			registerStatsRoutes(protected, db)
			registerDripRoutes(protected, db)
			registerBlacklistRoutes(protected, db)
			registerLinkManageRoutes(protected, db)
			registerBotProductRoutes(protected, db)
			registerBotOrderRoutes(protected, db)
			registerGroupRoutes(protected, db, waManager)
			registerCannedResponseRoutes(protected, db)
			registerTwoFARoutes(protected, cfg, db)
			registerSSERoutes(protected)
			registerSSETicketRoutes(protected)

			// ── Admin only routes ──────────────────────────────────────────
			admin := protected.Group("/admin")
			admin.Use(middleware.AdminRequired())
			{
				registerAdminRoutes(admin, cfg, db, waManager)
			}
		}
	}

	// ── SPA Fallback ───────────────────────────────────────────────────────
	frontendDist := "./web/dist"
	if _, err := os.Stat(filepath.Join(frontendDist, "index.html")); err == nil {
		r.NoRoute(func(c *gin.Context) {
			// Don't serve frontend for /api or /uploads
			path := c.Request.URL.Path
			if path == "/api" || (len(path) >= 5 && path[:5] == "/api/") {
				c.JSON(http.StatusNotFound, gin.H{"message": "Route not found", "code": "NOT_FOUND"})
				return
			}
			if len(path) >= 8 && path[:8] == "/uploads" {
				c.JSON(http.StatusNotFound, gin.H{"message": "File not found", "code": "NOT_FOUND"})
				return
			}
			// index.html jangan di-cache browser: setiap deploy ganti hash asset,
			// index.html lama = CSS/JS lama ikut ke-load (tombol Kumo rusak di cache).
			c.Header("Cache-Control", "no-cache")
			c.File(filepath.Join(frontendDist, "index.html"))
		})
	}

	return r
}
