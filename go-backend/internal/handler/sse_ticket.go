package handler

import (
	"net/http"

	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/sseauth"
	"github.com/gin-gonic/gin"
)

// registerSSETicketRoutes mendaftarkan endpoint penerbit ticket SSE.
// Route ini dipasang di group protected sehingga butuh auth JWT normal.
func registerSSETicketRoutes(rg *gin.RouterGroup) {
	rg.POST("/sse/ticket", handleCreateSSETicket())
}

func handleCreateSSETicket() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		email, _ := c.Get("email")
		role, _ := c.Get("role")

		emailStr, _ := email.(string)
		roleStr, _ := role.(string)

		ticket, err := sseauth.Issue(userID, emailStr, roleStr)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"message": "Gagal membuat ticket",
				"code":    "SERVER_ERROR",
			})
			return
		}

		c.JSON(http.StatusOK, gin.H{
			"ticket":    ticket,
			"expiresIn": int(sseauth.TicketLifetime.Seconds()),
		})
	}
}
