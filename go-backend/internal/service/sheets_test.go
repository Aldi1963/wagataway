package service

import (
	"context"
	"crypto/rand"
	"crypto/rsa"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

// testServiceAccount membuat service account palsu dengan RSA key yang valid.
func testServiceAccount(t *testing.T) *ServiceAccount {
	t.Helper()
	key, err := rsa.GenerateKey(rand.Reader, 2048)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	der, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		t.Fatalf("marshal key: %v", err)
	}
	pemKey := string(pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: der}))
	raw, _ := json.Marshal(map[string]string{
		"type":         "service_account",
		"client_email": "test@project.iam.gserviceaccount.com",
		"private_key":  pemKey,
		"token_uri":    "https://oauth2.googleapis.com/token",
	})
	sa, err := ParseServiceAccount(raw)
	if err != nil {
		t.Fatalf("ParseServiceAccount: %v", err)
	}
	return sa
}

func TestParseServiceAccountRejectsBadJSON(t *testing.T) {
	if _, err := ParseServiceAccount([]byte(`{"type":"authorized_user"}`)); err == nil {
		t.Fatal("type bukan service_account harus ditolak")
	}
	if _, err := ParseServiceAccount([]byte(`{"type":"service_account","client_email":"a@b.c"}`)); err == nil {
		t.Fatal("tanpa private_key harus ditolak")
	}
	if _, err := ParseServiceAccount([]byte(`not json`)); err == nil {
		t.Fatal("JSON rusak harus ditolak")
	}
}

func TestSheetsClientTokenAppendRead(t *testing.T) {
	sa := testServiceAccount(t)
	var tokenHits, appendHits int
	var appendBody map[string]interface{}
	mux := http.NewServeMux()
	mux.HandleFunc("/token", func(w http.ResponseWriter, r *http.Request) {
		tokenHits++
		if err := r.ParseForm(); err != nil {
			t.Errorf("parse form: %v", err)
		}
		if r.Form.Get("grant_type") != "urn:ietf:params:oauth:grant-type:jwt-bearer" {
			t.Errorf("grant_type salah: %q", r.Form.Get("grant_type"))
		}
		if r.Form.Get("assertion") == "" {
			t.Error("assertion JWT kosong")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"access_token":"tok-123","expires_in":3600,"token_type":"Bearer"}`))
	})
	mux.HandleFunc("/v4/spreadsheets/abc/values/Sheet1!A1:B2:append", func(w http.ResponseWriter, r *http.Request) {
		appendHits++
		if r.Header.Get("Authorization") != "Bearer tok-123" {
			t.Errorf("Authorization salah: %q", r.Header.Get("Authorization"))
		}
		_ = json.NewDecoder(r.Body).Decode(&appendBody)
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"updates":{"updatedRows":2}}`))
	})
	mux.HandleFunc("/v4/spreadsheets/abc/values/Sheet1!A1:B2", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"values":[["Nama","Telepon"],["Budi","62812"]]}`))
	})
	mux.HandleFunc("/v4/spreadsheets/abc", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"properties":{"title":"Pelanggan"}}`))
	})
	srv := httptest.NewServer(mux)
	defer srv.Close()

	c := newSheetsClientForTest(sa, srv.Client(), srv.URL+"/token", srv.URL)
	ctx := context.Background()

	title, err := c.GetSpreadsheetTitle(ctx, "abc")
	if err != nil {
		t.Fatalf("GetSpreadsheetTitle: %v", err)
	}
	if title != "Pelanggan" {
		t.Fatalf("judul = %q", title)
	}
	// Token harus di-cache: pemanggilan kedua tidak menambah tokenHits.
	if _, err := c.GetSpreadsheetTitle(ctx, "abc"); err != nil {
		t.Fatalf("GetSpreadsheetTitle ke-2: %v", err)
	}
	if tokenHits != 1 {
		t.Fatalf("token diminta %d kali, harus 1 (cache)", tokenHits)
	}

	n, err := c.AppendRows(ctx, "abc", "Sheet1!A1:B2", [][]interface{}{{"Budi", "62812"}, {"Ani", "62813"}})
	if err != nil {
		t.Fatalf("AppendRows: %v", err)
	}
	if n != 2 || appendHits != 1 {
		t.Fatalf("append n=%d hits=%d", n, appendHits)
	}
	vals, _ := appendBody["values"].([]interface{})
	if len(vals) != 2 {
		t.Fatalf("values terkirim = %d baris", len(vals))
	}

	rows, err := c.ReadRows(ctx, "abc", "Sheet1!A1:B2")
	if err != nil {
		t.Fatalf("ReadRows: %v", err)
	}
	if len(rows) != 2 || rows[1][0] != "Budi" || rows[1][1] != "62812" {
		t.Fatalf("rows = %#v", rows)
	}
}

func TestSheetsClientTokenRejected(t *testing.T) {
	sa := testServiceAccount(t)
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":"invalid_grant"}`))
	}))
	defer srv.Close()
	c := newSheetsClientForTest(sa, srv.Client(), srv.URL+"/token", srv.URL)
	if _, err := c.AccessToken(context.Background()); err == nil {
		t.Fatal("token ditolak Google harus error")
	} else if !strings.Contains(err.Error(), "400") {
		t.Fatalf("error harus menyebut HTTP 400: %v", err)
	}
}
