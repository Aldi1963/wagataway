// Package rls implements PostgreSQL Row Level Security plumbing as a
// second layer of defense behind the application-level user_id filters.
//
// Usage:
//
//	import _ "github.com/Aldi1963/wagataway/internal/rls" // registers the pgx-rls driver
//
//	db, err := gorm.Open(postgres.New(postgres.Config{
//		DriverName: rls.DriverName, // "pgx-rls"
//		DSN:        dsn,
//	}), ...)
//
//	rls.Register(db) // once at startup; fails closed if the driver is wrong
//
//	// in each authenticated handler:
//	userID := middleware.GetUserID(c)
//	udb := rls.Scoped(db, userID)
//
// How it works: the "pgx-rls" driver wraps pgx's stdlib driver. Every
// Query/Exec on a physical connection first runs
// "SET app.current_user_id = '<id>'" (scoped sessions) or
// "RESET app.current_user_id" (everything else) on THAT SAME connection,
// immediately before the statement. The RLS policies (see
// database.ApplyRLS) then restrict rows to that user.
//
// Why at the driver layer? A GORM Before/After callback's ExecContext and
// the query's QueryContext each check out an ARBITRARY pooled connection,
// so under concurrent load the SET can land on a different connection
// than the query — leaking rows across users. Pinning a dedicated
// *sql.Conn per operation fixes the race but cannot release the
// connection when GORM closes *sql.Rows (no close hook exists), leaking
// connections until the pool deadlocks. At the driver layer the
// driver.Conn IS the physical connection: database/sql guarantees
// exclusive use while checked out, so SET + statement are atomic per
// connection with zero extra connections and no lifetime hacks.
//
// Sessions that never call Scoped (public endpoints, background jobs,
// admin tools using the raw db) get a RESET instead, so a stale setting
// from an earlier scoped operation can never leak into them. A stale GUC
// left on a pooled connection is harmless: every operation
// re-establishes it before its first statement.
package rls

import (
	"context"
	"database/sql"
	"database/sql/driver"
	"errors"
	"strconv"

	pgxstdlib "github.com/jackc/pgx/v5/stdlib"
	"gorm.io/gorm"
)

// DriverName is the database/sql driver name registered by this package.
// Open the database with it (see package doc); anything else leaves RLS
// silently unenforced, which Register refuses.
const DriverName = "pgx-rls"

func init() {
	sql.Register(DriverName, &rlsDriver{parent: pgxstdlib.GetDefaultDriver()})
}

// ctxKey carries the app user id inside the session context.
type ctxKey struct{}

// Scoped returns a session of db tagged with userID for RLS enforcement.
// A zero userID returns db unchanged.
//
// The tag lives in the session's context, so the returned session is safe
// to REUSE for multiple operations and safe for concurrent use by many
// goroutines as different users: the driver reads the tag from the
// per-operation context and applies it to the exact physical connection
// running that statement.
func Scoped(db *gorm.DB, userID uint) *gorm.DB {
	if db == nil || userID == 0 || db.Statement == nil {
		return db
	}
	ctx := db.Statement.Context
	if ctx == nil {
		ctx = context.Background()
	}
	// WithContext clones the statement, so the shared base statement that
	// Session() hands us is never mutated.
	return db.Session(&gorm.Session{}).WithContext(context.WithValue(ctx, ctxKey{}, userID))
}

// userIDFromCtx extracts the RLS user id planted by Scoped.
func userIDFromCtx(ctx context.Context) (uint, bool) {
	if ctx == nil {
		return 0, false
	}
	uid, ok := ctx.Value(ctxKey{}).(uint)
	if !ok || uid == 0 {
		return 0, false
	}
	return uid, true
}

func setSQL(uid uint) string {
	return "SET app.current_user_id = '" + strconv.FormatUint(uint64(uid), 10) + "'"
}

func setLocalSQL(uid uint) string {
	return "SET LOCAL app.current_user_id = '" + strconv.FormatUint(uint64(uid), 10) + "'"
}

const resetSQL = "RESET app.current_user_id"

// Register fails closed: it verifies db was opened with the pgx-rls
// driver. Without it, Scoped tags would be silently ignored and RLS
// unenforced. Call once at startup, after database.Connect.
func Register(db *gorm.DB) {
	sqlDB, err := db.DB()
	if err != nil || sqlDB == nil {
		return
	}
	if _, ok := sqlDB.Driver().(*rlsDriver); !ok {
		panic("rls: database was not opened with the pgx-rls driver; RLS would be silently disabled")
	}
}

// rlsDriver wraps pgx's stdlib driver, tagging every connection.
type rlsDriver struct {
	parent driver.Driver
}

func (d *rlsDriver) Open(name string) (driver.Conn, error) {
	c, err := d.parent.Open(name)
	if err != nil {
		return nil, err
	}
	return &rlsConn{parent: c}, nil
}

func (d *rlsDriver) OpenConnector(name string) (driver.Connector, error) {
	dc, ok := d.parent.(driver.DriverContext)
	if !ok {
		return nil, errors.New("rls: parent driver does not implement DriverContext")
	}
	pc, err := dc.OpenConnector(name)
	if err != nil {
		return nil, err
	}
	return &rlsConnector{parent: pc, drv: d}, nil
}

type rlsConnector struct {
	parent driver.Connector
	drv    *rlsDriver
}

func (c *rlsConnector) Connect(ctx context.Context) (driver.Conn, error) {
	pc, err := c.parent.Connect(ctx)
	if err != nil {
		return nil, err
	}
	return &rlsConn{parent: pc}, nil
}

func (c *rlsConnector) Driver() driver.Driver { return c.drv }

// rlsConn wraps one physical connection. Every query/exec establishes the
// GUC on this exact connection immediately before the statement.
type rlsConn struct {
	parent driver.Conn
}

// applyGUC runs SET (scoped) or RESET (unscoped) on this connection.
func (c *rlsConn) applyGUC(ctx context.Context) error {
	q := resetSQL
	if uid, ok := userIDFromCtx(ctx); ok {
		q = setSQL(uid)
	}
	ec, ok := c.parent.(driver.ExecerContext)
	if !ok {
		return errors.New("rls: underlying conn does not implement ExecerContext")
	}
	_, err := ec.ExecContext(ctx, q, nil)
	return err
}

func (c *rlsConn) Prepare(query string) (driver.Stmt, error) {
	return c.parent.Prepare(query)
}

func (c *rlsConn) Close() error { return c.parent.Close() }

func (c *rlsConn) Begin() (driver.Tx, error) {
	return c.BeginTx(context.Background(), driver.TxOptions{})
}

// BeginTx pins a single connection for the transaction, so SET LOCAL
// applies to the whole transaction and vanishes automatically on
// commit/rollback — no stale state possible.
func (c *rlsConn) BeginTx(ctx context.Context, opts driver.TxOptions) (driver.Tx, error) {
	var (
		tx  driver.Tx
		err error
	)
	if bt, ok := c.parent.(driver.ConnBeginTx); ok {
		tx, err = bt.BeginTx(ctx, opts)
	} else {
		tx, err = c.parent.Begin()
	}
	if err != nil {
		return nil, err
	}
	q := resetSQL
	if uid, ok := userIDFromCtx(ctx); ok {
		q = setLocalSQL(uid)
	}
	if ec, ok := c.parent.(driver.ExecerContext); ok {
		if _, err := ec.ExecContext(ctx, q, nil); err != nil {
			_ = tx.Rollback()
			return nil, err
		}
	}
	return tx, nil
}

func (c *rlsConn) QueryContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Rows, error) {
	if err := c.applyGUC(ctx); err != nil {
		return nil, err
	}
	qer, ok := c.parent.(driver.QueryerContext)
	if !ok {
		return nil, driver.ErrSkip
	}
	return qer.QueryContext(ctx, query, args)
}

func (c *rlsConn) ExecContext(ctx context.Context, query string, args []driver.NamedValue) (driver.Result, error) {
	if err := c.applyGUC(ctx); err != nil {
		return nil, err
	}
	ex, ok := c.parent.(driver.ExecerContext)
	if !ok {
		return nil, driver.ErrSkip
	}
	return ex.ExecContext(ctx, query, args)
}

func (c *rlsConn) CheckNamedValue(nv *driver.NamedValue) error {
	if nvc, ok := c.parent.(driver.NamedValueChecker); ok {
		return nvc.CheckNamedValue(nv)
	}
	return driver.ErrSkip
}
