// Analitik lanjutan (item 6): rasio baca → balas → beli, performa per
// device, performa kampanye (blast/BulkJob), dan waktu respons CS —
// semuanya dihitung dari tabel yang sudah ada, tanpa model/migrasi baru.
//
// Atribusi (didokumentasikan di UI juga):
//   - Baca: pesan keluar (messages, direction=outgoing) berstatus read.
//   - Balas: ada pesan masuk (chat_inboxes, direction=in) dari nomor yang
//     sama SETELAH pesan keluar dikirim, dalam periode yang sama.
//   - Beli: ada BotOrder dari nomor yang sama SETELAH pesan keluar dikirim,
//     dalam periode yang sama. Ini atribusi berbasis nomor+urutan waktu,
//     bukan pelacakan klik — order yang dibuat tanpa pesan sebelumnya
//     tidak dihitung.
//   - Waktu respons CS diukur per percakapan (pesan masuk pertama →
//     balasan keluar pertama), BUKAN per anggota tim: ChatConversation
//     tidak menyimpan penugas (assignee) dan pesan keluar tidak menyimpan
//     penulis, jadi FRT per agen tidak bisa diturunkan dari data yang ada.
//     Endpoint /chat/team-stats yang disebut di spek item ini belum ada.
//   - Waktu resolusi adalah aproksimasi: percakapan berstatus done,
//     last_activity - created_at (tidak ada kolom resolved_at).
package handler

import (
	"database/sql"
	"encoding/csv"
	"fmt"
	"net/http"
	"sort"
	"strconv"
	"time"

	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ── Filter periode ────────────────────────────────────────────────────────────

type analyticsFilter struct {
	from      time.Time
	to        time.Time
	days      int
	deviceID  uint
	bulkJobID uint
}

// parseAnalyticsFilter membaca ?days=7|30|90 (default 30) atau ?from & ?to
// (YYYY-MM-DD). `to` bersifat eksklusif (akhir hari + 1).
func parseAnalyticsFilter(c *gin.Context) analyticsFilter {
	f := analyticsFilter{days: 30}
	if q := c.Query("days"); q != "" {
		if d, err := strconv.Atoi(q); err == nil && (d == 7 || d == 30 || d == 90) {
			f.days = d
		}
	}
	now := time.Now()
	f.to = time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location()).Add(24 * time.Hour)
	f.from = f.to.AddDate(0, 0, -f.days)
	if fromStr, toStr := c.Query("from"), c.Query("to"); fromStr != "" && toStr != "" {
		if from, err1 := time.ParseInLocation("2006-01-02", fromStr, now.Location()); err1 == nil {
			if to, err2 := time.ParseInLocation("2006-01-02", toStr, now.Location()); err2 == nil && to.After(from) {
				f.from = from
				f.to = to.Add(24 * time.Hour)
				f.days = int(to.Sub(from).Hours()/24) + 1
			}
		}
	}
	if q := c.Query("deviceId"); q != "" {
		if id, err := strconv.ParseUint(q, 10, 32); err == nil {
			f.deviceID = uint(id)
		}
	}
	if q := c.Query("bulkJobId"); q != "" {
		if id, err := strconv.ParseUint(q, 10, 32); err == nil {
			f.bulkJobID = uint(id)
		}
	}
	return f
}

func (f analyticsFilter) deviceClause() (string, []any) {
	if f.deviceID == 0 {
		return "", nil
	}
	return " AND device_id = ?", []any{f.deviceID}
}

// msgScope membatasi pesan keluar pada periode + filter device/kampanye.
// Dipakai di dalam subquery EXISTS (alias tabel: m).
func (f analyticsFilter) msgScope(alias string) (string, []any) {
	q := alias + `.direction = 'outgoing' AND ` + alias + `.created_at >= ? AND ` + alias + `.created_at < ?`
	args := []any{f.from, f.to}
	if f.deviceID != 0 {
		q += ` AND ` + alias + `.device_id = ?`
		args = append(args, f.deviceID)
	}
	if f.bulkJobID != 0 {
		q += ` AND ` + alias + `.bulk_job_id = ?`
		args = append(args, f.bulkJobID)
	}
	return q, args
}

func pct(num, denom int64) float64 {
	if denom == 0 {
		return 0
	}
	return float64(num) / float64(denom) * 100
}

func medianSeconds(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	s := append([]float64(nil), vals...)
	sort.Float64s(s)
	mid := len(s) / 2
	if len(s)%2 == 1 {
		return s[mid]
	}
	return (s[mid-1] + s[mid]) / 2
}

func avgSeconds(vals []float64) float64 {
	if len(vals) == 0 {
		return 0
	}
	var sum float64
	for _, v := range vals {
		sum += v
	}
	return sum / float64(len(vals))
}

// ── Funnel baca → balas → beli ────────────────────────────────────────────────

type funnelResult struct {
	Sent      int64   `json:"sent"`
	Delivered int64   `json:"delivered"`
	Read      int64   `json:"read"`
	Failed    int64   `json:"failed"`
	ReadRate  float64 `json:"readRate"`
	Replied   int64   `json:"replied"`
	ReplyRate float64 `json:"replyRate"`
	Buyers    int64   `json:"buyers"`
	Orders    int64   `json:"orders"`
	Revenue   int64   `json:"revenue"`
	BuyRate   float64 `json:"buyRate"`
	From      string  `json:"from"`
	To        string  `json:"to"`
	DeviceID  uint    `json:"deviceId"`
	BulkJobID uint    `json:"bulkJobId"`
}

func computeFunnel(udb *gorm.DB, userID uint, f analyticsFilter) (funnelResult, error) {
	out := funnelResult{
		From: f.from.Format("2006-01-02"), To: f.to.Add(-24 * time.Hour).Format("2006-01-02"),
		DeviceID: f.deviceID, BulkJobID: f.bulkJobID,
	}
	msgQ, msgArgs := f.msgScope("m")

	// Pesan keluar per status.
	type statusCount struct {
		Status string
		Count  int64
	}
	var rows []statusCount
	args := append([]any{userID}, msgArgs...)
	if err := udb.Raw(`SELECT m.status, COUNT(*) AS count FROM messages m
		WHERE m.user_id = ? AND `+msgQ+` GROUP BY m.status`, args...).Scan(&rows).Error; err != nil {
		return out, err
	}
	for _, r := range rows {
		switch r.Status {
		case "sent", "delivered", "read":
			out.Sent += r.Count
			if r.Status == "delivered" {
				out.Delivered += r.Count
			}
			if r.Status == "read" {
				out.Read += r.Count
			}
		case "failed":
			out.Failed += r.Count
		}
	}
	out.ReadRate = pct(out.Read, out.Sent)

	// Balas: nomor dengan pesan masuk setelah pesan keluar (dalam periode).
	replyQ, replyArgs := f.msgScope("m")
	devClause, devArgs := f.deviceClause()
	// Urutan placeholder SQL: user, from, to, [device], lalu msgScope.
	replyArgs = append(append([]any{userID, f.from, f.to}, devArgs...), replyArgs...)
	var replied int64
	if err := udb.Raw(`SELECT COUNT(DISTINCT ci.phone) FROM chat_inboxes ci
		WHERE ci.user_id = ? AND ci.direction = 'in' AND ci.created_at >= ? AND ci.created_at < ?`+devClause+`
		AND EXISTS (SELECT 1 FROM messages m WHERE m.user_id = ci.user_id AND m."to" = ci.phone AND m.created_at <= ci.created_at AND `+replyQ+`)`,
		replyArgs...).Scan(&replied).Error; err != nil {
		return out, err
	}
	out.Replied = replied
	out.ReplyRate = pct(out.Replied, out.Sent)

	// Beli: order dari nomor yang menerima pesan keluar sebelumnya.
	orderQ, orderArgs := f.msgScope("m")
	orderArgs = append([]any{userID, f.from, f.to}, orderArgs...)
	var buy struct {
		Buyers  int64
		Orders  int64
		Revenue int64
	}
	if err := udb.Raw(`SELECT COUNT(DISTINCT o.buyer_phone) AS buyers, COUNT(*) AS orders,
		COALESCE(SUM(o.total), 0) AS revenue FROM bot_orders o
		WHERE o.user_id = ? AND o.created_at >= ? AND o.created_at < ?
		AND (o.status IS NULL OR o.status <> 'cancelled')
		AND EXISTS (SELECT 1 FROM messages m WHERE m.user_id = o.user_id AND m."to" = o.buyer_phone AND m.created_at <= o.created_at AND `+orderQ+`)`,
		orderArgs...).Scan(&buy).Error; err != nil {
		return out, err
	}
	out.Buyers, out.Orders, out.Revenue = buy.Buyers, buy.Orders, buy.Revenue
	out.BuyRate = pct(out.Buyers, out.Sent)
	return out, nil
}

func analyticsFunnel(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		out, err := computeFunnel(udb, userID, parseAnalyticsFilter(c))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menghitung funnel"})
			return
		}
		c.JSON(http.StatusOK, out)
	}
}

// ── Performa per device ───────────────────────────────────────────────────────

type devicePerf struct {
	DeviceID   uint    `json:"deviceId"`
	Name       string  `json:"name"`
	Phone      string  `json:"phone"`
	Status     string  `json:"status"`
	Sent       int64   `json:"sent"`
	Delivered  int64   `json:"delivered"`
	Read       int64   `json:"read"`
	Failed     int64   `json:"failed"`
	ReadRate   float64 `json:"readRate"`
	Replied    int64   `json:"replied"`
	ReplyRate  float64 `json:"replyRate"`
	Buyers     int64   `json:"buyers"`
	Orders     int64   `json:"orders"`
	Revenue    int64   `json:"revenue"`
	BuyRate    float64 `json:"buyRate"`
}

func computeDevicePerf(udb *gorm.DB, userID uint, f analyticsFilter) ([]devicePerf, error) {
	devices := []devicePerf{}
	var rows []struct {
		ID        uint
		Name      string
		Phone     string
		Status    string
		Sent      int64
		Delivered int64
		Read      int64
		Failed    int64
	}
	if err := udb.Raw(`SELECT d.id, d.name, COALESCE(d.phone, '') AS phone, d.status,
		COUNT(*) FILTER (WHERE m.status IN ('sent','delivered','read')) AS sent,
		COUNT(*) FILTER (WHERE m.status = 'delivered') AS delivered,
		COUNT(*) FILTER (WHERE m.status = 'read') AS "read",
		COUNT(*) FILTER (WHERE m.status = 'failed') AS failed
		FROM devices d LEFT JOIN messages m ON m.device_id = d.id AND m.user_id = ?
		AND m.direction = 'outgoing' AND m.created_at >= ? AND m.created_at < ?
		WHERE d.user_id = ? GROUP BY d.id ORDER BY sent DESC, d.name ASC`,
		userID, f.from, f.to, userID).Scan(&rows).Error; err != nil {
		return nil, err
	}
	byID := map[uint]*devicePerf{}
	for _, r := range rows {
		d := devicePerf{DeviceID: r.ID, Name: r.Name, Phone: r.Phone, Status: r.Status,
			Sent: r.Sent, Delivered: r.Delivered, Read: r.Read, Failed: r.Failed}
		d.ReadRate = pct(d.Read, d.Sent)
		devices = append(devices, d)
		byID[d.DeviceID] = &devices[len(devices)-1]
	}
	if len(devices) == 0 {
		return devices, nil
	}

	// Balasan per device: pesan masuk dari nomor yang menerima pesan keluar
	// device itu sebelumnya.
	var replies []struct {
		DeviceID uint
		Replied  int64
	}
	if err := udb.Raw(`SELECT m.device_id, COUNT(DISTINCT ci.phone) AS replied
		FROM chat_inboxes ci JOIN messages m ON m.user_id = ci.user_id AND m."to" = ci.phone
		AND m.device_id = ci.device_id AND m.direction = 'outgoing'
		AND m.created_at <= ci.created_at AND m.created_at >= ? AND m.created_at < ?
		WHERE ci.user_id = ? AND ci.direction = 'in' AND ci.created_at >= ? AND ci.created_at < ?
		GROUP BY m.device_id`, f.from, f.to, userID, f.from, f.to).Scan(&replies).Error; err != nil {
		return nil, err
	}
	for _, r := range replies {
		if d, ok := byID[r.DeviceID]; ok {
			d.Replied = r.Replied
			d.ReplyRate = pct(d.Replied, d.Sent)
		}
	}

	// Order per device: device dari pesan keluar TERAKHIR sebelum order dibuat.
	var orders []struct {
		DeviceID uint
		Buyers   int64
		Orders   int64
		Revenue  int64
	}
	if err := udb.Raw(`SELECT m.device_id, COUNT(DISTINCT o.buyer_phone) AS buyers,
		COUNT(*) AS orders, COALESCE(SUM(o.total), 0) AS revenue
		FROM bot_orders o JOIN LATERAL (
			SELECT device_id FROM messages WHERE user_id = o.user_id AND "to" = o.buyer_phone
			AND direction = 'outgoing' AND created_at <= o.created_at
			ORDER BY created_at DESC LIMIT 1
		) m ON true
		WHERE o.user_id = ? AND o.created_at >= ? AND o.created_at < ?
		AND (o.status IS NULL OR o.status <> 'cancelled')
		GROUP BY m.device_id`, userID, f.from, f.to).Scan(&orders).Error; err != nil {
		return nil, err
	}
	for _, r := range orders {
		if d, ok := byID[r.DeviceID]; ok {
			d.Buyers, d.Orders, d.Revenue = r.Buyers, r.Orders, r.Revenue
			d.BuyRate = pct(d.Buyers, d.Sent)
		}
	}
	return devices, nil
}

func analyticsDevices(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		out, err := computeDevicePerf(udb, userID, parseAnalyticsFilter(c))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menghitung performa device"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"devices": out})
	}
}

// ── Performa kampanye (blast/BulkJob) ─────────────────────────────────────────

type campaignPerf struct {
	JobID       uint      `json:"jobId"`
	Name        string    `json:"name"`
	Status      string    `json:"status"`
	TotalCount  int       `json:"totalCount"`
	SentCount   int       `json:"sentCount"`
	FailedCount int       `json:"failedCount"`
	Read        int64     `json:"read"`
	ReadRate    float64   `json:"readRate"`
	Replied     int64     `json:"replied"`
	ReplyRate   float64   `json:"replyRate"`
	Buyers      int64     `json:"buyers"`
	Orders      int64     `json:"orders"`
	Revenue     int64     `json:"revenue"`
	BuyRate     float64   `json:"buyRate"`
	CreatedAt   time.Time `json:"createdAt"`
	CompletedAt *time.Time `json:"completedAt"`
}

func computeCampaignPerf(udb *gorm.DB, userID uint, f analyticsFilter) ([]campaignPerf, error) {
	out := []campaignPerf{}
	var rows []struct {
		ID          uint
		Name        string
		Status      string
		TotalCount  int
		SentCount   int
		FailedCount int
		Read        int64
		Replied     int64
		Buyers      int64
		Orders      int64
		Revenue     int64
		CreatedAt   time.Time
		CompletedAt sql.NullTime
	}
	if err := udb.Raw(`SELECT j.id, j.name, j.status, j.total_count, j.sent_count, j.failed_count,
		(SELECT COUNT(*) FROM messages m WHERE m.bulk_job_id = j.id AND m.status = 'read') AS "read",
		(SELECT COUNT(DISTINCT ci.phone) FROM chat_inboxes ci
			WHERE ci.user_id = j.user_id AND ci.direction = 'in' AND ci.created_at >= j.created_at
			AND EXISTS (SELECT 1 FROM messages m WHERE m.bulk_job_id = j.id AND m."to" = ci.phone AND m.created_at <= ci.created_at)) AS replied,
		(SELECT COUNT(DISTINCT o.buyer_phone) FROM bot_orders o
			WHERE o.user_id = j.user_id AND o.created_at >= j.created_at
			AND (o.status IS NULL OR o.status <> 'cancelled')
			AND EXISTS (SELECT 1 FROM messages m WHERE m.bulk_job_id = j.id AND m."to" = o.buyer_phone AND m.created_at <= o.created_at)) AS buyers,
		(SELECT COUNT(*) FROM bot_orders o
			WHERE o.user_id = j.user_id AND o.created_at >= j.created_at
			AND (o.status IS NULL OR o.status <> 'cancelled')
			AND EXISTS (SELECT 1 FROM messages m WHERE m.bulk_job_id = j.id AND m."to" = o.buyer_phone AND m.created_at <= o.created_at)) AS orders,
		(SELECT COALESCE(SUM(o.total), 0) FROM bot_orders o
			WHERE o.user_id = j.user_id AND o.created_at >= j.created_at
			AND (o.status IS NULL OR o.status <> 'cancelled')
			AND EXISTS (SELECT 1 FROM messages m WHERE m.bulk_job_id = j.id AND m."to" = o.buyer_phone AND m.created_at <= o.created_at)) AS revenue,
		j.created_at, j.completed_at
		FROM bulk_jobs j WHERE j.user_id = ? AND j.created_at >= ? AND j.created_at < ?
		ORDER BY j.created_at DESC LIMIT 100`,
		userID, f.from, f.to).Scan(&rows).Error; err != nil {
		return nil, err
	}
	for _, r := range rows {
		cp := campaignPerf{JobID: r.ID, Name: r.Name, Status: r.Status,
			TotalCount: r.TotalCount, SentCount: r.SentCount, FailedCount: r.FailedCount,
			Read: r.Read, Replied: r.Replied, Buyers: r.Buyers, Orders: r.Orders, Revenue: r.Revenue,
			CreatedAt: r.CreatedAt}
		if r.CompletedAt.Valid {
			cp.CompletedAt = &r.CompletedAt.Time
		}
		cp.ReadRate = pct(cp.Read, int64(cp.SentCount))
		cp.ReplyRate = pct(cp.Replied, int64(cp.SentCount))
		cp.BuyRate = pct(cp.Buyers, int64(cp.SentCount))
		out = append(out, cp)
	}
	return out, nil
}

func analyticsCampaigns(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		out, err := computeCampaignPerf(udb, userID, parseAnalyticsFilter(c))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menghitung performa kampanye"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"campaigns": out})
	}
}

// ── Waktu respons CS ──────────────────────────────────────────────────────────

type responseTimeResult struct {
	Conversations      int64            `json:"conversations"`
	Replied            int64            `json:"replied"`
	ReplyRate          float64          `json:"replyRate"`
	AvgFirstResponseS  float64          `json:"avgFirstResponseSeconds"`
	MedFirstResponseS  float64          `json:"medianFirstResponseSeconds"`
	Buckets            map[string]int64 `json:"buckets"`
	Resolved           int64            `json:"resolved"`
	AvgResolutionS     float64          `json:"avgResolutionSeconds"`
	MedResolutionS     float64          `json:"medianResolutionSeconds"`
	ResolutionNote     string           `json:"resolutionNote"`
	PerDevice          []deviceResponse `json:"perDevice"`
	Daily              []dailyResponse  `json:"daily"`
	From               string           `json:"from"`
	To                 string           `json:"to"`
}

type deviceResponse struct {
	DeviceID          uint    `json:"deviceId"`
	Name              string  `json:"name"`
	Conversations     int64   `json:"conversations"`
	Replied           int64   `json:"replied"`
	AvgFirstResponseS float64 `json:"avgFirstResponseSeconds"`
	MedFirstResponseS float64 `json:"medianFirstResponseSeconds"`
	avgAcc            []float64
}

type dailyResponse struct {
	Date              string  `json:"date"`
	Conversations     int64   `json:"conversations"`
	Replied           int64   `json:"replied"`
	AvgFirstResponseS float64 `json:"avgFirstResponseSeconds"`
	avgAcc            []float64
}

func computeResponseTime(udb *gorm.DB, userID uint, f analyticsFilter) (responseTimeResult, error) {
	out := responseTimeResult{
		Buckets:        map[string]int64{"<5m": 0, "5-15m": 0, "15-60m": 0, ">60m": 0},
		PerDevice:      []deviceResponse{},
		Daily:          []dailyResponse{},
		ResolutionNote: "Aproksimasi: last_activity - created_at untuk percakapan berstatus done (tidak ada kolom resolved_at).",
		From:           f.from.Format("2006-01-02"), To: f.to.Add(-24 * time.Hour).Format("2006-01-02"),
	}
	devClause, devArgs := f.deviceClause()
	// Urutan placeholder SQL: first_in(from,to), inner first_in(from,to),
	// first_out(from,to), user, last_activity(from,to), [device].
	rtArgs := []any{f.from, f.to, f.from, f.to, f.from, f.to, userID, f.from, f.to}
	rtArgs = append(rtArgs, devArgs...)
	var rows []struct {
		ID           uint
		DeviceID     uint
		Status       string
		CreatedAt    time.Time
		LastActivity time.Time
		FirstIn      sql.NullTime
		FirstOut     sql.NullTime
	}
	if err := udb.Raw(`SELECT c.id, c.device_id, c.status, c.created_at, c.last_activity,
		(SELECT MIN(created_at) FROM chat_inboxes i WHERE i.user_id = c.user_id AND i.device_id = c.device_id
			AND i.phone = c.phone AND i.direction = 'in' AND i.created_at >= ? AND i.created_at < ?) AS first_in,
		(SELECT MIN(o.created_at) FROM chat_inboxes o WHERE o.user_id = c.user_id AND o.device_id = c.device_id
			AND o.phone = c.phone AND o.direction = 'out' AND o.created_at > (
				SELECT MIN(created_at) FROM chat_inboxes i2 WHERE i2.user_id = c.user_id AND i2.device_id = c.device_id
				AND i2.phone = c.phone AND i2.direction = 'in' AND i2.created_at >= ? AND i2.created_at < ?
			) AND o.created_at >= ? AND o.created_at < ?) AS first_out
		FROM chat_conversations c WHERE c.user_id = ? AND c.last_activity >= ? AND c.last_activity < ?`+devClause+`
		ORDER BY c.last_activity DESC LIMIT 500`,
		rtArgs...).Scan(&rows).Error; err != nil {
		return out, err
	}

	// Nama device untuk label.
	devNames := map[uint]string{}
	var devRows []struct {
		ID   uint
		Name string
	}
	if err := udb.Raw(`SELECT id, name FROM devices WHERE user_id = ?`, userID).Scan(&devRows).Error; err == nil {
		for _, d := range devRows {
			devNames[d.ID] = d.Name
		}
	}

	var frts, resolutions []float64
	perDev := map[uint]*deviceResponse{}
	perDevOrder := []uint{}
	daily := map[string]*dailyResponse{}
	dailyOrder := []string{}
	for _, r := range rows {
		out.Conversations++
		day := r.FirstIn.Time.Format("2006-01-02")
		if r.FirstIn.Valid {
			if _, ok := daily[day]; !ok {
				daily[day] = &dailyResponse{Date: day}
				dailyOrder = append(dailyOrder, day)
			}
			daily[day].Conversations++
		}
		d, ok := perDev[r.DeviceID]
		if !ok {
			d = &deviceResponse{DeviceID: r.DeviceID, Name: devNames[r.DeviceID]}
			perDev[r.DeviceID] = d
			perDevOrder = append(perDevOrder, r.DeviceID)
		}
		d.Conversations++
		if r.FirstIn.Valid && r.FirstOut.Valid {
			secs := r.FirstOut.Time.Sub(r.FirstIn.Time).Seconds()
			if secs < 0 {
				secs = 0
			}
			frts = append(frts, secs)
			out.Replied++
			d.Replied++
			switch {
			case secs < 300:
				out.Buckets["<5m"]++
			case secs < 900:
				out.Buckets["5-15m"]++
			case secs < 3600:
				out.Buckets["15-60m"]++
			default:
				out.Buckets[">60m"]++
			}
			if dd, ok := daily[day]; ok {
				dd.Replied++
			}
			// Simpan mentah untuk median per device/daily di bawah.
			d.avgAcc = append(d.avgAcc, secs)
			if dd, ok := daily[day]; ok {
				dd.avgAcc = append(dd.avgAcc, secs)
			}
		}
		if r.Status == "done" {
			out.Resolved++
			resolutions = append(resolutions, r.LastActivity.Sub(r.CreatedAt).Seconds())
		}
	}
	out.ReplyRate = pct(out.Replied, out.Conversations)
	out.AvgFirstResponseS = avgSeconds(frts)
	out.MedFirstResponseS = medianSeconds(frts)
	out.AvgResolutionS = avgSeconds(resolutions)
	out.MedResolutionS = medianSeconds(resolutions)
	for _, id := range perDevOrder {
		d := perDev[id]
		d.AvgFirstResponseS = avgSeconds(d.avgAcc)
		d.MedFirstResponseS = medianSeconds(d.avgAcc)
		d.avgAcc = nil
		out.PerDevice = append(out.PerDevice, *d)
	}
	sort.Strings(dailyOrder)
	for _, day := range dailyOrder {
		dd := daily[day]
		dd.AvgFirstResponseS = avgSeconds(dd.avgAcc)
		dd.avgAcc = nil
		out.Daily = append(out.Daily, *dd)
	}
	return out, nil
}

func analyticsResponseTime(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		out, err := computeResponseTime(udb, userID, parseAnalyticsFilter(c))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menghitung waktu respons"})
			return
		}
		c.JSON(http.StatusOK, out)
	}
}

// ── Ekspor CSV / JSON ─────────────────────────────────────────────────────────

func analyticsExport(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		f := parseAnalyticsFilter(c)
		section := c.Query("section")
		if section == "" {
			section = "funnel"
		}
		format := c.Query("format")
		if format == "" {
			format = "csv"
		}
		if format != "csv" && format != "json" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "format harus csv atau json"})
			return
		}
		switch section {
		case "funnel", "devices", "campaigns", "response":
		default:
			c.JSON(http.StatusBadRequest, gin.H{"message": "section harus funnel, devices, campaigns, atau response"})
			return
		}

		var payload any
		var csvRows [][]string
		var err error
		switch section {
		case "funnel":
			var res funnelResult
			res, err = computeFunnel(udb, userID, f)
			payload = res
			csvRows = [][]string{
				{"stage", "count", "ratePercent"},
				{"sent", strconv.FormatInt(res.Sent, 10), ""},
				{"read", strconv.FormatInt(res.Read, 10), fmt.Sprintf("%.1f", res.ReadRate)},
				{"replied", strconv.FormatInt(res.Replied, 10), fmt.Sprintf("%.1f", res.ReplyRate)},
				{"buyers", strconv.FormatInt(res.Buyers, 10), fmt.Sprintf("%.1f", res.BuyRate)},
				{"orders", strconv.FormatInt(res.Orders, 10), ""},
				{"revenue", strconv.FormatInt(res.Revenue, 10), ""},
			}
		case "devices":
			var res []devicePerf
			res, err = computeDevicePerf(udb, userID, f)
			payload = gin.H{"devices": res}
			csvRows = [][]string{{"deviceId", "name", "phone", "status", "sent", "delivered", "read", "readRatePercent", "replied", "replyRatePercent", "buyers", "orders", "revenue"}}
			for _, d := range res {
				csvRows = append(csvRows, []string{
					strconv.FormatUint(uint64(d.DeviceID), 10), d.Name, d.Phone, d.Status,
					strconv.FormatInt(d.Sent, 10), strconv.FormatInt(d.Delivered, 10),
					strconv.FormatInt(d.Read, 10), fmt.Sprintf("%.1f", d.ReadRate),
					strconv.FormatInt(d.Replied, 10), fmt.Sprintf("%.1f", d.ReplyRate),
					strconv.FormatInt(d.Buyers, 10), strconv.FormatInt(d.Orders, 10),
					strconv.FormatInt(d.Revenue, 10),
				})
			}
		case "campaigns":
			var res []campaignPerf
			res, err = computeCampaignPerf(udb, userID, f)
			payload = gin.H{"campaigns": res}
			csvRows = [][]string{{"jobId", "name", "status", "totalCount", "sentCount", "failedCount", "read", "readRatePercent", "replied", "replyRatePercent", "buyers", "orders", "revenue", "createdAt"}}
			for _, cp := range res {
				csvRows = append(csvRows, []string{
					strconv.FormatUint(uint64(cp.JobID), 10), cp.Name, cp.Status,
					strconv.Itoa(cp.TotalCount), strconv.Itoa(cp.SentCount), strconv.Itoa(cp.FailedCount),
					strconv.FormatInt(cp.Read, 10), fmt.Sprintf("%.1f", cp.ReadRate),
					strconv.FormatInt(cp.Replied, 10), fmt.Sprintf("%.1f", cp.ReplyRate),
					strconv.FormatInt(cp.Buyers, 10), strconv.FormatInt(cp.Orders, 10),
					strconv.FormatInt(cp.Revenue, 10), cp.CreatedAt.Format("2006-01-02 15:04"),
				})
			}
		case "response":
			var res responseTimeResult
			res, err = computeResponseTime(udb, userID, f)
			payload = res
			csvRows = [][]string{{"metric", "value"}}
			csvRows = append(csvRows,
				[]string{"conversations", strconv.FormatInt(res.Conversations, 10)},
				[]string{"replied", strconv.FormatInt(res.Replied, 10)},
				[]string{"replyRatePercent", fmt.Sprintf("%.1f", res.ReplyRate)},
				[]string{"avgFirstResponseSeconds", fmt.Sprintf("%.0f", res.AvgFirstResponseS)},
				[]string{"medianFirstResponseSeconds", fmt.Sprintf("%.0f", res.MedFirstResponseS)},
				[]string{"resolved", strconv.FormatInt(res.Resolved, 10)},
				[]string{"avgResolutionSeconds", fmt.Sprintf("%.0f", res.AvgResolutionS)},
				[]string{"medianResolutionSeconds", fmt.Sprintf("%.0f", res.MedResolutionS)},
			)
			csvRows = append(csvRows, []string{"", ""}, []string{"deviceId", "deviceName", "conversations", "replied", "avgFirstResponseSeconds", "medianFirstResponseSeconds"})
			for _, d := range res.PerDevice {
				csvRows = append(csvRows, []string{
					strconv.FormatUint(uint64(d.DeviceID), 10), d.Name,
					strconv.FormatInt(d.Conversations, 10), strconv.FormatInt(d.Replied, 10),
					fmt.Sprintf("%.0f", d.AvgFirstResponseS), fmt.Sprintf("%.0f", d.MedFirstResponseS),
				})
			}
		}
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyiapkan ekspor"})
			return
		}

		filename := fmt.Sprintf("analytics-%s-%s.%s", section, f.from.Format("20060102"), format)
		if format == "json" {
			c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
			c.JSON(http.StatusOK, payload)
			return
		}
		c.Header("Content-Type", "text/csv; charset=utf-8")
		c.Header("Content-Disposition", `attachment; filename="`+filename+`"`)
		c.Status(http.StatusOK)
		w := csv.NewWriter(c.Writer)
		_ = w.WriteAll(csvRows)
		w.Flush()
	}
}
