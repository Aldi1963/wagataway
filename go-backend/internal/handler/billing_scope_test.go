package handler

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/gin-gonic/gin"
)

// TestBillingGroupRequiresBillingScope memverifikasi penguncian grup /billing
// (item keamanan #4): pola yang sama seperti registerBillingRoutes —
// grup /billing memakai middleware.RequireScope("billing").
//
//   - JWT dashboard (tanpa apiKeyScopes) lolos.
//   - Key "full" (termasuk key lama NULL-scope yang di-grandfather di
//     ParseAPIKeyScopes) lolos.
//   - Key berscope "billing" lolos.
//   - Key berscope eksplisit lain (mis. messages:send milik DuitUsaha)
//     ditolak 403 INSUFFICIENT_SCOPE.
//   - GET /api/quota di luar grup sengaja tidak dikunci (tetap lolos).
func TestBillingGroupRequiresBillingScope(t *testing.T) {
	gin.SetMode(gin.TestMode)
	newRouter := func(scopes []string, setScopes bool) *gin.Engine {
		r := gin.New()
		// Meniru middleware auth: menanam apiKeyScopes hanya untuk
		// request berbasis API key.
		r.Use(func(c *gin.Context) {
			if setScopes {
				c.Set("apiKeyScopes", scopes)
			}
			c.Next()
		})
		rg := r.Group("/api")
		b := rg.Group("/billing", middleware.RequireScope("billing"))
		b.GET("/plans", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })
		rg.GET("/quota", func(c *gin.Context) { c.JSON(http.StatusOK, gin.H{"ok": true}) })
		return r
	}
	call := func(r *gin.Engine, path string) (int, string) {
		w := httptest.NewRecorder()
		r.ServeHTTP(w, httptest.NewRequest(http.MethodGet, path, nil))
		return w.Code, w.Body.String()
	}

	cases := []struct {
		name      string
		scopes    []string
		setScopes bool
		path      string
		want      int
	}{
		{"JWT dashboard lolos", nil, false, "/api/billing/plans", http.StatusOK},
		{"key full lolos", []string{"full"}, true, "/api/billing/plans", http.StatusOK},
		{"key billing lolos", []string{"billing"}, true, "/api/billing/plans", http.StatusOK},
		{"key messages:send ditolak", []string{"messages:send"}, true, "/api/billing/plans", http.StatusForbidden},
		{"key tanpa scope apapun ditolak", []string{}, true, "/api/billing/plans", http.StatusForbidden},
		{"/quota di luar grup tetap lolos", []string{"messages:send"}, true, "/api/quota", http.StatusOK},
	}
	for _, c := range cases {
		code, body := call(newRouter(c.scopes, c.setScopes), c.path)
		if code != c.want {
			t.Errorf("%s: status %d (%s), mau %d", c.name, code, body, c.want)
		}
	}
}
