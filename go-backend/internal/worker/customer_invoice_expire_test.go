package worker

import (
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
)

// Kedaluwarsa otomatis tagihan pelanggan (Item 3): hanya invoice pending
// yang jatuh temponya lewat yang dibalik ke expired.
func TestExpireOverdueCustomerInvoices(t *testing.T) {
	db := schedulerTestDB(t)
	if err := db.AutoMigrate(&models.User{}, &models.CustomerInvoice{}); err != nil {
		t.Fatalf("migrate: %v", err)
	}
	uid := uint(95001)
	db.Where("id = ?", uid).FirstOrCreate(&models.User{
		ID: uid, UUID: "00000000-0000-0000-0000-000000095001",
		Name: "Expire", Email: "expire@test.local", Password: "x",
	})
	mk := func(status string, due time.Time) models.CustomerInvoice {
		inv := models.CustomerInvoice{
			UserID: uid, CustomerName: "C", CustomerPhone: "6281",
			Items: `[{"description":"A","qty":1,"price":1000}]`, Amount: 1000,
			Status: status, ExternalID: "WAG-INV-95001-" + status + "-" + due.Format("150405"),
			DueDate: &due,
		}
		if err := db.Create(&inv).Error; err != nil {
			t.Fatalf("seed invoice: %v", err)
		}
		return inv
	}
	overdue := mk("pending", time.Now().Add(-time.Hour))
	okInv := mk("pending", time.Now().Add(24*time.Hour))
	paidInv := mk("paid", time.Now().Add(-time.Hour))

	n, err := expireOverdueCustomerInvoices(db, time.Now())
	if err != nil {
		t.Fatalf("expire: %v", err)
	}
	if n != 1 {
		t.Errorf("expired = %d, mau 1", n)
	}
	var got models.CustomerInvoice
	db.First(&got, overdue.ID)
	if got.Status != "expired" {
		t.Errorf("lewat jatuh tempo = %q, mau expired", got.Status)
	}
	got = models.CustomerInvoice{}
	db.First(&got, okInv.ID)
	if got.Status != "pending" {
		t.Errorf("belum jatuh tempo = %q, mau pending", got.Status)
	}
	got = models.CustomerInvoice{}
	db.First(&got, paidInv.ID)
	if got.Status != "paid" {
		t.Errorf("lunas = %q, mau paid", got.Status)
	}
}
