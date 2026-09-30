package middleware

import (
	"github.com/gin-gonic/gin"
)

// Origin eksplisit yang diizinkan mengakses API dari browser.
const allowedOrigin = "https://wa.clipku.com"

func CORS() gin.HandlerFunc {
	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")

		// Browser: hanya origin eksplisit yang diizinkan.
		// Non-browser (curl, server-to-server): tidak ada header Origin, tetap izinkan.
		if origin == allowedOrigin {
			c.Header("Access-Control-Allow-Origin", origin)
			c.Header("Access-Control-Allow-Credentials", "true")
			c.Header("Vary", "Origin")
		} else if origin == "" {
			c.Header("Access-Control-Allow-Credentials", "true")
		}

		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-API-Key")
		c.Header("Access-Control-Max-Age", "86400")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	}
}
