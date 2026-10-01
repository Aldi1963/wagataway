package rls

import (
	"fmt"

	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// userScopedTables are tables carrying a user_id column. Each gets an RLS
// policy restricting rows to the requesting app user.
var userScopedTables = []string{
	"affiliates", "ai_reply_configs", "api_keys", "auto_replies",
	"blacklists", "bot_orders", "bot_products", "bulk_jobs",
	"canned_responses", "chat_assignments", "chat_conversations",
	"chat_inboxes", "chat_labels", "contact_groups", "contacts",
	"cs_bots", "devices", "drip_campaigns", "files", "followups",
	"group_rules", "integrations", "login_histories", "menu_bot_sessions", "menu_bots",
	"message_reports", "message_templates", "messages", "notifications",
	"password_reset_tokens", "polls", "recurring_schedules",
	"scheduled_messages", "sessions", "short_links", "subscriptions", "transactions",
	"voucher_redemptions", "wa_otp_codes", "wallet_transactions",
	"webhook_delivery_logs", "webhooks", "welcome_dm_sents",
}

// childScopedTables maps a table without user_id to its parent table and
// the FK column pointing at the parent (which has user_id).
var childScopedTables = []struct {
	table  string
	parent string
	fk     string
}{
	{"bulk_job_recipients", "bulk_jobs", "bulk_job_id"},
	{"contact_group_members", "contact_groups", "group_id"},
	{"drip_enrollments", "drip_campaigns", "campaign_id"},
	{"drip_steps", "drip_campaigns", "campaign_id"},
	{"poll_votes", "polls", "poll_id"},
	{"menu_bot_items", "menu_bots", "menu_bot_id"},
	{"cs_bot_faqs", "cs_bots", "bot_id"},
	{"cs_bot_knowledges", "cs_bots", "bot_id"},
	{"integration_logs", "integrations", "integration_id"},
	{"webhook_deliveries", "webhooks", "webhook_id"},
	{"affiliate_earnings", "affiliates", "affiliate_id"},
}

// rlsServiceBypass is true when app.current_user_id is unset OR empty:
// public endpoints, background jobs and admin tools keep working unchanged.
// (RESET leaves an empty string, not NULL, so both must bypass.)
const rlsServiceBypass = "NULLIF(current_setting('app.current_user_id', true), '') IS NULL"

// rlsUserMatch compares a user_id column against the current app user.
const rlsUserMatch = "NULLIF(current_setting('app.current_user_id', true), '')::bigint"

// ApplyRLS enables (and forces) Row Level Security on user-scoped tables
// and installs isolation policies. It is idempotent and safe to run on
// every startup.
//
// NOTE: FORCE ROW LEVEL SECURITY is required because the application
// connects as the table owner, which would otherwise bypass RLS entirely.
func ApplyRLS(db *gorm.DB) error {
	return applyRLSTables(db, userScopedTables)
}

// ApplyRLSTables menerapkan RLS hanya pada tabel yang disebut — dipakai test
// yang tidak memigrasi seluruh skema produksi.
func ApplyRLSTables(db *gorm.DB, tables []string) error {
	exec := func(sql string) error {
		if err := db.Exec(sql).Error; err != nil {
			return fmt.Errorf("rls: %w (sql: %.80s)", err, sql)
		}
		return nil
	}
	for _, tbl := range tables {
		if err := exec(fmt.Sprintf("ALTER TABLE %s ENABLE ROW LEVEL SECURITY", tbl)); err != nil {
			return err
		}
		if err := exec(fmt.Sprintf("ALTER TABLE %s FORCE ROW LEVEL SECURITY", tbl)); err != nil {
			return err
		}
		if err := exec(fmt.Sprintf("DROP POLICY IF EXISTS %s_rls ON %s", tbl, tbl)); err != nil {
			return err
		}
		policy := fmt.Sprintf(`CREATE POLICY %s_rls ON %s FOR ALL USING (%s OR user_id = %s)`,
			tbl, tbl, rlsServiceBypass, rlsUserMatch)
		if err := exec(policy); err != nil {
			return err
		}
	}
	return nil
}

func applyRLSTables(db *gorm.DB, tables []string) error {
	if err := ApplyRLSTables(db, tables); err != nil {
		return err
	}
	exec := func(sql string) error {
		if err := db.Exec(sql).Error; err != nil {
			return fmt.Errorf("rls: %w (sql: %.80s)", err, sql)
		}
		return nil
	}

	// 2. users table: a user may only touch their own row.
	for _, stmt := range []string{
		"ALTER TABLE users ENABLE ROW LEVEL SECURITY",
		"ALTER TABLE users FORCE ROW LEVEL SECURITY",
		"DROP POLICY IF EXISTS users_rls ON users",
		fmt.Sprintf(`CREATE POLICY users_rls ON users FOR ALL USING (%s OR id = %s)`,
			rlsServiceBypass, rlsUserMatch),
	} {
		if err := exec(stmt); err != nil {
			return err
		}
	}

	// 3. Child tables scoped through their parent.
	for _, c := range childScopedTables {
		for _, stmt := range []string{
			fmt.Sprintf("ALTER TABLE %s ENABLE ROW LEVEL SECURITY", c.table),
			fmt.Sprintf("ALTER TABLE %s FORCE ROW LEVEL SECURITY", c.table),
			fmt.Sprintf("DROP POLICY IF EXISTS %s_rls ON %s", c.table, c.table),
			fmt.Sprintf(`CREATE POLICY %s_rls ON %s FOR ALL USING (%s OR EXISTS (
				SELECT 1 FROM %s p WHERE p.id = %s.%s AND p.user_id = %s))`,
				c.table, c.table, rlsServiceBypass, c.parent, c.table, c.fk, rlsUserMatch),
		} {
			if err := exec(stmt); err != nil {
				return err
			}
		}
	}

	log.Info().Msg("RLS policies applied (forced) on user-scoped tables")
	return nil
}
