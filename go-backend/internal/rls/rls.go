// Package rls implements PostgreSQL Row Level Security plumbing as a
// second layer of defense behind the application-level user_id filters.
//
// Usage:
//
//	rls.Register(db) // once at startup, after database.Connect
//
//	// in each authenticated handler:
//	userID := middleware.GetUserID(c)
//	db = rls.Scoped(db, userID)
//
// Scoped tags the *gorm.DB so the registered callbacks run
// "SET app.current_user_id = '<id>'" on the same pooled connection before
// the query and "RESET app.current_user_id" right after. The RLS policies
// (see database.ApplyRLS) then restrict rows to that user.
//
// Requests that never call Scoped (public endpoints, background jobs,
// admin tools using the raw db) leave the setting unset; the policies treat
// an unset value as "service access" and allow the query, so existing flows
// keep working exactly as before.
package rls

import (
	"fmt"

	"gorm.io/gorm"
)

// settingsKey is the GORM Settings key carrying the app user id.
const settingsKey = "rls:user_id"

// Scoped returns a session of db tagged with userID for RLS enforcement.
// A zero userID returns db unchanged.
func Scoped(db *gorm.DB, userID uint) *gorm.DB {
	if db == nil || userID == 0 {
		return db
	}
	return db.Set(settingsKey, userID)
}

// Register installs the SET/RESET callbacks for all GORM processors.
// It is safe to call once; repeated calls replace the previous callbacks.
func Register(db *gorm.DB) {
	set := func(db *gorm.DB) {
		uid, ok := db.Get(settingsKey)
		if !ok || db.Statement == nil || db.Statement.ConnPool == nil {
			return
		}
		ctx := db.Statement.Context
		// Self-healing: reset first so a stale value from a skipped After
		// (e.g. after a panic) can never leak into this query.
		_, _ = db.Statement.ConnPool.ExecContext(ctx, "RESET app.current_user_id")
		_, _ = db.Statement.ConnPool.ExecContext(ctx, fmt.Sprintf("SET app.current_user_id = '%d'", uid.(uint)))
	}
	reset := func(db *gorm.DB) {
		if _, ok := db.Get(settingsKey); !ok {
			return
		}
		if db.Statement == nil || db.Statement.ConnPool == nil {
			return
		}
		_, _ = db.Statement.ConnPool.ExecContext(db.Statement.Context, "RESET app.current_user_id")
	}

	cb := db.Callback()
	cb.Query().Before("gorm:query").Register("rls:set_user", set)
	cb.Query().After("gorm:query").Register("rls:reset_user", reset)
	cb.Create().Before("gorm:create").Register("rls:set_user", set)
	cb.Create().After("gorm:create").Register("rls:reset_user", reset)
	cb.Update().Before("gorm:update").Register("rls:set_user", set)
	cb.Update().After("gorm:update").Register("rls:reset_user", reset)
	cb.Delete().Before("gorm:delete").Register("rls:set_user", set)
	cb.Delete().After("gorm:delete").Register("rls:reset_user", reset)
	cb.Row().Before("gorm:row").Register("rls:set_user", set)
	cb.Row().After("gorm:row").Register("rls:reset_user", reset)
}
