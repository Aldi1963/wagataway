package handler

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
)

// TestSendMessageIdempotencyRace: 10 request bersamaan dengan kunci
// idempotency yang sama — tepat 1 pesan tersimpan, 9 sisanya dijawab
// sebagai duplikat (bukan 500, bukan pesan ganda).
func TestSendMessageIdempotencyRace(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Device{}, &models.Message{},
		&models.Subscription{}, &models.Plan{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(91200)
	key := "race-idem-1"
	db.Unscoped().Where("user_id = ? AND idempotency_key = ?", uid, key).Delete(&models.Message{})
	db.Unscoped().Where("user_id = ? AND name = ?", uid, "Race Device").Delete(&models.Device{})
	db.Where("id = ?", uid).FirstOrCreate(&models.User{
		ID: uid, UUID: "00000000-0000-0000-0000-000000091200",
		Name: "Race Idem", Email: "race-idem@test.local", Password: "x",
	})
	device := models.Device{UserID: uid, Name: "Race Device", Status: "disconnected"}
	if err := db.Create(&device).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}

	// Pastikan unique index parsial ada (dibuat AutoMigrate+migrasi).
	if err := db.Exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_idem_unique
		ON messages (user_id, device_id, idempotency_key)
		WHERE idempotency_key <> ''`).Error; err != nil {
		t.Fatalf("ensure index: %v", err)
	}

	wm := whatsapp.NewManager(t.TempDir(), db)
	h := sendMessage(db, wm)

	body, _ := json.Marshal(map[string]any{
		"deviceId":       device.ID,
		"to":             "6281234567890",
		"type":           "text",
		"content":        "halo race",
		"idempotencyKey": key,
	})

	var wg sync.WaitGroup
	statuses := make([]int, 10)
	duplicates := make([]bool, 10)
	for i := range statuses {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			w := httptest.NewRecorder()
			c, _ := gin.CreateTestContext(w)
			c.Set("userID", uid)
			c.Request = httptest.NewRequest(http.MethodPost, "/api/messages/send", bytes.NewReader(body))
			c.Request.Header.Set("Content-Type", "application/json")
			h(c)
			statuses[i] = w.Code
			var out map[string]any
			if err := json.Unmarshal(w.Body.Bytes(), &out); err == nil {
				if d, ok := out["duplicate"].(bool); ok {
					duplicates[i] = d
				}
			}
		}(i)
	}
	wg.Wait()

	var n int64
	db.Model(&models.Message{}).Where("user_id = ? AND idempotency_key = ?", uid, key).Count(&n)
	if n != 1 {
		t.Errorf("pesan tersimpan = %d, mau 1 (pesan ganda!)", n)
	}
	dupCount, badStatus := 0, 0
	for i, st := range statuses {
		if st != http.StatusOK {
			badStatus++
			t.Errorf("request %d: status %d, mau 200", i, st)
		}
		if duplicates[i] {
			dupCount++
		}
	}
	if dupCount != 9 {
		t.Errorf("respons duplikat = %d, mau 9 (status: %v)", dupCount, statuses)
	}
	if badStatus > 0 {
		t.Errorf("%d request gagal", badStatus)
	}
}

// TestSendMessageIdempotencyDuplicateKeyFallback: bila baris duplikat sudah
// ada SEBELUM request (cek-cepat menemukan), handler menjawab duplikat
// tanpa membuat baris baru.
func TestSendMessageIdempotencyDuplicateKeyFallback(t *testing.T) {
	gin.SetMode(gin.TestMode)
	db := auditTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.Device{}, &models.Message{},
		&models.Subscription{}, &models.Plan{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(91201)
	key := "idem-sudah-ada"
	db.Unscoped().Where("user_id = ? AND idempotency_key = ?", uid, key).Delete(&models.Message{})
	db.Unscoped().Where("user_id = ? AND name = ?", uid, "Idem Device").Delete(&models.Device{})
	db.Where("id = ?", uid).FirstOrCreate(&models.User{
		ID: uid, UUID: "00000000-0000-0000-0000-000000091201",
		Name: "Idem", Email: "idem@test.local", Password: "x",
	})
	device := models.Device{UserID: uid, Name: "Idem Device", Status: "disconnected"}
	if err := db.Create(&device).Error; err != nil {
		t.Fatalf("seed device: %v", err)
	}
	existing := models.Message{
		UserID: uid, DeviceID: device.ID, To: "6281234567890",
		Type: "text", Content: "sudah ada", Status: "sent", IdempotencyKey: key,
	}
	if err := db.Create(&existing).Error; err != nil {
		t.Fatalf("seed message: %v", err)
	}

	wm := whatsapp.NewManager(t.TempDir(), db)
	body, _ := json.Marshal(map[string]any{
		"deviceId": device.ID, "to": "6281234567890", "type": "text",
		"content": "coba lagi", "idempotencyKey": key,
	})
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Set("userID", uid)
	c.Request = httptest.NewRequest(http.MethodPost, "/api/messages/send", bytes.NewReader(body))
	c.Request.Header.Set("Content-Type", "application/json")
	sendMessage(db, wm)(c)

	if w.Code != http.StatusOK {
		t.Fatalf("status %d, mau 200", w.Code)
	}
	var out map[string]any
	if err := json.Unmarshal(w.Body.Bytes(), &out); err != nil {
		t.Fatalf("respons bukan JSON: %v", err)
	}
	if out["duplicate"] != true {
		t.Errorf("duplicate = %v, mau true", out["duplicate"])
	}
	var n int64
	db.Model(&models.Message{}).Where("user_id = ? AND idempotency_key = ?", uid, key).Count(&n)
	if n != 1 {
		t.Errorf("pesan tersimpan = %d, mau tetap 1", n)
	}
}
