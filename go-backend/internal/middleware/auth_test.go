// Unit test item keamanan 4: scope API key + JWT-only untuk /admin.
//
// Murni (tanpa DB): menguji middleware RequireScope dan RequireJWT lewat
// gin test context.
package middleware

import (
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/gin-gonic/gin"
)

func runMiddleware(t *testing.T, mw gin.HandlerFunc, setup func(c *gin.Context)) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = httptest.NewRequest(http.MethodGet, "/", nil)
	if setup != nil {
		setup(c)
	}
	mw(c)
	if !c.IsAborted() {
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
	return w
}

func TestParseAPIKeyScopes(t *testing.T) {
	if got := ParseAPIKeyScopes(""); len(got) != 1 || got[0] != "full" {
		t.Fatalf("scope kosong harus jadi [full], got %v", got)
	}
	if got := ParseAPIKeyScopes(`["messages:send"]`); len(got) != 1 || got[0] != "messages:send" {
		t.Fatalf("scope JSON harus dipertahankan, got %v", got)
	}
	if got := ParseAPIKeyScopes(`bukan-json`); len(got) != 1 || got[0] != "full" {
		t.Fatalf("scope rusak harus fallback [full], got %v", got)
	}
}

func TestRequireScope(t *testing.T) {
	// Key messages:send boleh ke endpoint messages:send ...
	w := runMiddleware(t, RequireScope("messages:send"), func(c *gin.Context) {
		c.Set("apiKeyScopes", []string{"messages:send"})
	})
	if w.Code != http.StatusOK {
		t.Fatalf("scope cocok harus lolos, got %d", w.Code)
	}
	// ... tapi ditolak di grup lain (default-deny).
	w = runMiddleware(t, RequireScope("chat"), func(c *gin.Context) {
		c.Set("apiKeyScopes", []string{"messages:send"})
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("scope tak cocok harus 403, got %d", w.Code)
	}
	// Key full lolos ke semua grup.
	for _, scope := range []string{"chat", "files", "webhooks", "full"} {
		w = runMiddleware(t, RequireScope(scope), func(c *gin.Context) {
			c.Set("apiKeyScopes", []string{"full"})
		})
		if w.Code != http.StatusOK {
			t.Fatalf("key full harus lolos scope %s, got %d", scope, w.Code)
		}
	}
	// Key tanpa scope tercatat (legacy, NULL di DB) diparse jadi full.
	w = runMiddleware(t, RequireScope("webhooks"), func(c *gin.Context) {
		c.Set("apiKeyScopes", ParseAPIKeyScopes(""))
	})
	if w.Code != http.StatusOK {
		t.Fatalf("key legacy (scope NULL -> full) harus lolos, got %d", w.Code)
	}
	// JWT dashboard (tanpa apiKeyScopes di context) tidak dibatasi scope.
	w = runMiddleware(t, RequireScope("webhooks"), nil)
	if w.Code != http.StatusOK {
		t.Fatalf("JWT harus lolos RequireScope, got %d", w.Code)
	}
}

func TestRequireJWT(t *testing.T) {
	// Autentikasi API key ditolak ...
	w := runMiddleware(t, RequireJWT(), func(c *gin.Context) {
		c.Set("apiKeyScopes", []string{"full"})
	})
	if w.Code != http.StatusForbidden {
		t.Fatalf("API key harus ditolak RequireJWT, got %d", w.Code)
	}
	// ... sementara JWT dashboard lolos.
	w = runMiddleware(t, RequireJWT(), nil)
	if w.Code != http.StatusOK {
		t.Fatalf("JWT harus lolos RequireJWT, got %d", w.Code)
	}
}
