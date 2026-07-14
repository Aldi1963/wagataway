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

	r := gin.New()

	// ── Global Middleware ───────────────────────────────────────────────────
	r.Use(gin.Recovery())
	r.Use(middleware.CORS())
	r.Use(middleware.GlobalRateLimit.Middleware())

	// ── Health Check ───────────────────────────────────────────────────────
	r.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// ── Static files (uploads) ─────────────────────────────────────────────
	r.Static("/uploads", "./public/uploads")

	// ── API Routes ─────────────────────────────────────────────────────────
	api := r.Group("/api")
	api.Use(middleware.MaintenanceGuard())
	{
		// ── Public routes (no auth) ────────────────────────────────────────
		registerAuthRoutes(api, cfg, db)
		registerPublicRoutes(api, cfg, db)
		registerOtpAuthRoutes(api, cfg, db)
		registerLinkRoutes(api, db) // /l/:code redirect

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
			registerContactRoutes(protected, db)
			registerContactGroupRoutes(protected, db)
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
			registerDripRoutes(protected, db)
			registerBlacklistRoutes(protected, db)
			registerLinkManageRoutes(protected, db)
			registerBotProductRoutes(protected, db)
			registerBotOrderRoutes(protected, db)
			registerGroupRoutes(protected, db, waManager)
			registerCannedResponseRoutes(protected, db)
			registerTwoFARoutes(protected, cfg, db)
			registerSSERoutes(protected)

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
			if len(path) >= 4 && path[:4] == "/api" {
				c.JSON(http.StatusNotFound, gin.H{"message": "Route not found", "code": "NOT_FOUND"})
				return
			}
			if len(path) >= 8 && path[:8] == "/uploads" {
				c.JSON(http.StatusNotFound, gin.H{"message": "File not found", "code": "NOT_FOUND"})
				return
			}
			c.File(filepath.Join(frontendDist, "index.html"))
		})
	}

	return r
}
