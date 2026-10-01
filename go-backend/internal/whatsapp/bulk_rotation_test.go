package whatsapp

import (
	"errors"
	"testing"

	"github.com/Aldi1963/wagataway/internal/database/models"
)

func mkRecipients(phones ...string) []models.BulkJobRecipient {
	out := make([]models.BulkJobRecipient, len(phones))
	for i, p := range phones {
		out[i] = models.BulkJobRecipient{ID: uint(i + 1), Phone: p}
	}
	return out
}

func phonesOf(q []models.BulkJobRecipient) []string {
	out := make([]string, len(q))
	for i, r := range q {
		out[i] = r.Phone
	}
	return out
}

func equalStrings(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}

func TestDistributeBulkRecipients_RoundRobin(t *testing.T) {
	recips := mkRecipients("6281", "6282", "6283", "6284", "6285")
	queues := distributeBulkRecipients(recips, []uint{10, 20})

	if len(queues) != 2 {
		t.Fatalf("mau 2 antrean, dapat %d", len(queues))
	}
	// Round-robin: device 10 -> penerima ke-0,2,4 ; device 20 -> ke-1,3
	if got := phonesOf(queues[0]); !equalStrings(got, []string{"6281", "6283", "6285"}) {
		t.Errorf("antrean device 10 = %v, mau [6281 6283 6285]", got)
	}
	if got := phonesOf(queues[1]); !equalStrings(got, []string{"6282", "6284"}) {
		t.Errorf("antrean device 20 = %v, mau [6282 6284]", got)
	}
}

func TestDistributeBulkRecipients_SingleDevice(t *testing.T) {
	recips := mkRecipients("6281", "6282", "6283")
	queues := distributeBulkRecipients(recips, []uint{7})
	if len(queues) != 1 || len(queues[0]) != 3 {
		t.Fatalf("satu device harus dapat semua penerima, dapat %v", phonesOf(queues[0]))
	}
}

func TestDistributeBulkRecipients_TidakAdaYangHilang(t *testing.T) {
	// 17 penerima / 4 device: tidak boleh ada penerima yang hilang atau dobel.
	recips := mkRecipients("a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p", "q")
	queues := distributeBulkRecipients(recips, []uint{1, 2, 3, 4})
	total := 0
	seen := map[string]bool{}
	for _, q := range queues {
		total += len(q)
		for _, r := range q {
			if seen[r.Phone] {
				t.Errorf("penerima %s teralokasi dobel", r.Phone)
			}
			seen[r.Phone] = true
		}
	}
	if total != len(recips) {
		t.Errorf("total teralokasi = %d, mau %d", total, len(recips))
	}
	// Beban seimbang: selisih antar device maksimal 1.
	max, min := 0, len(recips)
	for _, q := range queues {
		if len(q) > max {
			max = len(q)
		}
		if len(q) < min {
			min = len(q)
		}
	}
	if max-min > 1 {
		t.Errorf("beban tidak seimbang: max=%d min=%d", max, min)
	}
}

func TestDistributeBulkRecipients_FailoverRedistribute(t *testing.T) {
	// Simulasi: device 20 mati di tengah jalan, sisa antreannya (6284, 6285)
	// dialokasikan ulang round-robin ke device yang masih hidup (10, 30).
	leftover := mkRecipients("6284", "6285")
	queues := distributeBulkRecipients(leftover, []uint{10, 30})

	total := len(queues[0]) + len(queues[1])
	if total != 2 {
		t.Fatalf("failover kehilangan penerima: total=%d", total)
	}
	if got := phonesOf(queues[0]); !equalStrings(got, []string{"6284"}) {
		t.Errorf("antrean device 10 = %v, mau [6284]", got)
	}
	if got := phonesOf(queues[1]); !equalStrings(got, []string{"6285"}) {
		t.Errorf("antrean device 30 = %v, mau [6285]", got)
	}
}

func TestIsDisconnectError(t *testing.T) {
	cases := []struct {
		name string
		err  error
		want bool
	}{
		{"session tidak terhubung", errors.New("device 1 tidak terhubung"), true},
		{"client belum init", errors.New("device 2 client not initialized"), true},
		{"nomor tidak valid", errors.New("nomor tidak valid: format salah"), false},
		{"gagal jaringan umum", errors.New("context deadline exceeded"), false},
		{"nil", nil, false},
	}
	for _, c := range cases {
		if got := isDisconnectError(c.err); got != c.want {
			t.Errorf("%s: isDisconnectError = %v, mau %v", c.name, got, c.want)
		}
	}
}
