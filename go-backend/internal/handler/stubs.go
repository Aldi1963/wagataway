package handler

import (
	"net/http"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ── Remaining stub handlers ───────────────────────────────────────────────────

func stubHandler(name string) gin.HandlerFunc {
	return func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"message": name + " endpoint ready", "code": "OK"})
	}
}

func registerPublicRoutes(rg *gin.RouterGroup, _ *config.Config, _ *gorm.DB) {
	rg.GET("/public/landing", stubHandler("landing-page"))
	rg.GET("/public/plans", stubHandler("public-plans"))
}

func registerOtpAuthRoutes(rg *gin.RouterGroup, _ *config.Config, _ *gorm.DB) {
	otp := rg.Group("/auth/otp")
	{
		otp.POST("/send", stubHandler("otp-send"))
		otp.POST("/verify", stubHandler("otp-verify"))
	}
}

func registerLinkRoutes(rg *gin.RouterGroup, _ *gorm.DB) {
	rg.GET("/l/:code", stubHandler("link-redirect"))
}

func registerPublicAPIRoutes(rg *gin.RouterGroup, _ *config.Config, _ *gorm.DB, _ *whatsapp.Manager) {
	pub := rg.Group("/v1")
	{
		pub.POST("/send", stubHandler("public-api-send"))
		pub.POST("/send-bulk", stubHandler("public-api-bulk"))
		pub.GET("/device/status", stubHandler("public-api-device-status"))
	}
}

func registerDashboardRoutes(rg *gin.RouterGroup, _ *gorm.DB) {
	rg.GET("/dashboard", stubHandler("dashboard"))
	rg.GET("/dashboard/stats", stubHandler("dashboard-stats"))
}

func registerContactGroupRoutes(rg *gin.RouterGroup, _ *gorm.DB) {
	groups := rg.Group("/contact-groups")
	{
		groups.GET("", stubHandler("list-contact-groups"))
		groups.POST("", stubHandler("create-contact-group"))
		groups.PUT("/:id", stubHandler("update-contact-group"))
		groups.DELETE("/:id", stubHandler("delete-contact-group"))
		groups.POST("/:id/members", stubHandler("add-group-members"))
		groups.DELETE("/:id/members/:memberId", stubHandler("remove-group-member"))
	}
}

func registerApiKeyRoutes(rg *gin.RouterGroup, _ *gorm.DB) {
	keys := rg.Group("/api-keys")
	{
		keys.GET("", stubHandler("list-api-keys"))
		keys.POST("", stubHandler("create-api-key"))
		keys.DELETE("/:id", stubHandler("delete-api-key"))
	}
}

func registerScheduleRoutes(rg *gin.RouterGroup, _ *gorm.DB) {
	schedule := rg.Group("/schedule")
	{
		schedule.GET("", stubHandler("list-schedules"))
		schedule.POST("", stubHandler("create-schedule"))
		schedule.PUT("/:id", stubHandler("update-schedule"))
		schedule.DELETE("/:id", stubHandler("delete-schedule"))
	}
}

func registerPluginRoutes(rg *gin.RouterGroup, _ *gorm.DB) {
	plugins := rg.Group("/plugins")
	{
		plugins.GET("", stubHandler("list-plugins"))
		plugins.POST("", stubHandler("create-plugin"))
		plugins.PUT("/:id", stubHandler("update-plugin"))
		plugins.DELETE("/:id", stubHandler("delete-plugin"))
	}
}

func registerCsBotRoutes(rg *gin.RouterGroup, _ *config.Config, _ *gorm.DB) {
	csbot := rg.Group("/cs-bot")
	{
		csbot.GET("", stubHandler("get-csbot"))
		csbot.POST("", stubHandler("create-csbot"))
		csbot.PUT("/:id", stubHandler("update-csbot"))
		csbot.DELETE("/:id", stubHandler("delete-csbot"))
		csbot.GET("/:id/faqs", stubHandler("list-csbot-faqs"))
		csbot.POST("/:id/faqs", stubHandler("create-csbot-faq"))
		csbot.POST("/:id/knowledge", stubHandler("upload-knowledge"))
	}
}

func registerAntiBannedRoutes(rg *gin.RouterGroup, _ *gorm.DB, _ *whatsapp.Manager) {
	ab := rg.Group("/anti-banned")
	{
		ab.GET("/settings", stubHandler("get-anti-banned"))
		ab.PUT("/settings", stubHandler("update-anti-banned"))
	}
}

func registerUploadRoutes(rg *gin.RouterGroup) {
	rg.POST("/upload", stubHandler("upload-file"))
}

func registerLinkManageRoutes(rg *gin.RouterGroup, _ *gorm.DB) {
	links := rg.Group("/links")
	{
		links.GET("", stubHandler("list-links"))
		links.POST("", stubHandler("create-link"))
		links.PUT("/:id", stubHandler("update-link"))
		links.DELETE("/:id", stubHandler("delete-link"))
		links.GET("/:id/stats", stubHandler("link-stats"))
	}
}

func registerBotProductRoutes(rg *gin.RouterGroup, _ *gorm.DB) {
	products := rg.Group("/bot-products")
	{
		products.GET("", stubHandler("list-products"))
		products.POST("", stubHandler("create-product"))
		products.PUT("/:id", stubHandler("update-product"))
		products.DELETE("/:id", stubHandler("delete-product"))
	}
}

func registerBotOrderRoutes(rg *gin.RouterGroup, _ *gorm.DB) {
	orders := rg.Group("/bot-orders")
	{
		orders.GET("", stubHandler("list-orders"))
		orders.PATCH("/:id/status", stubHandler("update-order-status"))
	}
}

func registerGroupRoutes(rg *gin.RouterGroup, _ *gorm.DB, _ *whatsapp.Manager) {
	groups := rg.Group("/groups")
	{
		groups.GET("", stubHandler("list-wa-groups"))
		groups.POST("/send", stubHandler("send-to-group"))
	}
}

func registerTwoFARoutes(rg *gin.RouterGroup, _ *config.Config, _ *gorm.DB) {
	twofa := rg.Group("/2fa")
	{
		twofa.POST("/enable", stubHandler("enable-2fa"))
		twofa.POST("/verify", stubHandler("verify-2fa"))
		twofa.POST("/disable", stubHandler("disable-2fa"))
	}
}

func registerAdminRoutes(rg *gin.RouterGroup, _ *config.Config, _ *gorm.DB, _ *whatsapp.Manager) {
	rg.GET("/users", stubHandler("admin-list-users"))
	rg.PUT("/users/:id", stubHandler("admin-update-user"))
	rg.DELETE("/users/:id", stubHandler("admin-delete-user"))
	rg.GET("/packages", stubHandler("admin-list-packages"))
	rg.POST("/packages", stubHandler("admin-create-package"))
	rg.PUT("/packages/:id", stubHandler("admin-update-package"))
	rg.DELETE("/packages/:id", stubHandler("admin-delete-package"))
	rg.GET("/vouchers", stubHandler("admin-list-vouchers"))
	rg.POST("/vouchers", stubHandler("admin-create-voucher"))
	rg.DELETE("/vouchers/:id", stubHandler("admin-delete-voucher"))
	rg.GET("/settings", stubHandler("admin-get-settings"))
	rg.PUT("/settings", stubHandler("admin-update-settings"))
	rg.GET("/analytics", stubHandler("admin-analytics"))
	rg.GET("/transactions", stubHandler("admin-transactions"))
	rg.POST("/notifications", stubHandler("admin-send-notification"))
	rg.GET("/wa-bot", stubHandler("admin-wa-bot"))
	rg.PUT("/wa-bot", stubHandler("admin-update-wa-bot"))
	rg.PUT("/maintenance", stubHandler("admin-toggle-maintenance"))
}
