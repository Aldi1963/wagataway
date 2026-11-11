// Klien Google Sheets API v4 berbasis service account — tanpa dependensi
// Google API client (stdlib + golang-jwt saja). Alur: JWT RS256 yang
// ditandatangani private_key service account ditukar ke access token OAuth2,
// lalu dipakai untuk baca/tulis values spreadsheet.
// Fail-closed: tanpa koneksi (atau kredensial tidak valid) semua operasi
// mengembalikan error dan TIDAK pernah memakai kredensial default.
package service

import (
	"bytes"
	"context"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/Aldi1963/wagataway/internal/security"
	"github.com/golang-jwt/jwt/v5"
)

const (
	sheetsScope       = "https://www.googleapis.com/auth/spreadsheets"
	defaultTokenURL   = "https://oauth2.googleapis.com/token"
	defaultSheetsBase = "https://sheets.googleapis.com"
)

// ServiceAccount adalah isi JSON service account Google (file yang diunduh
// dari Google Cloud Console). Hanya tiga field ini yang dipakai.
type ServiceAccount struct {
	Type        string `json:"type"`
	ClientEmail string `json:"client_email"`
	PrivateKey  string `json:"private_key"`
	TokenURI    string `json:"token_uri"`
}

// ParseServiceAccount memvalidasi JSON service account: wajib type
// "service_account" dengan client_email + private_key yang valid.
func ParseServiceAccount(raw []byte) (*ServiceAccount, error) {
	var sa ServiceAccount
	if err := json.Unmarshal(raw, &sa); err != nil {
		return nil, fmt.Errorf("JSON service account tidak valid: %w", err)
	}
	if sa.Type != "service_account" {
		return nil, errors.New("JSON bukan service account (field type harus \"service_account\")")
	}
	if strings.TrimSpace(sa.ClientEmail) == "" {
		return nil, errors.New("service account tidak punya client_email")
	}
	if strings.TrimSpace(sa.PrivateKey) == "" {
		return nil, errors.New("service account tidak punya private_key")
	}
	if _, err := parsePrivateKey(sa.PrivateKey); err != nil {
		return nil, fmt.Errorf("private_key tidak valid: %w", err)
	}
	if sa.TokenURI == "" {
		sa.TokenURI = defaultTokenURL
	}
	return &sa, nil
}

func parsePrivateKey(pemStr string) (*rsa.PrivateKey, error) {
	block, _ := pem.Decode([]byte(pemStr))
	if block == nil {
		return nil, errors.New("bukan PEM")
	}
	parsed, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		// Coba PKCS#1 (RSA tradisional) sebagai fallback.
		if k, err2 := x509.ParsePKCS1PrivateKey(block.Bytes); err2 == nil {
			return k, nil
		}
		return nil, err
	}
	key, ok := parsed.(*rsa.PrivateKey)
	if !ok {
		return nil, errors.New("private key bukan RSA")
	}
	return key, nil
}

// SheetsClient memanggil Sheets API v4 dengan access token hasil JWT grant.
// Token di-cache sampai sebelum kedaluwarsa.
type SheetsClient struct {
	sa       *ServiceAccount
	http     *http.Client
	tokenURL string
	apiBase  string
	mu       sync.Mutex
	token    string
	tokenExp time.Time
}

// NewSheetsClient membuat klien dengan endpoint default Google.
func NewSheetsClient(sa *ServiceAccount) *SheetsClient {
	return &SheetsClient{
		sa:       sa,
		http:     security.NewSafeClient(30 * time.Second),
		tokenURL: firstNonEmpty(sa.TokenURI, defaultTokenURL),
		apiBase:  defaultSheetsBase,
	}
}

// newSheetsClientForTest membuat klien dengan endpoint + HTTP client yang
// bisa diarahkan ke httptest server (hanya untuk unit test).
func newSheetsClientForTest(sa *ServiceAccount, httpClient *http.Client, tokenURL, apiBase string) *SheetsClient {
	return &SheetsClient{sa: sa, http: httpClient, tokenURL: tokenURL, apiBase: apiBase}
}

func firstNonEmpty(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}

// buildJWT membuat JWT RS256 untuk OAuth2 JWT-bearer grant.
func (c *SheetsClient) buildJWT() (string, error) {
	key, err := parsePrivateKey(c.sa.PrivateKey)
	if err != nil {
		return "", err
	}
	now := time.Now()
	claims := jwt.MapClaims{
		"iss":   c.sa.ClientEmail,
		"scope": sheetsScope,
		"aud":   c.tokenURL,
		"exp":   now.Add(time.Hour).Unix(),
		"iat":   now.Unix(),
	}
	tok := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return tok.SignedString(key)
}

// AccessToken menukar JWT ke access token (di-cache sampai 5 menit sebelum
// kedaluwarsa).
func (c *SheetsClient) AccessToken(ctx context.Context) (string, error) {
	c.mu.Lock()
	defer c.mu.Unlock()
	if c.token != "" && time.Now().Before(c.tokenExp.Add(-5*time.Minute)) {
		return c.token, nil
	}
	assertion, err := c.buildJWT()
	if err != nil {
		return "", fmt.Errorf("gagal membuat JWT service account: %w", err)
	}
	form := url.Values{}
	form.Set("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer")
	form.Set("assertion", assertion)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.tokenURL, strings.NewReader(form.Encode()))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/x-www-form-urlencoded")
	resp, err := c.http.Do(req)
	if err != nil {
		return "", fmt.Errorf("gagal meminta access token Google: %w", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Google menolak token service account (HTTP %d): %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	var tok struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int64  `json:"expires_in"`
	}
	if err := json.Unmarshal(body, &tok); err != nil || tok.AccessToken == "" {
		return "", errors.New("respons token Google tidak valid")
	}
	c.token = tok.AccessToken
	if tok.ExpiresIn > 0 {
		c.tokenExp = time.Now().Add(time.Duration(tok.ExpiresIn) * time.Second)
	} else {
		c.tokenExp = time.Now().Add(time.Hour)
	}
	return c.token, nil
}

func (c *SheetsClient) doJSON(ctx context.Context, method, url string, payload interface{}) ([]byte, int, error) {
	token, err := c.AccessToken(ctx)
	if err != nil {
		return nil, 0, err
	}
	var body io.Reader
	if payload != nil {
		b, err := json.Marshal(payload)
		if err != nil {
			return nil, 0, err
		}
		body = bytes.NewReader(b)
	}
	req, err := http.NewRequestWithContext(ctx, method, url, body)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	if payload != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("gagal memanggil Google Sheets API: %w", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, resp.StatusCode, fmt.Errorf("Google Sheets API HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(data)))
	}
	return data, resp.StatusCode, nil
}

// GetSpreadsheetTitle mengambil judul spreadsheet — dipakai tombol "Tes Koneksi".
func (c *SheetsClient) GetSpreadsheetTitle(ctx context.Context, spreadsheetID string) (string, error) {
	u := fmt.Sprintf("%s/v4/spreadsheets/%s?fields=properties.title", c.apiBase, url.PathEscape(spreadsheetID))
	data, _, err := c.doJSON(ctx, http.MethodGet, u, nil)
	if err != nil {
		return "", err
	}
	var out struct {
		Properties struct {
			Title string `json:"title"`
		} `json:"properties"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return "", fmt.Errorf("respons spreadsheet tidak valid: %w", err)
	}
	return out.Properties.Title, nil
}

// ReadRows membaca nilai sel sebagai baris string (range mis. "Kontak!A1:E1000").
func (c *SheetsClient) ReadRows(ctx context.Context, spreadsheetID, sheetRange string) ([][]string, error) {
	u := fmt.Sprintf("%s/v4/spreadsheets/%s/values/%s?majorDimension=ROWS",
		c.apiBase, url.PathEscape(spreadsheetID), url.PathEscape(sheetRange))
	data, _, err := c.doJSON(ctx, http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	var out struct {
		Values [][]interface{} `json:"values"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return nil, fmt.Errorf("respons values tidak valid: %w", err)
	}
	rows := make([][]string, 0, len(out.Values))
	for _, r := range out.Values {
		row := make([]string, len(r))
		for i, v := range r {
			switch t := v.(type) {
			case string:
				row[i] = t
			case float64:
				row[i] = strings.TrimRight(strings.TrimRight(fmt.Sprintf("%f", t), "0"), ".")
			case bool:
				row[i] = fmt.Sprintf("%v", t)
			case nil:
				row[i] = ""
			default:
				row[i] = fmt.Sprintf("%v", t)
			}
		}
		rows = append(rows, row)
	}
	return rows, nil
}

// AppendRows menambahkan baris di akhir sheet (INSERT_ROWS). Mengembalikan
// jumlah sel/baris yang ditulis menurut respons API.
func (c *SheetsClient) AppendRows(ctx context.Context, spreadsheetID, sheetRange string, values [][]interface{}) (int, error) {
	u := fmt.Sprintf("%s/v4/spreadsheets/%s/values/%s:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS",
		c.apiBase, url.PathEscape(spreadsheetID), url.PathEscape(sheetRange))
	data, _, err := c.doJSON(ctx, http.MethodPost, u, map[string]interface{}{
		"range":          sheetRange,
		"majorDimension": "ROWS",
		"values":         values,
	})
	if err != nil {
		return 0, err
	}
	var out struct {
		Updates struct {
			UpdatedRows int `json:"updatedRows"`
		} `json:"updates"`
	}
	if err := json.Unmarshal(data, &out); err != nil {
		return 0, fmt.Errorf("respons append tidak valid: %w", err)
	}
	return out.Updates.UpdatedRows, nil
}
