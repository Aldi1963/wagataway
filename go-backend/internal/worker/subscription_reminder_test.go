package worker

import (
	"strings"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
)

func TestReminderKind(t *testing.T) {
	now := time.Now()
	cases := []struct {
		name     string
		endDate  time.Time
		wantKind string
		wantDays int
	}{
		{"sudah lewat", now.Add(-time.Hour), "", 0},
		{"tepat sekarang", now, "", 0},
		{"12 jam lagi -> h1", now.Add(12 * time.Hour), "h1", 1},
		{"24 jam lagi -> h1", now.Add(24 * time.Hour), "h1", 1},
		{"25 jam lagi -> h3", now.Add(25 * time.Hour), "h3", 2},
		{"50 jam lagi -> h3 (3 hari)", now.Add(50 * time.Hour), "h3", 3},
		{"72 jam lagi -> h3", now.Add(72 * time.Hour), "h3", 3},
		{"73 jam lagi -> tidak", now.Add(73 * time.Hour), "", 0},
		{"10 hari lagi -> tidak", now.Add(240 * time.Hour), "", 0},
	}
	for _, c := range cases {
		kind, days := reminderKind(c.endDate, now)
		if kind != c.wantKind || days != c.wantDays {
			t.Errorf("%s: dapat (%q,%d), mau (%q,%d)", c.name, kind, days, c.wantKind, c.wantDays)
		}
	}
}

func TestBuildReminderMessage(t *testing.T) {
	end := time.Date(2026, 10, 4, 10, 0, 0, 0, time.UTC)
	msg := buildReminderMessage("Lite", end, 3)
	if !strings.Contains(msg, "Paket Lite") {
		t.Errorf("pesan harus menyebut nama paket, dapat: %q", msg)
	}
	if !strings.Contains(msg, "4 Okt 2026") {
		t.Errorf("pesan harus memakai format tanggal id-ID, dapat: %q", msg)
	}
	if !strings.Contains(msg, "3 hari lagi") {
		t.Errorf("pesan harus menyebut sisa hari, dapat: %q", msg)
	}
	if !strings.Contains(msg, "https://wa.clipku.com/billing") {
		t.Errorf("pesan harus memuat link perpanjang, dapat: %q", msg)
	}

	msg1 := buildReminderMessage("Pro", end, 1)
	if !strings.Contains(msg1, "1 hari lagi") {
		t.Errorf("H-1 harus berbunyi '1 hari lagi', dapat: %q", msg1)
	}
}

func TestReminderAlreadySent(t *testing.T) {
	now := time.Now()
	sub := &models.Subscription{}
	if reminderAlreadySent(sub, "h3") || reminderAlreadySent(sub, "h1") {
		t.Error("subscription baru harus belum dianggap terkirim")
	}
	sub.RemindedH3At = &now
	if !reminderAlreadySent(sub, "h3") {
		t.Error("h3 yang sudah dikirim harus terdeteksi")
	}
	if reminderAlreadySent(sub, "h1") {
		t.Error("h1 belum dikirim — tidak boleh terdeteksi sebagai terkirim")
	}
	sub.RemindedH1At = &now
	if !reminderAlreadySent(sub, "h1") {
		t.Error("h1 yang sudah dikirim harus terdeteksi")
	}
}

func TestFormatTanggalID(t *testing.T) {
	// 2026-10-04 10:00 UTC = 17:00 WIB, tetap 4 Okt
	got := formatTanggalID(time.Date(2026, 10, 4, 10, 0, 0, 0, time.UTC))
	if got != "4 Okt 2026" {
		t.Errorf("dapat %q, mau %q", got, "4 Okt 2026")
	}
}
