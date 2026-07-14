package middleware

import (
	"net/http"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
)

type visitor struct {
	count    int
	lastSeen time.Time
}

type RateLimiter struct {
	visitors map[string]*visitor
	mu       sync.RWMutex
	limit    int
	window   time.Duration
}

func NewRateLimiter(limit int, window time.Duration) *RateLimiter {
	rl := &RateLimiter{
		visitors: make(map[string]*visitor),
		limit:    limit,
		window:   window,
	}

	// Cleanup goroutine
	go func() {
		for {
			time.Sleep(window)
			rl.mu.Lock()
			for ip, v := range rl.visitors {
				if time.Since(v.lastSeen) > window {
					delete(rl.visitors, ip)
				}
			}
			rl.mu.Unlock()
		}
	}()

	return rl
}

func (rl *RateLimiter) Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		ip := c.ClientIP()

		rl.mu.Lock()
		v, exists := rl.visitors[ip]
		if !exists {
			rl.visitors[ip] = &visitor{count: 1, lastSeen: time.Now()}
			rl.mu.Unlock()
			c.Next()
			return
		}

		if time.Since(v.lastSeen) > rl.window {
			v.count = 1
			v.lastSeen = time.Now()
			rl.mu.Unlock()
			c.Next()
			return
		}

		v.count++
		v.lastSeen = time.Now()

		if v.count > rl.limit {
			rl.mu.Unlock()
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{
				"message": "Terlalu banyak permintaan dari IP ini, silakan coba lagi nanti.",
				"code":    "TOO_MANY_REQUESTS",
			})
			return
		}

		rl.mu.Unlock()
		c.Next()
	}
}

// GlobalRateLimit: 1000 req / 15min
var GlobalRateLimit = NewRateLimiter(1000, 15*time.Minute)

// PublicAPIRateLimit: 100 req / 1min
var PublicAPIRateLimit = NewRateLimiter(100, 1*time.Minute)

// AuthRateLimit: 10 req / 1min (login/register)
var AuthRateLimit = NewRateLimiter(10, 1*time.Minute)

func RateLimit(limit int, window time.Duration) gin.HandlerFunc {
	rl := NewRateLimiter(limit, window)
	return rl.Middleware()
}
