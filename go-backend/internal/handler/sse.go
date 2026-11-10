package handler

import (
	"fmt"
	"io"
	"time"

	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/realtime"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

// registerSSERoutes sets up the SSE stream endpoint
func registerSSERoutes(rg *gin.RouterGroup) {
	rg.GET("/stream", handleSSEStream())
}

func handleSSEStream() gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		client := &realtime.Client{
			ID:     uuid.New().String(),
			UserID: userID,
			Events: make(chan realtime.Event, 64),
			Done:   make(chan struct{}),
		}

		realtime.DefaultHub.Register(client)
		defer func() {
			realtime.DefaultHub.Unregister(client)
			close(client.Done)
		}()

		// SSE headers
		c.Writer.Header().Set("Content-Type", "text/event-stream")
		c.Writer.Header().Set("Cache-Control", "no-cache")
		c.Writer.Header().Set("Connection", "keep-alive")
		c.Writer.Header().Set("X-Accel-Buffering", "no")
		c.Writer.Flush()

		// Send initial connection event
		fmt.Fprint(c.Writer, realtime.FormatSSE("connected", map[string]string{
			"clientId": client.ID,
		}))
		c.Writer.Flush()

		// Start heartbeat
		go realtime.Heartbeat(client)

		// Stream events
		notify := c.Request.Context().Done()
		for {
			select {
			case evt := <-client.Events:
				data := realtime.FormatSSE(evt.Type, evt.Payload)
				_, err := io.WriteString(c.Writer, data)
				if err != nil {
					return
				}
				c.Writer.Flush()

			case <-notify:
				return

			case <-time.After(60 * time.Second):
				// Keepalive comment
				fmt.Fprint(c.Writer, ": keepalive\n\n")
				c.Writer.Flush()
			}
		}
	}
}
