// Regression test untuk rls.Scoped: pola query → Save/Updates pada SATU sesi
// scoped (dulu 500 "specified more than once"), plus isolasi antar-user pada
// pemanggilan sekuensial dan konkuren lewat closure handler.
//
// DB-backed (postgres test; skip bila tidak tersedia).
package rls

import (
	"fmt"
	"net/url"
	"os"
	"sync"
	"testing"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func rlsTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		if b, err := os.ReadFile("/home/hatch/workspace/wagataway/.env"); err == nil {
			for _, ln := range splitLines(string(b)) {
				if len(ln) > 13 && ln[:13] == "DATABASE_URL=" {
					dsn = trimQuotes(ln[13:])
				}
			}
		}
	}
	if dsn == "" {
		t.Skip("DATABASE_URL tidak tersedia — lewati test RLS")
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Skipf("DATABASE_URL tidak valid: <redacted>")
	}
	u.Path = "/wagataway_test"
	db, err := gorm.Open(postgres.New(postgres.Config{
		DriverName: DriverName,
		DSN:        u.String(),
	}), &gorm.Config{})
	if err != nil {
		t.Skipf("postgres test tidak terjangkau: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil || sqlDB.Ping() != nil {
		t.Skip("postgres test tidak terjangkau")
	}
	// Samakan batas pool produksi agar spike konkuren di test realistis.
	sqlDB.SetMaxOpenConns(25)
	sqlDB.SetMaxIdleConns(10)
	Register(db)
	return db
}

func splitLines(s string) []string {
	var out []string
	cur := ""
	for _, r := range s {
		if r == '\n' {
			out = append(out, cur)
			cur = ""
		} else {
			cur += string(r)
		}
	}
	return append(out, cur)
}

func trimQuotes(s string) string {
	if len(s) >= 2 && ((s[0] == '"' && s[len(s)-1] == '"') || (s[0] == '\'' && s[len(s)-1] == '\'')) {
		return s[1 : len(s)-1]
	}
	return s
}

const (
	rlsUserA = uint(9001)
	rlsUserB = uint(9002)
)

func seedRLSKeys(t *testing.T, db *gorm.DB) {
	t.Helper()
	if err := db.AutoMigrate(&models.User{}, &models.ApiKey{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	if err := ApplyRLSTables(db, []string{"api_keys"}); err != nil {
		t.Fatalf("apply RLS: %v", err)
	}
	// Bersihkan sisa run sebelumnya (service access: tanpa scope).
	db.Exec("RESET app.current_user_id")
	db.Unscoped().Where("user_id IN ?", []uint{rlsUserA, rlsUserB}).Delete(&models.ApiKey{})
	for _, uid := range []uint{rlsUserA, rlsUserB} {
		var u models.User
		if err := db.Where("id = ?", uid).First(&u).Error; err != nil {
			db.Create(&models.User{ID: uid, Email: fmt.Sprintf("rlstest%d@x", uid), Password: "x"})
		}
		db.Create(&models.ApiKey{UserID: uid, Name: fmt.Sprintf("kunci-%d", uid), KeyHash: fmt.Sprintf("hash-%d", uid), IsActive: true})
	}
}

// Pola yang dulu 500: query lalu Save/Updates pada sesi scoped yang sama.
func TestScopedQueryThenSaveUpdates(t *testing.T) {
	db := rlsTestDB(t)
	seedRLSKeys(t, db)

	udb := Scoped(db, rlsUserA)
	var k models.ApiKey
	if err := udb.Where("name = ?", "kunci-9001").First(&k).Error; err != nil {
		t.Fatalf("query: %v", err)
	}
	k.Name = "kunci-9001-ganti"
	if err := udb.Save(&k).Error; err != nil {
		t.Fatalf("save: %v", err)
	}
	if err := udb.Model(&models.ApiKey{}).Where("id = ?", k.ID).Updates(map[string]interface{}{"name": "kunci-9001"}).Error; err != nil {
		t.Fatalf("updates: %v", err)
	}
	var n int64
	udb.Model(&models.ApiKey{}).Count(&n)
	if n != 1 {
		t.Fatalf("user A harus lihat tepat 1 key, dapat %d", n)
	}
}

// Isolasi antar-user: panggilan sekuensial lewat closure seperti handler.
func TestScopedSequentialIsolation(t *testing.T) {
	db := rlsTestDB(t)
	seedRLSKeys(t, db)

	// Bentuk closure persis pola handler yang sudah diperbaiki.
	listNames := func(userID uint) []string {
		udb := Scoped(db, userID)
		var keys []models.ApiKey
		if err := udb.Find(&keys).Error; err != nil {
			t.Errorf("user %d: %v", userID, err)
			return nil
		}
		out := make([]string, 0, len(keys))
		for _, k := range keys {
			out = append(out, k.Name)
		}
		return out
	}

	for i := 0; i < 5; i++ {
		a, b := listNames(rlsUserA), listNames(rlsUserB)
		if len(a) != 1 || a[0] != "kunci-9001" {
			t.Fatalf("iter %d: user A bocor: %v", i, a)
		}
		if len(b) != 1 || b[0] != "kunci-9002" {
			t.Fatalf("iter %d: user B bocor: %v", i, b)
		}
	}
}

// Isolasi konkuren: banyak goroutine sebagai dua user berbeda memanggil
// closure yang sama — tidak boleh ada yang melihat data user lain.
func TestScopedConcurrentIsolation(t *testing.T) {
	db := rlsTestDB(t)
	seedRLSKeys(t, db)

	listAndTouch := func(userID uint) error {
		udb := Scoped(db, userID)
		var keys []models.ApiKey
		if err := udb.Find(&keys).Error; err != nil {
			return err
		}
		for _, k := range keys {
			if k.UserID != userID {
				return fmt.Errorf("LEAK: user %d melihat key milik %d", userID, k.UserID)
			}
		}
		// Tulis juga (Save) agar statement reuse ikut teruji di bawah race.
		for i := range keys {
			keys[i].IsActive = true
			if err := udb.Save(&keys[i]).Error; err != nil {
				return err
			}
		}
		return nil
	}

	var wg sync.WaitGroup
	errCh := make(chan error, 200)
	for i := 0; i < 50; i++ {
		for _, uid := range []uint{rlsUserA, rlsUserB} {
			wg.Add(1)
			go func(u uint) {
				defer wg.Done()
				for j := 0; j < 4; j++ {
					if err := listAndTouch(u); err != nil {
						errCh <- err
						return
					}
				}
			}(uid)
		}
	}
	wg.Wait()
	close(errCh)
	for err := range errCh {
		t.Fatal(err)
	}
}

// Tanpa scope (service/cron): bypass tetap melihat semua baris.
func TestScopedServiceBypass(t *testing.T) {
	db := rlsTestDB(t)
	seedRLSKeys(t, db)
	var n int64
	db.Model(&models.ApiKey{}).Where("user_id IN ?", []uint{rlsUserA, rlsUserB}).Count(&n)
	if n != 2 {
		t.Fatalf("service bypass harus lihat 2 baris, dapat %d", n)
	}
}

// Transaksi dari sesi scoped (pola udb.Transaction): SET LOCAL harus
// berlaku untuk seluruh isi transaksi tanpa bocor ke user lain.
func TestScopedTransactionIsolation(t *testing.T) {
	db := rlsTestDB(t)
	seedRLSKeys(t, db)

	for _, uid := range []uint{rlsUserA, rlsUserB} {
		udb := Scoped(db, uid)
		err := udb.Transaction(func(tx *gorm.DB) error {
			var keys []models.ApiKey
			if err := tx.Find(&keys).Error; err != nil {
				return err
			}
			if len(keys) != 1 || keys[0].UserID != uid {
				return fmt.Errorf("LEAK dalam tx: user %d melihat %v", uid, keys)
			}
			keys[0].IsActive = true
			return tx.Save(&keys[0]).Error
		})
		if err != nil {
			t.Fatal(err)
		}
	}
}
