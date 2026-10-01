package whatsapp

// Helper murni untuk rotasi pengirim blast (round-robin) dan failover antar device.
// Dipisah dari manager.go agar bisa di-unit-test tanpa DB maupun koneksi WA.

import (
	"strings"

	"github.com/Aldi1963/wagataway/internal/database/models"
)

// distributeBulkRecipients membagi penerima secara round-robin ke device-device.
// Mengembalikan satu antrian per device, urutannya sama dengan deviceIDs
// (device pertama mendapat penerima 0, n, 2n, ...). Total penerima yang
// dialokasikan selalu sama dengan len(recipients) — tidak ada yang hilang.
func distributeBulkRecipients(recipients []models.BulkJobRecipient, deviceIDs []uint) [][]models.BulkJobRecipient {
	if len(deviceIDs) == 0 {
		return [][]models.BulkJobRecipient{recipients}
	}
	queues := make([][]models.BulkJobRecipient, len(deviceIDs))
	for i, r := range recipients {
		idx := i % len(deviceIDs)
		queues[idx] = append(queues[idx], r)
	}
	return queues
}

// isDisconnectError melaporkan apakah error pengiriman menandakan device
// tidak terhubung (pemicu failover: antrean dialihkan ke device lain).
func isDisconnectError(err error) bool {
	if err == nil {
		return false
	}
	s := err.Error()
	return strings.Contains(s, "tidak terhubung") || strings.Contains(s, "not initialized")
}
