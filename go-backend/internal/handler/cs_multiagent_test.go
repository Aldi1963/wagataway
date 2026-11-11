// Test CS multi-agent: assign, status pending/resolved, catatan internal,
// aktivitas, statistik tim, dan pembatasan visibilitas agent.
//
// DB-backed (postgres test; skip bila tidak tersedia), mengikuti pola
// trialTestDB di paket ini.
package handler

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"testing"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/gin-gonic/gin"
	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

func csTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL tidak diset — lewati test CS multi-agent")
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Skipf("DATABASE_URL tidak valid: %v", err)
	}
	u.Path = "/wagataway_test"
	db, err := gorm.Open(postgres.Open(u.String()), &gorm.Config{})
	if err != nil {
		t.Skipf("postgres test tidak terjangkau: %v", err)
	}
	sqlDB, err := db.DB()
	if err != nil {
		t.Skipf("gagal ambil sql.DB: %v", err)
	}
	if err := sqlDB.Ping(); err != nil {
		t.Skipf("postgres test tidak terjangkau: %v", err)
	}
	if err := db.AutoMigrate(
		&models.User{}, &models.TeamMember{}, &models.Session{},
		&models.ChatConversation{}, &models.ChatInternalNote{}, &models.ChatActivity{},
		&models.ChatAssignment{},
	); err != nil {
		t.Fatalf("AutoMigrate gagal: %v", err)
	}
	return db
}

func seedCSOwner(t *testing.T, db *gorm.DB) models.User {
	t.Helper()
	// ID eksplisit di rentang tinggi (96xxx): DB test dipakai bersama dan
	// test lain me-TRUNCATE users RESTART IDENTITY — ID sequence kecil
	// bisa bertabrakan antar run paralel. Pola yang sama dipakai test lain
	// di paket ini (91xxx-94xxx).
	id := uint(96000 + time.Now().UnixNano()%2000)
	u := models.User{
		ID:   id,
		Name: "Owner CS", Email: fmt.Sprintf("owner-cs-%d@example.com", time.Now().UnixNano()),
		Password: "x", Role: "user", Plan: "pro",
	}
	if err := db.Create(&u).Error; err != nil {
		t.Fatalf("seed owner gagal: %v", err)
	}
	return u
}

// uniqueCSPhone menghasilkan nomor unik per run agar percakapan test tidak
// bertabrakan antar run paralel pada DB test yang sama.
func uniqueCSPhone() string {
	return fmt.Sprintf("628%09d", time.Now().UnixNano()%1000000000)
}

func uniqueCSJTI(prefix string) string {
	return fmt.Sprintf("%s-%d", prefix, time.Now().UnixNano())
}

func seedCSTeamMember(t *testing.T, db *gorm.DB, ownerID uint, name, role string) models.TeamMember {
	t.Helper()
	m := models.TeamMember{
		OwnerID: ownerID, Email: fmt.Sprintf("%s-%d@example.com", name, time.Now().UnixNano()),
		Name: name, Role: role, IsActive: true, Password: "x",
	}
	if err := db.Create(&m).Error; err != nil {
		t.Fatalf("seed member gagal: %v", err)
	}
	return m
}

func seedCSConversation(t *testing.T, db *gorm.DB, ownerID uint, phone, status string) models.ChatConversation {
	t.Helper()
	c := models.ChatConversation{
		UserID: ownerID, DeviceID: 1, Phone: phone,
		LastMessage: "halo", Status: status, LastActivity: time.Now(),
	}
	if err := db.Create(&c).Error; err != nil {
		t.Fatalf("seed conversation gagal: %v", err)
	}
	return c
}

// callCSHandler memanggil gin handler dengan konteks terautentikasi.
func callCSHandler(t *testing.T, h gin.HandlerFunc, method, target string, body any, userID uint, role, jti string, params []gin.Param) *httptest.ResponseRecorder {
	t.Helper()
	gin.SetMode(gin.TestMode)
	var rdr *bytes.Reader
	if body != nil {
		b, _ := json.Marshal(body)
		rdr = bytes.NewReader(b)
	} else {
		rdr = bytes.NewReader(nil)
	}
	req := httptest.NewRequest(method, target, rdr)
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	c, _ := gin.CreateTestContext(w)
	c.Request = req
	c.Set("userID", userID)
	c.Set("role", role)
	if jti != "" {
		c.Set("sessionJTI", jti)
	}
	c.Params = params
	h(c)
	return w
}

func TestStatusFilterClause(t *testing.T) {
	cases := []struct {
		in   string
		want []string
		ok   bool
	}{
		{"open", []string{"open", "pending"}, true},
		{"pending", []string{"pending"}, true},
		{"resolved", []string{"resolved", "done"}, true},
		{"done", []string{"done"}, true},
		{"archived", []string{"archived"}, true},
		{"all", nil, true},
		{"bogus", nil, false},
		{"", nil, false},
	}
	for _, tc := range cases {
		got, ok := statusFilterClause(tc.in)
		if ok != tc.ok {
			t.Errorf("statusFilterClause(%q) ok=%v, want %v", tc.in, ok, tc.ok)
		}
		if len(got) != len(tc.want) {
			t.Errorf("statusFilterClause(%q) = %v, want %v", tc.in, got, tc.want)
			continue
		}
		for i := range got {
			if got[i] != tc.want[i] {
				t.Errorf("statusFilterClause(%q) = %v, want %v", tc.in, got, tc.want)
			}
		}
	}
}

func TestIsValidConversationStatus(t *testing.T) {
	for _, s := range []string{"open", "pending", "resolved", "done", "archived"} {
		if !isValidConversationStatus(s) {
			t.Errorf("isValidConversationStatus(%q) = false, want true", s)
		}
	}
	for _, s := range []string{"", "closed", "OPEN", "selesai"} {
		if isValidConversationStatus(s) {
			t.Errorf("isValidConversationStatus(%q) = true, want false", s)
		}
	}
}

func TestAssignConversationFlow(t *testing.T) {
	db := csTestDB(t)
	owner := seedCSOwner(t, db)
	agent := seedCSTeamMember(t, db, owner.ID, "Rina", "member")
	admin := seedCSTeamMember(t, db, owner.ID, "Budi", "admin")
	conv := seedCSConversation(t, db, owner.ID, uniqueCSPhone(), "open")
	phoneParam := []gin.Param{{Key: "phone", Value: conv.Phone}}

	// Owner assign ke agent.
	w := callCSHandler(t, assignConversation(db), "PATCH", "/chat/conversations/"+conv.Phone+"/assign",
		map[string]any{"deviceId": 1, "memberId": agent.ID}, owner.ID, "user", "", phoneParam)
	if w.Code != http.StatusOK {
		t.Fatalf("assign owner -> %d: %s", w.Code, w.Body.String())
	}
	var got models.ChatConversation
	if err := db.First(&got, conv.ID).Error; err != nil {
		t.Fatalf("baca conversation: %v", err)
	}
	if got.AssignedMemberID == nil || *got.AssignedMemberID != agent.ID || got.AssignedMemberName != "Rina" {
		t.Fatalf("assignee = %+v, want Rina (%d)", got.AssignedMemberID, agent.ID)
	}
	if got.AssignedAt == nil {
		t.Fatal("AssignedAt kosong setelah assign")
	}
	var acts []models.ChatActivity
	db.Where("user_id = ? AND phone = ?", owner.ID, conv.Phone).Find(&acts)
	if len(acts) != 1 || acts[0].Action != "assigned" {
		t.Fatalf("activity = %+v, want 1x assigned", acts)
	}

	// Reassign ke admin oleh owner.
	w = callCSHandler(t, assignConversation(db), "PATCH", "/chat/conversations/"+conv.Phone+"/assign",
		map[string]any{"deviceId": 1, "memberId": admin.ID}, owner.ID, "user", "", phoneParam)
	if w.Code != http.StatusOK {
		t.Fatalf("reassign -> %d: %s", w.Code, w.Body.String())
	}
	db.Where("user_id = ? AND phone = ?", owner.ID, conv.Phone).Order("id ASC").Find(&acts)
	if len(acts) != 2 || acts[1].Action != "reassigned" {
		t.Fatalf("activity setelah reassign = %+v, want assigned+reassigned", acts)
	}

	// Agent (bukan penanggung jawab) tidak bisa melepas percakapan admin —
	// percakapan itu bahkan tidak terlihat olehnya (404, anti bocor).
	jtiAgent := uniqueCSJTI("jti-agent-cs")
	db.Create(&models.Session{UserID: owner.ID, JTI: jtiAgent, TeamMemberID: &agent.ID, CreatedAt: time.Now(), LastSeen: time.Now()})
	w = callCSHandler(t, assignConversation(db), "PATCH", "/chat/conversations/"+conv.Phone+"/assign",
		map[string]any{"deviceId": 1, "memberId": nil}, owner.ID, "team_member", jtiAgent, phoneParam)
	if w.Code != http.StatusNotFound {
		t.Fatalf("agent unassign milik orang lain -> %d, want 404: %s", w.Code, w.Body.String())
	}

	// Owner melepas dulu, baru agent boleh mengambil (assign ke diri sendiri).
	w = callCSHandler(t, assignConversation(db), "PATCH", "/chat/conversations/"+conv.Phone+"/assign",
		map[string]any{"deviceId": 1, "memberId": nil}, owner.ID, "user", "", phoneParam)
	if w.Code != http.StatusOK {
		t.Fatalf("owner unassign -> %d: %s", w.Code, w.Body.String())
	}
	w = callCSHandler(t, assignConversation(db), "PATCH", "/chat/conversations/"+conv.Phone+"/assign",
		map[string]any{"deviceId": 1, "memberId": agent.ID}, owner.ID, "team_member", jtiAgent, phoneParam)
	if w.Code != http.StatusOK {
		t.Fatalf("agent assign ke diri -> %d: %s", w.Code, w.Body.String())
	}

	// Agent boleh unassign miliknya sendiri.
	w = callCSHandler(t, assignConversation(db), "PATCH", "/chat/conversations/"+conv.Phone+"/assign",
		map[string]any{"deviceId": 1, "memberId": nil}, owner.ID, "team_member", jtiAgent, phoneParam)
	if w.Code != http.StatusOK {
		t.Fatalf("agent unassign milik sendiri -> %d: %s", w.Code, w.Body.String())
	}
	// Reset struct: GORM memakai field non-zero sebagai kondisi tambahan.
	got = models.ChatConversation{}
	if err := db.First(&got, conv.ID).Error; err != nil {
		t.Fatalf("baca conversation: %v", err)
	}
	if got.AssignedMemberID != nil {
		t.Fatalf("AssignedMemberID = %v, want nil setelah unassign", got.AssignedMemberID)
	}

	// Viewer tidak boleh assign.
	jtiViewer := uniqueCSJTI("jti-viewer-cs")
	viewer := seedCSTeamMember(t, db, owner.ID, "Vina", "viewer")
	db.Create(&models.Session{UserID: owner.ID, JTI: jtiViewer, TeamMemberID: &viewer.ID, CreatedAt: time.Now(), LastSeen: time.Now()})
	w = callCSHandler(t, assignConversation(db), "PATCH", "/chat/conversations/"+conv.Phone+"/assign",
		map[string]any{"deviceId": 1, "memberId": agent.ID}, owner.ID, "team_viewer", jtiViewer, phoneParam)
	if w.Code != http.StatusForbidden {
		t.Fatalf("viewer assign -> %d, want 403: %s", w.Code, w.Body.String())
	}

	// Assign ke member nonaktif / milik owner lain ditolak.
	other := seedCSOwner(t, db)
	outsider := seedCSTeamMember(t, db, other.ID, "Luar", "member")
	w = callCSHandler(t, assignConversation(db), "PATCH", "/chat/conversations/"+conv.Phone+"/assign",
		map[string]any{"deviceId": 1, "memberId": outsider.ID}, owner.ID, "user", "", phoneParam)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("assign outsider -> %d, want 400: %s", w.Code, w.Body.String())
	}
}

func TestInternalNotesFlow(t *testing.T) {
	db := csTestDB(t)
	owner := seedCSOwner(t, db)
	conv := seedCSConversation(t, db, owner.ID, uniqueCSPhone(), "open")
	phoneParam := []gin.Param{{Key: "phone", Value: conv.Phone}}

	w := callCSHandler(t, createInternalNote(db), "POST", "/chat/conversations/"+conv.Phone+"/notes",
		map[string]any{"deviceId": 1, "content": "Pelanggan minta dihubungi sore"}, owner.ID, "user", "", phoneParam)
	if w.Code != http.StatusOK {
		t.Fatalf("create note -> %d: %s", w.Code, w.Body.String())
	}
	var created struct {
		Note models.ChatInternalNote `json:"note"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &created); err != nil {
		t.Fatalf("parse note: %v", err)
	}
	if created.Note.AuthorName != "Owner CS" || created.Note.Content != "Pelanggan minta dihubungi sore" {
		t.Fatalf("note = %+v", created.Note)
	}

	w = callCSHandler(t, listInternalNotes(db), "GET", "/chat/conversations/"+conv.Phone+"/notes?deviceId=1",
		nil, owner.ID, "user", "", phoneParam)
	if w.Code != http.StatusOK {
		t.Fatalf("list notes -> %d: %s", w.Code, w.Body.String())
	}
	var listed struct {
		Notes []models.ChatInternalNote `json:"notes"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &listed); err != nil {
		t.Fatalf("parse list: %v", err)
	}
	if len(listed.Notes) != 1 {
		t.Fatalf("notes = %d, want 1", len(listed.Notes))
	}

	// Catatan kosong ditolak.
	w = callCSHandler(t, createInternalNote(db), "POST", "/chat/conversations/"+conv.Phone+"/notes",
		map[string]any{"deviceId": 1, "content": "   "}, owner.ID, "user", "", phoneParam)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("note kosong -> %d, want 400", w.Code)
	}

	// Hapus catatan.
	w = callCSHandler(t, deleteInternalNote(db), "DELETE", "/chat/notes/1", nil,
		owner.ID, "user", "", []gin.Param{{Key: "id", Value: fmt.Sprint(created.Note.ID)}})
	if w.Code != http.StatusOK {
		t.Fatalf("delete note -> %d: %s", w.Code, w.Body.String())
	}
	var count int64
	db.Model(&models.ChatInternalNote{}).Where("id = ?", created.Note.ID).Count(&count)
	if count != 0 {
		t.Fatal("catatan masih ada setelah delete")
	}
}

func TestConversationStatusResolvedTiming(t *testing.T) {
	db := csTestDB(t)
	owner := seedCSOwner(t, db)
	inboundAt := time.Now().Add(-10 * time.Minute)
	conv := models.ChatConversation{
		UserID: owner.ID, DeviceID: 1, Phone: uniqueCSPhone(),
		LastMessage: "halo", Status: "open", LastActivity: time.Now(),
		FirstInboundAt: &inboundAt,
	}
	if err := db.Create(&conv).Error; err != nil {
		t.Fatalf("seed: %v", err)
	}
	phoneParam := []gin.Param{{Key: "phone", Value: conv.Phone}}

	w := callCSHandler(t, setConversationStatus(db), "PATCH", "/chat/conversations/"+conv.Phone+"/status",
		map[string]any{"status": "pending"}, owner.ID, "user", "", phoneParam)
	if w.Code != http.StatusOK {
		t.Fatalf("pending -> %d: %s", w.Code, w.Body.String())
	}
	w = callCSHandler(t, setConversationStatus(db), "PATCH", "/chat/conversations/"+conv.Phone+"/status",
		map[string]any{"status": "resolved"}, owner.ID, "user", "", phoneParam)
	if w.Code != http.StatusOK {
		t.Fatalf("resolved -> %d: %s", w.Code, w.Body.String())
	}
	var got models.ChatConversation
	db.First(&got, conv.ID)
	if got.Status != "resolved" || got.ResolvedAt == nil || got.ResolutionSecs == nil {
		t.Fatalf("setelah resolved: %+v", got)
	}
	// Resolution ~10 menit (600 dtk) sejak first inbound, toleransi 60 dtk.
	if *got.ResolutionSecs < 540 || *got.ResolutionSecs > 660 {
		t.Fatalf("resolutionSecs = %d, want ~600", *got.ResolutionSecs)
	}

	// Buka lagi: jejak penyelesaian terhapus.
	w = callCSHandler(t, setConversationStatus(db), "PATCH", "/chat/conversations/"+conv.Phone+"/status",
		map[string]any{"status": "open"}, owner.ID, "user", "", phoneParam)
	if w.Code != http.StatusOK {
		t.Fatalf("reopen -> %d: %s", w.Code, w.Body.String())
	}
	// Reset struct: GORM memakai field non-zero sebagai kondisi tambahan,
	// jadi baca ulang dengan struct kosong agar tidak basi.
	got = models.ChatConversation{}
	db.First(&got, conv.ID)
	if got.ResolvedAt != nil || got.ResolutionSecs != nil {
		t.Fatalf("setelah reopen: ResolvedAt=%v ResolutionSecs=%v, want nil", got.ResolvedAt, got.ResolutionSecs)
	}

	// Status tak dikenal ditolak.
	w = callCSHandler(t, setConversationStatus(db), "PATCH", "/chat/conversations/"+conv.Phone+"/status",
		map[string]any{"status": "closed"}, owner.ID, "user", "", phoneParam)
	if w.Code != http.StatusBadRequest {
		t.Fatalf("status bogus -> %d, want 400", w.Code)
	}
}

func TestTeamStats(t *testing.T) {
	db := csTestDB(t)
	owner := seedCSOwner(t, db)
	agent := seedCSTeamMember(t, db, owner.ID, "Rina", "member")
	frt := 120
	res := 3600
	seedCSConversation(t, db, owner.ID, uniqueCSPhone(), "open")
	c2 := seedCSConversation(t, db, owner.ID, uniqueCSPhone(), "resolved")
	db.Model(&c2).Updates(map[string]any{
		"assigned_member_id": agent.ID, "assigned_member_name": "Rina",
		"first_response_secs": frt, "resolution_secs": res,
	})
	c3 := seedCSConversation(t, db, owner.ID, uniqueCSPhone(), "pending")
	db.Model(&c3).Updates(map[string]any{
		"assigned_member_id": agent.ID, "assigned_member_name": "Rina",
	})

	w := callCSHandler(t, getTeamStats(db), "GET", "/chat/team-stats", nil, owner.ID, "user", "", nil)
	if w.Code != http.StatusOK {
		t.Fatalf("team-stats -> %d: %s", w.Code, w.Body.String())
	}
	var resp struct {
		Stats []teamMemberStats `json:"stats"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("parse stats: %v", err)
	}
	var rina *teamMemberStats
	var unassigned *teamMemberStats
	for i := range resp.Stats {
		if resp.Stats[i].MemberName == "Rina" {
			rina = &resp.Stats[i]
		}
		if resp.Stats[i].MemberName == "Belum di-assign" {
			unassigned = &resp.Stats[i]
		}
	}
	if rina == nil {
		t.Fatalf("stats Rina tidak ada: %+v", resp.Stats)
	}
	if rina.AssignedPending != 1 || rina.Resolved != 1 {
		t.Fatalf("stats Rina = %+v, want pending=1 resolved=1", rina)
	}
	if rina.AvgFirstResponse == nil || *rina.AvgFirstResponse != 120 {
		t.Fatalf("avg FRT Rina = %v, want 120", rina.AvgFirstResponse)
	}
	if rina.AvgResolution == nil || *rina.AvgResolution != 3600 {
		t.Fatalf("avg resolution Rina = %v, want 3600", rina.AvgResolution)
	}
	if unassigned == nil || unassigned.AssignedOpen != 1 {
		t.Fatalf("stats unassigned = %+v, want open=1", unassigned)
	}

	// Agent hanya melihat baris dirinya sendiri.
	jti := uniqueCSJTI("jti-stats-agent")
	db.Create(&models.Session{UserID: owner.ID, JTI: jti, TeamMemberID: &agent.ID, CreatedAt: time.Now(), LastSeen: time.Now()})
	w = callCSHandler(t, getTeamStats(db), "GET", "/chat/team-stats", nil, owner.ID, "team_member", jti, nil)
	if w.Code != http.StatusOK {
		t.Fatalf("team-stats agent -> %d: %s", w.Code, w.Body.String())
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("parse stats agent: %v", err)
	}
	if len(resp.Stats) != 1 || resp.Stats[0].MemberName != "Rina" {
		t.Fatalf("stats agent = %+v, want hanya Rina", resp.Stats)
	}
}

func TestAgentConversationScope(t *testing.T) {
	db := csTestDB(t)
	owner := seedCSOwner(t, db)
	agent := seedCSTeamMember(t, db, owner.ID, "Rina", "member")
	other := seedCSTeamMember(t, db, owner.ID, "Budi", "member")
	mine := seedCSConversation(t, db, owner.ID, uniqueCSPhone(), "open")
	db.Model(&mine).Updates(map[string]any{"assigned_member_id": agent.ID, "assigned_member_name": "Rina"})
	theirs := seedCSConversation(t, db, owner.ID, uniqueCSPhone(), "open")
	db.Model(&theirs).Updates(map[string]any{"assigned_member_id": other.ID, "assigned_member_name": "Budi"})
	seedCSConversation(t, db, owner.ID, uniqueCSPhone(), "open") // belum di-assign

	jti := uniqueCSJTI("jti-scope-agent")
	db.Create(&models.Session{UserID: owner.ID, JTI: jti, TeamMemberID: &agent.ID, CreatedAt: time.Now(), LastSeen: time.Now()})

	// Agent tidak bisa melihat percakapan Budi (404, bukan 403 — anti bocor).
	w := callCSHandler(t, listInternalNotes(db), "GET", "/chat/conversations/"+theirs.Phone+"/notes?deviceId=1",
		nil, owner.ID, "team_member", jti, []gin.Param{{Key: "phone", Value: theirs.Phone}})
	if w.Code != http.StatusNotFound {
		t.Fatalf("notes milik Budi oleh Rina -> %d, want 404: %s", w.Code, w.Body.String())
	}
	// ...tapi bisa melihat miliknya sendiri.
	w = callCSHandler(t, listInternalNotes(db), "GET", "/chat/conversations/"+mine.Phone+"/notes?deviceId=1",
		nil, owner.ID, "team_member", jti, []gin.Param{{Key: "phone", Value: mine.Phone}})
	if w.Code != http.StatusOK {
		t.Fatalf("notes milik Rina -> %d: %s", w.Code, w.Body.String())
	}
}
