package worker

import (
	"testing"
	"time"
)

func TestNextRun(t *testing.T) {
	loc, _ := time.LoadLocation("Asia/Jakarta")
	// Rabu 2026-09-30 19:50 WIB
	from := time.Date(2026, 9, 30, 19, 50, 0, 0, loc)
	f := "2006-01-02 15:04 Mon"

	dow3 := 3 // Rabu
	dow1 := 1 // Senin
	dom15 := 15

	cases := []struct {
		name     string
		freq     string
		timeStr  string
		dow      *int
		dom      *int
		expected string
	}{
		{"daily pagi sudah lewat", "daily", "09:00", nil, nil, "2026-10-01 09:00 Thu"},
		{"daily malam belum lewat", "daily", "20:00", nil, nil, "2026-09-30 20:00 Wed"},
		{"weekly senin depan", "weekly", "09:00", &dow1, nil, "2026-10-05 09:00 Mon"},
		{"weekly hari ini masih bisa", "weekly", "20:00", &dow3, nil, "2026-09-30 20:00 Wed"},
		{"weekly hari ini sudah lewat", "weekly", "19:00", &dow3, nil, "2026-10-07 19:00 Wed"},
		{"monthly tgl 15", "monthly", "09:00", nil, &dom15, "2026-10-15 09:00 Thu"},
	}

	for _, c := range cases {
		got := nextRun(c.freq, c.timeStr, c.dow, c.dom, from)
		if got.Format(f) != c.expected {
			t.Errorf("%s: got %s, want %s", c.name, got.Format(f), c.expected)
		} else {
			t.Logf("%s: OK -> %s", c.name, got.Format(f))
		}
	}
}
