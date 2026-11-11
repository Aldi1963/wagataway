// Test logika pesanan katalog (paket catalog): pembuatan order, nomor order
// unik, transisi status, dan pengurangan/pengembalian stok.
//
// DB-backed (postgres test; skip bila tidak tersedia), mengikuti pola
// trialTestDB di paket handler.
package catalog

import (
	"errors"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func catalogTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL tidak diset — lewati test katalog")
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Skipf("DATABASE_URL tidak valid: %v", err)
	}
	u.Path = "/wagataway_test"
	db, err := gorm.Open(postgres.Open(u.String()), &gorm.Config{})
	if err != nil {
		t.Skipf("postgres test tidak terjangkau: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Skipf("gagal ambil sql.DB: %v", err)
	}
	if err := sqlDB.Ping(); err != nil {
		t.Skipf("postgres test tidak terjangkau: %v", err)
	}
	if err := db.AutoMigrate(&models.User{}, &models.BotProduct{}, &models.BotOrder{}, &models.BotOrderItem{}); err != nil {
		t.Fatalf("AutoMigrate gagal: %v", err)
	}
	return db
}

func catalogTestUser(t *testing.T, db *gorm.DB, tag string) models.User {
	t.Helper()
	user := models.User{
		Name:     "Katalog Test " + tag,
		Email:    fmt.Sprintf("catalog-%s-%d@example.com", tag, time.Now().UnixNano()),
		Password: "x",
		Role:     "user",
		Plan:     "free",
		Status:   "active",
		Timezone: "Asia/Jakarta",
	}
	if err := db.Create(&user).Error; err != nil {
		t.Fatalf("gagal buat user test: %v", err)
	}
	return user
}

func catalogTestProduct(t *testing.T, db *gorm.DB, userID uint, name string, price int64, stock int, active bool) models.BotProduct {
	t.Helper()
	p := models.BotProduct{
		UserID:   userID,
		Name:     name,
		Price:    price,
		Stock:    stock,
		Category: "Tes",
		IsActive: active,
	}
	if err := db.Create(&p).Error; err != nil {
		t.Fatalf("gagal buat produk test: %v", err)
	}
	if !active {
		// GORM mengabaikan nilai false pada Create bila kolom punya
		// `default:true` — paksa via Update agar produk benar-benar nonaktif.
		if err := db.Model(&p).Update("is_active", false).Error; err != nil {
			t.Fatalf("gagal menonaktifkan produk test: %v", err)
		}
	}
	return p
}

func cleanupCatalogTest(t *testing.T, db *gorm.DB, userID uint) {
	t.Helper()
	var orderIDs []uint
	db.Model(&models.BotOrder{}).Where("user_id = ?", userID).Pluck("id", &orderIDs)
	if len(orderIDs) > 0 {
		db.Where("order_id IN ?", orderIDs).Delete(&models.BotOrderItem{})
	}
	db.Where("user_id = ?", userID).Delete(&models.BotOrder{})
	db.Where("user_id = ?", userID).Delete(&models.BotProduct{})
	db.Delete(&models.User{}, userID)
}

func TestCanTransition(t *testing.T) {
	if !CanTransition(StatusPending, StatusConfirmed) {
		t.Error("pending → confirmed harus diizinkan")
	}
	if !CanTransition(StatusConfirmed, StatusCancelled) {
		t.Error("confirmed → cancelled harus diizinkan")
	}
	if CanTransition(StatusPending, StatusCompleted) {
		t.Error("pending → completed harus ditolak (loncat status)")
	}
	if CanTransition(StatusCompleted, StatusPending) {
		t.Error("completed adalah status terminal")
	}
	if CanTransition(StatusCancelled, StatusConfirmed) {
		t.Error("cancelled adalah status terminal")
	}
	if CanTransition(StatusPending, StatusPending) {
		t.Error("transisi ke status yang sama harus ditolak")
	}
}

func TestGenerateOrderNumberFormat(t *testing.T) {
	db := catalogTestDB(t)
	user := catalogTestUser(t, db, "ordnum")
	defer cleanupCatalogTest(t, db, user.ID)
	prod := catalogTestProduct(t, db, user.ID, "Tes", 1000, 10, true)

	// Nomor di-generate lalu langsung disimpan (seperti CreateOrder):
	// jaminan unik berasal dari cek DB + unique index.
	seen := map[string]bool{}
	for i := 0; i < 50; i++ {
		num := GenerateOrderNumber(db)
		if !strings.HasPrefix(num, "ORD-") {
			t.Fatalf("nomor order %q harus berawalan ORD-", num)
		}
		if seen[num] {
			t.Fatalf("nomor order duplikat: %s", num)
		}
		seen[num] = true
		if err := db.Create(&models.BotOrder{
			UserID: user.ID, OrderNumber: num, ProductID: prod.ID, BuyerPhone: "6281", Total: 0, Status: StatusPending,
		}).Error; err != nil {
			t.Fatalf("simpan order %s gagal: %v", num, err)
		}
	}
}

func TestCreateOrderMultiItem(t *testing.T) {
	db := catalogTestDB(t)
	user := catalogTestUser(t, db, "multi")
	defer cleanupCatalogTest(t, db, user.ID)

	kopi := catalogTestProduct(t, db, user.ID, "Kopi", 10000, 10, true)
	teh := catalogTestProduct(t, db, user.ID, "Teh", 5000, 10, true)

	order, err := CreateOrder(db, user.ID, "628123456789", "Budi", "", []OrderLine{
		{ProductID: kopi.ID, Quantity: 2},
		{ProductID: teh.ID, Quantity: 3},
		{ProductID: kopi.ID, Quantity: 1}, // baris ganda digabung
	})
	if err != nil {
		t.Fatalf("CreateOrder gagal: %v", err)
	}
	if order.Status != StatusPending {
		t.Errorf("status awal = %q, want pending", order.Status)
	}
	if order.Total != 45000 {
		t.Errorf("total = %d, want 45000 (3x10000 + 3x5000)", order.Total)
	}
	if len(order.Items) != 2 {
		t.Fatalf("items = %d, want 2 (baris ganda digabung)", len(order.Items))
	}
	if !strings.HasPrefix(order.OrderNumber, "ORD-") {
		t.Errorf("orderNumber = %q", order.OrderNumber)
	}
	// Stok BELUM berkurang saat checkout.
	var p models.BotProduct
	db.First(&p, kopi.ID)
	if p.Stock != 10 {
		t.Errorf("stok kopi setelah checkout = %d, want 10 (baru berkurang saat konfirmasi)", p.Stock)
	}
}

func TestCreateOrderRejects(t *testing.T) {
	db := catalogTestDB(t)
	user := catalogTestUser(t, db, "reject")
	defer cleanupCatalogTest(t, db, user.ID)

	aktif := catalogTestProduct(t, db, user.ID, "Aktif", 10000, 1, true)
	nonaktif := catalogTestProduct(t, db, user.ID, "Nonaktif", 10000, 5, false)

	if _, err := CreateOrder(db, user.ID, "6281", "", "", nil); err == nil {
		t.Error("order kosong harus ditolak")
	}
	if _, err := CreateOrder(db, user.ID, "6281", "", "", []OrderLine{{ProductID: nonaktif.ID, Quantity: 1}}); err == nil {
		t.Error("produk nonaktif harus ditolak")
	}
	if _, err := CreateOrder(db, user.ID, "6281", "", "", []OrderLine{{ProductID: aktif.ID, Quantity: 0}}); err == nil {
		t.Error("jumlah 0 harus ditolak")
	}
	if _, err := CreateOrder(db, user.ID, "6281", "", "", []OrderLine{{ProductID: aktif.ID, Quantity: 2}}); !errors.Is(err, ErrInsufficientStock) {
		t.Errorf("stok kurang harus ErrInsufficientStock, dapat: %v", err)
	}
}

func TestConfirmDecrementsStock(t *testing.T) {
	db := catalogTestDB(t)
	user := catalogTestUser(t, db, "confirm")
	defer cleanupCatalogTest(t, db, user.ID)

	kopi := catalogTestProduct(t, db, user.ID, "Kopi", 10000, 5, true)
	order, err := CreateOrder(db, user.ID, "6281", "Budi", "", []OrderLine{{ProductID: kopi.ID, Quantity: 3}})
	if err != nil {
		t.Fatalf("CreateOrder gagal: %v", err)
	}
	updated, err := TransitionOrder(db, user.ID, order.ID, StatusConfirmed)
	if err != nil {
		t.Fatalf("konfirmasi gagal: %v", err)
	}
	if updated.Status != StatusConfirmed {
		t.Errorf("status = %q, want confirmed", updated.Status)
	}
	var p models.BotProduct
	db.First(&p, kopi.ID)
	if p.Stock != 2 {
		t.Errorf("stok setelah konfirmasi = %d, want 2", p.Stock)
	}
	// Konfirmasi kedua ditolak (bukan dari pending).
	if _, err := TransitionOrder(db, user.ID, order.ID, StatusConfirmed); err == nil {
		t.Error("konfirmasi ganda harus ditolak")
	}
}

func TestConfirmInsufficientStockRejected(t *testing.T) {
	db := catalogTestDB(t)
	user := catalogTestUser(t, db, "nostock")
	defer cleanupCatalogTest(t, db, user.ID)

	kopi := catalogTestProduct(t, db, user.ID, "Kopi", 10000, 5, true)
	order, err := CreateOrder(db, user.ID, "6281", "Budi", "", []OrderLine{{ProductID: kopi.ID, Quantity: 4}})
	if err != nil {
		t.Fatalf("CreateOrder gagal: %v", err)
	}
	// Stok menyusut di luar order (mis. terjual lewat jalur lain).
	db.Model(&models.BotProduct{}).Where("id = ?", kopi.ID).Update("stock", 2)
	if _, err := TransitionOrder(db, user.ID, order.ID, StatusConfirmed); !errors.Is(err, ErrInsufficientStock) {
		t.Errorf("konfirmasi stok kurang harus ErrInsufficientStock, dapat: %v", err)
	}
	// Order tetap pending & stok tidak minus.
	var o models.BotOrder
	db.First(&o, order.ID)
	if o.Status != StatusPending {
		t.Errorf("status setelah gagal konfirmasi = %q, want pending", o.Status)
	}
	var p models.BotProduct
	db.First(&p, kopi.ID)
	if p.Stock != 2 {
		t.Errorf("stok = %d, want 2 (tidak boleh minus/berubah)", p.Stock)
	}
}

func TestCancelFromConfirmedRestoresStock(t *testing.T) {
	db := catalogTestDB(t)
	user := catalogTestUser(t, db, "cancel")
	defer cleanupCatalogTest(t, db, user.ID)

	kopi := catalogTestProduct(t, db, user.ID, "Kopi", 10000, 5, true)
	order, err := CreateOrder(db, user.ID, "6281", "Budi", "", []OrderLine{{ProductID: kopi.ID, Quantity: 2}})
	if err != nil {
		t.Fatalf("CreateOrder gagal: %v", err)
	}
	if _, err := TransitionOrder(db, user.ID, order.ID, StatusConfirmed); err != nil {
		t.Fatalf("konfirmasi gagal: %v", err)
	}
	if _, err := TransitionOrder(db, user.ID, order.ID, StatusCancelled); err != nil {
		t.Fatalf("pembatalan dari confirmed gagal: %v", err)
	}
	var p models.BotProduct
	db.First(&p, kopi.ID)
	if p.Stock != 5 {
		t.Errorf("stok setelah batal dari confirmed = %d, want 5 (dikembalikan)", p.Stock)
	}
}

func TestTransitionOwnership(t *testing.T) {
	db := catalogTestDB(t)
	user := catalogTestUser(t, db, "owner")
	other := catalogTestUser(t, db, "other")
	defer cleanupCatalogTest(t, db, user.ID)
	defer cleanupCatalogTest(t, db, other.ID)

	kopi := catalogTestProduct(t, db, user.ID, "Kopi", 10000, 5, true)
	order, err := CreateOrder(db, user.ID, "6281", "Budi", "", []OrderLine{{ProductID: kopi.ID, Quantity: 1}})
	if err != nil {
		t.Fatalf("CreateOrder gagal: %v", err)
	}
	if _, err := TransitionOrder(db, other.ID, order.ID, StatusConfirmed); err == nil {
		t.Error("user lain tidak boleh mengubah status order")
	}
}
