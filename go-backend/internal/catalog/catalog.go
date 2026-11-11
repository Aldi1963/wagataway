package catalog

// Logika inti pesanan katalog, dipakai bersama oleh handler API panel
// (internal/handler) dan bot katalog di chat WA (internal/whatsapp).
// Stok TIDAK berkurang saat checkout — baru saat order dikonfirmasi
// (pending → confirmed). Pembatalan dari status confirmed mengembalikan stok.

import (
	"crypto/rand"
	"errors"
	"fmt"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"
)

// StatusOrder yang dikenal panel & bot chat.
const (
	StatusPending   = "pending"
	StatusConfirmed = "confirmed"
	StatusShipped   = "shipped"
	StatusCompleted = "completed"
	StatusCancelled = "cancelled"
)

// ValidStatuses berisi semua status order yang sah.
var ValidStatuses = map[string]bool{
	StatusPending:   true,
	StatusConfirmed: true,
	StatusShipped:   true,
	StatusCompleted: true,
	StatusCancelled: true,
}

// allowedTransitions: dari status saat ini ke status tujuan yang diizinkan.
var allowedTransitions = map[string][]string{
	StatusPending:   {StatusConfirmed, StatusCancelled},
	StatusConfirmed: {StatusShipped, StatusCancelled},
	StatusShipped:   {StatusCompleted},
	StatusCompleted: {},
	StatusCancelled: {},
}

// CanTransition melaporkan apakah pindah status diizinkan.
func CanTransition(from, to string) bool {
	if from == to {
		return false
	}
	for _, next := range allowedTransitions[from] {
		if next == to {
			return true
		}
	}
	return false
}

// ErrInsufficientStock berarti stok produk tidak cukup untuk konfirmasi.
var ErrInsufficientStock = errors.New("stok tidak mencukupi")

// OrderLine adalah satu baris pesanan dari pemesan (produk + jumlah).
type OrderLine struct {
	ProductID uint
	Quantity  int
}

// GenerateOrderNumber membuat nomor order unik, mis. "ORD-20261111-143205-4821".
// Keunikan dijamin dengan cek ke DB (loop bila bentrok).
func GenerateOrderNumber(db *gorm.DB) string {
	for {
		var rnd [3]byte
		if _, err := rand.Read(rnd[:]); err != nil {
			// Fallback deterministik bila RNG gagal: nanos.
			n := time.Now().UnixNano()
			rnd[0] = byte(n & 0xff)
			rnd[1] = byte((n >> 8) & 0xff)
			rnd[2] = byte((n >> 16) & 0xff)
		}
		num := fmt.Sprintf("ORD-%s-%06d", time.Now().Format("20060102-150405"), (int(rnd[0])*65536+int(rnd[1])*256+int(rnd[2]))%1000000)
		var count int64
		db.Model(&models.BotOrder{}).Where("order_number = ?", num).Count(&count)
		if count == 0 {
			return num
		}
	}
}

// CreateOrder membuat order baru berstatus pending dari daftar baris.
// Produk harus aktif & milik user; harga di-snapshot dari katalog saat ini.
// Stok hanya diperiksa kecukupannya (tidak dikurangi di sini).
func CreateOrder(db *gorm.DB, userID uint, buyerPhone, buyerName, notes string, lines []OrderLine) (*models.BotOrder, error) {
	if len(lines) == 0 {
		return nil, errors.New("order kosong")
	}
	// Gabungkan baris produk yang sama.
	merged := map[uint]int{}
	var orderIDs []uint
	for _, ln := range lines {
		if ln.Quantity <= 0 {
			return nil, fmt.Errorf("jumlah produk %d tidak valid", ln.ProductID)
		}
		if _, ok := merged[ln.ProductID]; !ok {
			orderIDs = append(orderIDs, ln.ProductID)
		}
		merged[ln.ProductID] += ln.Quantity
	}
	var products []models.BotProduct
	if err := db.Where("id IN ? AND user_id = ? AND is_active = ?", orderIDs, userID, true).Find(&products).Error; err != nil {
		return nil, err
	}
	if len(products) != len(orderIDs) {
		return nil, errors.New("produk tidak ditemukan atau tidak aktif")
	}
	var order *models.BotOrder
	err := db.Transaction(func(tx *gorm.DB) error {
		items := make([]models.BotOrderItem, 0, len(products))
		var total int64
		var totalQty int
		for _, p := range products {
			qty := merged[p.ID]
			if p.Stock < qty {
				return fmt.Errorf("%w: %s (tersedia %d, diminta %d)", ErrInsufficientStock, p.Name, p.Stock, qty)
			}
			sub := p.Price * int64(qty)
			items = append(items, models.BotOrderItem{
				ProductID:   p.ID,
				ProductName: p.Name,
				Price:       p.Price,
				Quantity:    qty,
				Subtotal:    sub,
			})
			total += sub
			totalQty += qty
		}
		order = &models.BotOrder{
			UserID:      userID,
			OrderNumber: GenerateOrderNumber(tx),
			ProductID:   items[0].ProductID, // ringkasan item pertama (kompatibilitas lama)
			BuyerPhone:  buyerPhone,
			BuyerName:   buyerName,
			Quantity:    totalQty,
			Total:       total,
			Status:      StatusPending,
			Notes:       notes,
			Items:       items,
		}
		return tx.Create(order).Error
	})
	if err != nil {
		return nil, err
	}
	return order, nil
}

// TransitionOrder memindahkan order ke status baru dengan aturan transisi.
// - confirmed: kurangi stok (tolak bila stok kurang, order tetap pending).
// - cancelled dari confirmed: kembalikan stok yang sudah dikurangi.
func TransitionOrder(db *gorm.DB, userID uint, orderID uint, to string) (*models.BotOrder, error) {
	if !ValidStatuses[to] {
		return nil, fmt.Errorf("status %q tidak dikenal", to)
	}
	var order *models.BotOrder
	err := db.Transaction(func(tx *gorm.DB) error {
		var o models.BotOrder
		if err := tx.Preload("Items").Where("id = ? AND user_id = ?", orderID, userID).First(&o).Error; err != nil {
			return err
		}
		if !CanTransition(o.Status, to) {
			return fmt.Errorf("tidak bisa mengubah status dari %s ke %s", o.Status, to)
		}
		switch {
		case to == StatusConfirmed:
			if err := decrementStock(tx, &o); err != nil {
				return err
			}
		case to == StatusCancelled && o.Status == StatusConfirmed:
			if err := restoreStock(tx, &o); err != nil {
				return err
			}
		}
		if err := tx.Model(&o).Update("status", to).Error; err != nil {
			return err
		}
		o.Status = to
		order = &o
		return nil
	})
	if err != nil {
		return nil, err
	}
	return order, nil
}

// decrementStock mengurangi stok tiap item order (dengan row lock).
func decrementStock(tx *gorm.DB, o *models.BotOrder) error {
	for _, it := range o.Items {
		var p models.BotProduct
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND user_id = ?", it.ProductID, o.UserID).First(&p).Error; err != nil {
			return err
		}
		if p.Stock < it.Quantity {
			return fmt.Errorf("%w: %s (tersedia %d, diminta %d)", ErrInsufficientStock, p.Name, p.Stock, it.Quantity)
		}
		if err := tx.Model(&p).Update("stock", p.Stock-it.Quantity).Error; err != nil {
			return err
		}
	}
	return nil
}

// restoreStock mengembalikan stok tiap item order (pembatalan dari confirmed).
func restoreStock(tx *gorm.DB, o *models.BotOrder) error {
	for _, it := range o.Items {
		var p models.BotProduct
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ? AND user_id = ?", it.ProductID, o.UserID).First(&p).Error; err != nil {
			return err
		}
		if err := tx.Model(&p).Update("stock", p.Stock+it.Quantity).Error; err != nil {
			return err
		}
	}
	return nil
}
