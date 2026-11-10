package handler

// Login sosial via OAuth2 Authorization Code flow (Google & GitHub).
// Kredensial (client id/secret) dikelola dari halaman admin (pengaturan),
// redirect URI: {APP_URL}/api/auth/oauth/{google,github}/callback

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	settingGoogleClientID     = "google_client_id"
	settingGoogleClientSecret = "google_client_secret"
	settingGithubClientID     = "github_client_id"
	settingGithubClientSecret = "github_client_secret"
)

// sensitiveSettingKeys adalah kunci pengaturan yang tidak boleh dikembalikan
// mentah ke frontend.
var sensitiveSettingKeys = map[string]bool{
	settingClipkuAPIKey:       true,
	settingGoogleClientSecret: true,
	settingGithubClientSecret: true,
	"ai_api_key":              true,
}

type oauthProvider struct {
	name         string
	authURL      string
	tokenURL     string
	userInfoURL  string
	scope        string
	clientIDKey  string
	secretKey    string
}

func oauthProviders() map[string]oauthProvider {
	return map[string]oauthProvider{
		"google": {
			name:        "google",
			authURL:     "https://accounts.google.com/o/oauth2/v2/auth",
			tokenURL:    "https://oauth2.googleapis.com/token",
			userInfoURL: "https://openidconnect.googleapis.com/v1/userinfo",
			scope:       "openid email profile",
			clientIDKey:  settingGoogleClientID,
			secretKey:    settingGoogleClientSecret,
		},
		"github": {
			name:        "github",
			authURL:     "https://github.com/login/oauth/authorize",
			tokenURL:    "https://github.com/login/oauth/access_token",
			userInfoURL: "https://api.github.com/user",
			scope:       "user:email",
			clientIDKey:  settingGithubClientID,
			secretKey:    settingGithubClientSecret,
		},
	}
}

func oauthRedirectURI(cfg *config.Config, provider string) string {
	base := strings.TrimRight(strings.TrimSpace(cfg.AppURL), "/")
	if base == "" {
		base = "https://wa.clipku.com"
	}
	return base + "/api/auth/oauth/" + provider + "/callback"
}

// oauthConfigured memeriksa apakah provider sudah dikonfigurasi.
func oauthConfigured(db *gorm.DB, p oauthProvider) bool {
	return getDBSetting(db, p.clientIDKey) != "" && getDBSetting(db, p.secretKey) != ""
}

// oauthState membuat state acak yang ditandatangani untuk anti-CSRF.
func oauthState(cfg *config.Config) (string, error) {
	b := make([]byte, 24)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	raw := base64.RawURLEncoding.EncodeToString(b)
	mac := hmac.New(sha256.New, []byte(cfg.JWTSecret))
	mac.Write([]byte(raw))
	sig := hex.EncodeToString(mac.Sum(nil))[:32]
	return raw + "." + sig, nil
}

func oauthVerifyState(cfg *config.Config, state string) bool {
	parts := strings.Split(state, ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return false
	}
	mac := hmac.New(sha256.New, []byte(cfg.JWTSecret))
	mac.Write([]byte(parts[0]))
	sig := hex.EncodeToString(mac.Sum(nil))[:32]
	return hmac.Equal([]byte(sig), []byte(parts[1]))
}

// GET /api/auth/oauth/:provider — mulai login sosial (redirect ke provider).
func handleOAuthStart(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		provider := strings.ToLower(c.Param("provider"))
		p, ok := oauthProviders()[provider]
		if !ok {
			c.JSON(http.StatusNotFound, gin.H{"message": "Provider tidak dikenal"})
			return
		}
		if !oauthConfigured(db, p) {
			c.JSON(http.StatusServiceUnavailable, gin.H{
				"message": "Login " + p.name + " belum dikonfigurasi admin",
				"code":    "OAUTH_NOT_CONFIGURED",
			})
			return
		}
		state, err := oauthState(cfg)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membuat state"})
			return
		}
		// Simpan state di cookie httpOnly untuk verifikasi saat callback.
		c.SetCookie("oauth_state", state, 600, "/", "", true, true)

		params := url.Values{}
		params.Set("client_id", getDBSetting(db, p.clientIDKey))
		params.Set("redirect_uri", oauthRedirectURI(cfg, provider))
		params.Set("response_type", "code")
		params.Set("scope", p.scope)
		params.Set("state", state)
		c.Redirect(http.StatusFound, p.authURL+"?"+params.Encode())
	}
}

type oauthTokenResp struct {
	AccessToken string `json:"access_token"`
	TokenType   string `json:"token_type"`
	IDToken     string `json:"id_token"`
}

// oauthExchangeCode menukar authorization code dengan access token.
func oauthExchangeCode(p oauthProvider, clientID, clientSecret, code, redirectURI string) (string, error) {
	form := url.Values{}
	form.Set("client_id", clientID)
	form.Set("client_secret", clientSecret)
	form.Set("code", code)
	form.Set("redirect_uri", redirectURI)
	form.Set("grant_type", "authorization_code")

	req, err := http.NewRequest("POST", p.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	req.Header.Set("Accept", "application/json")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var tok oauthTokenResp
	if err := json.Unmarshal(raw, &tok); err != nil {
		return "", fmt.Errorf("respon token tidak valid")
	}
	if tok.AccessToken == "" {
		return "", fmt.Errorf("gagal mendapatkan access token")
	}
	return tok.AccessToken, nil
}

type oauthUserInfo struct {
	ID      string
	Email   string
	Name    string
	Picture string
}

// oauthFetchUser mengambil profil pengguna dari provider.
func oauthFetchUser(p oauthProvider, accessToken string) (*oauthUserInfo, error) {
	req, err := http.NewRequest("GET", p.userInfoURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var data map[string]any
	if err := json.Unmarshal(raw, &data); err != nil {
		return nil, fmt.Errorf("respon userinfo tidak valid")
	}

	info := &oauthUserInfo{}
	switch p.name {
	case "google":
		info.ID, _ = data["sub"].(string)
		info.Email, _ = data["email"].(string)
		info.Name, _ = data["name"].(string)
		info.Picture, _ = data["picture"].(string)
	case "github":
		if id, ok := data["id"].(float64); ok {
			info.ID = strings.TrimRight(strings.Trim(fmt.Sprintf("%f", id), "0"), ".")
		}
		info.Email, _ = data["email"].(string)
		info.Name, _ = data["name"].(string)
		if info.Name == "" {
			info.Name, _ = data["login"].(string)
		}
		info.Picture, _ = data["avatar_url"].(string)
		// GitHub bisa tidak mengembalikan email publik — ambil dari /emails.
		if info.Email == "" {
			info.Email = fetchGithubPrimaryEmail(accessToken)
		}
	}
	if info.ID == "" || info.Email == "" {
		return nil, fmt.Errorf("data profil tidak lengkap dari %s", p.name)
	}
	return info, nil
}

// fetchGithubPrimaryEmail mengambil email primer terverifikasi dari GitHub.
func fetchGithubPrimaryEmail(accessToken string) string {
	req, _ := http.NewRequest("GET", "https://api.github.com/user/emails", nil)
	req.Header.Set("Authorization", "Bearer "+accessToken)
	req.Header.Set("Accept", "application/json")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var emails []map[string]any
	if err := json.Unmarshal(raw, &emails); err != nil {
		return ""
	}
	for _, e := range emails {
		if primary, _ := e["primary"].(bool); primary {
			if verified, _ := e["verified"].(bool); verified {
				if email, _ := e["email"].(string); email != "" {
					return email
				}
			}
		}
	}
	for _, e := range emails {
		if verified, _ := e["verified"].(bool); verified {
			if email, _ := e["email"].(string); email != "" {
				return email
			}
		}
	}
	return ""
}

// GET /api/auth/oauth/:provider/callback — callback dari provider.
func handleOAuthCallback(cfg *config.Config, db *gorm.DB, waManager *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		provider := strings.ToLower(c.Param("provider"))
		p, ok := oauthProviders()[provider]
		if !ok {
			oauthFail(c, cfg, "Provider tidak dikenal")
			return
		}
		// Verifikasi state anti-CSRF.
		state := c.Query("state")
		cookieState, _ := c.Cookie("oauth_state")
		if state == "" || cookieState == "" || state != cookieState || !oauthVerifyState(cfg, state) {
			oauthFail(c, cfg, "State tidak valid (coba lagi)")
			return
		}
		c.SetCookie("oauth_state", "", -1, "/", "", true, true)

		if errParam := c.Query("error"); errParam != "" {
			oauthFail(c, cfg, "Login dibatalkan")
			return
		}
		code := c.Query("code")
		if code == "" {
			oauthFail(c, cfg, "Kode otorisasi hilang")
			return
		}

		clientID := getDBSetting(db, p.clientIDKey)
		clientSecret := getDBSetting(db, p.secretKey)
		if clientID == "" || clientSecret == "" {
			oauthFail(c, cfg, "Provider belum dikonfigurasi")
			return
		}

		accessToken, err := oauthExchangeCode(p, clientID, clientSecret, code, oauthRedirectURI(cfg, provider))
		if err != nil {
			oauthFail(c, cfg, "Gagal verifikasi ke "+p.name)
			return
		}
		info, err := oauthFetchUser(p, accessToken)
		if err != nil {
			oauthFail(c, cfg, "Gagal mengambil profil")
			return
		}

		user, err := findOrCreateOAuthUser(db, cfg, p.name, info)
		if err != nil {
			oauthFail(c, cfg, err.Error())
			return
		}
		if user.Status == "banned" || user.Status == "suspended" {
			oauthFail(c, cfg, "Akun dinonaktifkan")
			return
		}

		token, jti, err := generateToken(cfg, user)
		if err != nil {
			oauthFail(c, cfg, "Gagal membuat sesi")
			return
		}
		issueSession(db, user.ID, jti, c)
		trackLogin(db, waManager, user, c)

		base := strings.TrimRight(strings.TrimSpace(cfg.AppURL), "/")
		if base == "" {
			base = "https://wa.clipku.com"
		}
		c.Redirect(http.StatusFound, base+"/oauth/callback?token="+url.QueryEscape(token))
	}
}

// oauthFail mengarahkan ke frontend dengan pesan error.
func oauthFail(c *gin.Context, cfg *config.Config, msg string) {
	base := strings.TrimRight(strings.TrimSpace(cfg.AppURL), "/")
	if base == "" {
		base = "https://wa.clipku.com"
	}
	c.Redirect(http.StatusFound, base+"/login?oauth_error="+url.QueryEscape(msg))
}

// findOrCreateOAuthUser mencari user berdasar provider ID / email, atau membuat baru.
func findOrCreateOAuthUser(db *gorm.DB, cfg *config.Config, provider string, info *oauthUserInfo) (*models.User, error) {
	var user models.User
	idField := "google_id"
	if provider == "github" {
		idField = "github_id"
	}
	// 1. Cari berdasar provider ID.
	if err := db.Where(idField+" = ?", info.ID).First(&user).Error; err == nil {
		return &user, nil
	}
	// 2. Cari berdasar email — tautkan akun yang sudah ada.
	if err := db.Where("email = ?", strings.ToLower(info.Email)).First(&user).Error; err == nil {
		db.Model(&user).Update(idField, info.ID)
		if user.Avatar == "" && info.Picture != "" {
			db.Model(&user).Update("avatar", info.Picture)
		}
		return &user, nil
	}
	// 3. Buat akun baru (hormati registration_enabled).
	if v := getDBSetting(db, "registration_enabled"); v == "false" {
		return nil, fmt.Errorf("pendaftaran ditutup")
	}
	user = models.User{
		UUID:   uuid.NewString(),
		Name:   info.Name,
		Email:  strings.ToLower(info.Email),
		Avatar: info.Picture,
		Role:   "user",
		Plan:   getDBSetting(db, "default_plan"),
		Status: "active",
	}
	if user.Plan == "" {
		user.Plan = "free"
	}
	if provider == "google" {
		user.GoogleID = info.ID
	} else {
		user.GithubID = info.ID
	}
	// Password acak — login hanya via OAuth.
	randomPw := make([]byte, 24)
	rand.Read(randomPw)
	user.Password = base64.RawURLEncoding.EncodeToString(randomPw)
	if err := db.Create(&user).Error; err != nil {
		return nil, fmt.Errorf("gagal membuat akun")
	}
	return &user, nil
}

// GET /api/auth/oauth/status — status konfigurasi provider untuk frontend.
func handleOAuthStatus(cfg *config.Config, db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		providers := oauthProviders()
		out := gin.H{}
		for name, p := range providers {
			out[name] = gin.H{
				"enabled":      oauthConfigured(db, p),
				"redirect_uri": oauthRedirectURI(cfg, name),
			}
		}
		c.JSON(http.StatusOK, gin.H{"providers": out})
	}
}

func registerOAuthRoutes(rg *gin.RouterGroup, cfg *config.Config, db *gorm.DB, waManager *whatsapp.Manager) {
	auth := rg.Group("/auth")
	{
		auth.GET("/oauth/status", handleOAuthStatus(cfg, db))
		auth.GET("/oauth/:provider", handleOAuthStart(cfg, db))
		auth.GET("/oauth/:provider/callback", handleOAuthCallback(cfg, db, waManager))
	}
}
