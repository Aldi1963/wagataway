package middleware

import (
	"net/http"
	"sync/atomic"

	"github.com/gin-gonic/gin"
)

var maintenanceMode atomic.Bool

func SetMaintenance(on bool) {
	maintenanceMode.Store(on)
}

func IsMaintenance() bool {
	return maintenanceMode.Load()
}

func MaintenanceGuard() gin.HandlerFunc {
	return func(c *gin.Context) {
		if maintenanceMode.Load() {
			c.AbortWithStatusJSON(http.StatusServiceUnavailable, gin.H{
				"message": "Sistem sedang dalam maintenance. Silakan coba beberapa saat lagi.",
				"code":    "MAINTENANCE",
			})
			return
		}
		c.Next()
	}
}
