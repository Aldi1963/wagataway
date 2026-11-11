package handler

import (
	"encoding/json"
	"testing"

	"github.com/Aldi1963/wagataway/internal/database"
)

// TestAutoMigrateCreatesSheetsWebhookTables: AutoMigrate penuh harus membuat
// keempat tabel baru Item 8 di database test (wagataway_test, bukan live).
func TestAutoMigrateCreatesSheetsWebhookTables(t *testing.T) {
	db := auditTestDB(t)
	if err := database.AutoMigrate(db); err != nil {
		t.Fatalf("AutoMigrate: %v", err)
	}
	for _, tbl := range []string{"sheets_connections", "sheets_syncs", "inbound_webhooks", "inbound_webhook_logs"} {
		if !db.Migrator().HasTable(tbl) {
			t.Errorf("tabel %s tidak dibuat oleh AutoMigrate", tbl)
		}
	}
	// Idempoten: jalankan kedua kali, tetap sukses.
	if err := database.AutoMigrate(db); err != nil {
		t.Fatalf("AutoMigrate kedua: %v", err)
	}
}

func TestNormalizeEvents(t *testing.T) {
	cases := []struct {
		in   string
		want string
		bad  bool
	}{
		{`["message.received","subscription.activated"]`, `["message.received","subscription.activated"]`, false},
		{`"message.sent"`, `["message.sent"]`, false},
		{``, ``, false},
		{`null`, ``, false},
		{`[]`, ``, false},
		{`["order.created"]`, `["order.created"]`, false},
		{`["event.tidak.ada"]`, ``, true},
		{`["message.received", 1]`, ``, true},
		{`not-json`, ``, true},
	}
	for _, tc := range cases {
		got, err := normalizeEvents(json.RawMessage(tc.in))
		if tc.bad {
			if err == nil {
				t.Errorf("normalizeEvents(%q) harus error", tc.in)
			}
			continue
		}
		if err != nil {
			t.Errorf("normalizeEvents(%q): %v", tc.in, err)
			continue
		}
		if got != tc.want {
			t.Errorf("normalizeEvents(%q) = %q, mau %q", tc.in, got, tc.want)
		}
	}
}

func TestSupportedWebhookEventsContainRequired(t *testing.T) {
	for _, e := range []string{"message.received", "message.sent", "message.failed", "order.created", "subscription.activated"} {
		if !isSupportedWebhookEvent(e) {
			t.Errorf("event %q harus didukung", e)
		}
	}
	if isSupportedWebhookEvent("event.asing") {
		t.Error("event asing tidak boleh didukung")
	}
}
