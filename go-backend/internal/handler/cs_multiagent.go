package handler

// CS multi-agent: assign percakapan ke anggota tim, catatan internal,
// jejak aktivitas, status pending/resolved, waktu respons terukur, dan
// ringkasan per anggota tim.
//
// Peran mengikuti pola yang sudah ada (team-login): JWT membawa role
// "team_admin" / "team_member" / "team_viewer" dan UserID = pemilik akun.
// - owner & team_admin: melihat semua percakapan, boleh assign ke siapa saja.
// - team_member (agent): hanya melihat percakapan yang di-assign ke dirinya
//   + yang belum di-assign; hanya boleh mengambil (assign ke diri sendiri)
//   atau melepas percakapan miliknya.
// - team_viewer: melihat semua, tidak boleh mengubah apa pun di modul ini.

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// Status percakapan yang dikenal modul CS. "done" dipertahankan untuk
// kompatibilitas klien lama (diperlakukan sama dengan "resolved").
var csConversationStatuses = map[string]bool{
	"open": true, "pending": true, "resolved": true, "done": true, "archived": true,
}

func isValidConversationStatus(s string) bool { return csConversationStatuses[s] }

// statusFilterClause memetakan filter status dari query ke daftar status DB.
// "open" = antrean aktif (open + pending); "resolved" mencakup "done" lama.
func statusFilterClause(filter string) ([]string, bool) {
	switch filter {
	case "open":
		return []string{"open", "pending"}, true
	case "pending":
		return []string{"pending"}, true
	case "resolved":
		return []string{"resolved", "done"}, true
	case "done":
		return []string{"done"}, true
	case "archived":
		return []string{"archived"}, true
	case "all":
		return nil, true
	default:
		return nil, false
	}
}

// teamContext adalah identitas penelepon di modul CS: peran + anggota tim
// bila login sebagai sub-akun. memberID nil = pemilik akun.
type teamContext struct {
	role       string
	memberID   *uint
	memberName string
	isTeam     bool
}

// resolveTeamContext membaca role dari JWT lalu, bila peran tim, mencari
// anggota lewat sesi saat ini (sessions.team_member_id via sessionJTI).
// Gagal lookup anggota (sesi dicabut) -> diperlakukan sebagai viewer
// agar tidak bisa mengubah apa pun.
func resolveTeamContext(c *gin.Context, db *gorm.DB, userID uint) teamContext {
	tc := teamContext{role: middleware.GetRole(c)}
	if !strings.HasPrefix(tc.role, "team_") {
		// Pemilik (atau API key): nama dari tabel users.
		var u models.User
		if err := db.First(&u, userID).Error; err == nil {
			tc.memberName = u.Name
		}
		return tc
	}
	tc.isTeam = true
	jti := currentJTI(c)
	if jti != "" {
		var s models.Session
		if err := db.Where("jti = ? AND revoked_at IS NULL", jti).First(&s).Error; err == nil && s.TeamMemberID != nil {
			var m models.TeamMember
			if err := db.Where("id = ? AND owner_id = ? AND is_active = ?", *s.TeamMemberID, userID, true).First(&m).Error; err == nil {
				tc.memberID = s.TeamMemberID
				tc.memberName = m.Name
				return tc
			}
		}
	}
	// Sesi tim tidak terlacak: kunci ke viewer.
	tc.role = "team_viewer"
	return tc
}

// canManageAssignment: owner & team_admin boleh assign ke siapa saja;
// team_member hanya ke diri sendiri (atau melepas miliknya sendiri);
// team_viewer tidak boleh sama sekali.
func (tc teamContext) canManageAssignment(targetMemberID *uint) bool {
	switch tc.role {
	case "team_viewer":
		return false
	case "team_member":
		return targetMemberID != nil && tc.memberID != nil && *targetMemberID == *tc.memberID
	default: // owner, team_admin, API key
		return true
	}
}

func (tc teamContext) canWrite() bool { return tc.role != "team_viewer" }

// scopeConversationsForTeam membatasi query percakapan untuk agent:
// hanya yang di-assign ke dirinya + yang belum di-assign.
func scopeConversationsForTeam(q *gorm.DB, tc teamContext) *gorm.DB {
	if middleware.IsTeamAgentRole(tc.role) && tc.memberID != nil {
		return q.Where("(assigned_member_id = ? OR assigned_member_id IS NULL)", *tc.memberID)
	}
	return q
}

// findConversationForTeam memuat satu percakapan (user+device+phone).
// Mengembalikan nil bila tidak ada ATAU di luar jangkauan agent (404 yang
// sama agar keberadaan percakapan orang lain tidak bocor).
func findConversationForTeam(udb *gorm.DB, tc teamContext, userID, deviceID uint, phone string) *models.ChatConversation {
	var conv models.ChatConversation
	q := udb.Where("user_id = ? AND device_id = ? AND phone = ?", userID, deviceID, phone)
	q = scopeConversationsForTeam(q, tc)
	if err := q.First(&conv).Error; err != nil {
		return nil
	}
	return &conv
}

// recordChatActivity menulis jejak aktivitas (best-effort; gagal diam-diam).
func recordChatActivity(db *gorm.DB, tc teamContext, userID, deviceID uint, phone, action, detail string) {
	db.Create(&models.ChatActivity{
		UserID: userID, DeviceID: deviceID, Phone: phone,
		ActorMemberID: tc.memberID, ActorName: tc.memberName,
		Action: action, Detail: detail,
	})
}

// syncLegacyAssignmentName menjaga kolom AssignedTo (string, dipakai halaman
// Label & Assign) tetap selaras dengan penugasan baru — best-effort.
func syncLegacyAssignmentName(udb *gorm.DB, userID uint, phone, name string) {
	var a models.ChatAssignment
	if err := udb.Where("user_id = ? AND chat_j_id = ?", userID, phone).First(&a).Error; err != nil {
		return
	}
	udb.Model(&a).Update("assigned_to", name)
}

// registerCSMultiAgentRoutes mendaftarkan endpoint CS multi-agent di bawah
// grup /chat yang sudah ada (scope "chat").
func registerCSMultiAgentRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	chat := rg.Group("/chat", middleware.RequireScope("chat"))
	{
		chat.PATCH("/conversations/:phone/assign", assignConversation(db))
		chat.GET("/conversations/:phone/notes", listInternalNotes(db))
		chat.POST("/conversations/:phone/notes", createInternalNote(db))
		chat.GET("/conversations/:phone/activity", listChatActivity(db))
		chat.GET("/team-stats", getTeamStats(db))
		chat.DELETE("/notes/:id", deleteInternalNote(db))
	}
}

// assignConversation: assign / unassign / reassign satu percakapan.
// Body: {"deviceId": N, "memberId": M | null}. memberId null = lepas penugasan.
func assignConversation(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		tc := resolveTeamContext(c, db, userID)
		phone := c.Param("phone")
		var req struct {
			DeviceID uint  `json:"deviceId" binding:"required"`
			MemberID *uint `json:"memberId"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "deviceId wajib diisi"})
			return
		}
		conv := findConversationForTeam(udb, tc, userID, req.DeviceID, phone)
		if conv == nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Percakapan tidak ditemukan"})
			return
		}
		// Agent hanya boleh melepas percakapan yang di-assign ke dirinya;
		// assign ke orang lain ditolak. (Viewer ditolak di bawah.)
		if req.MemberID == nil && middleware.IsTeamAgentRole(tc.role) {
			if conv.AssignedMemberID == nil || tc.memberID == nil || *conv.AssignedMemberID != *tc.memberID {
				c.JSON(http.StatusForbidden, gin.H{"message": "Hanya penanggung jawab yang bisa melepas percakapan ini"})
				return
			}
		}
		if req.MemberID == nil && tc.role == "team_viewer" {
			c.JSON(http.StatusForbidden, gin.H{"message": "Peran Anda hanya bisa melihat"})
			return
		}
		if req.MemberID != nil && !tc.canManageAssignment(req.MemberID) {
			c.JSON(http.StatusForbidden, gin.H{"message": "Peran Anda tidak boleh mengubah penugasan"})
			return
		}

		now := time.Now()
		if req.MemberID == nil {
			// Unassign.
			if conv.AssignedMemberID == nil {
				c.JSON(http.StatusOK, gin.H{"conversation": conv})
				return
			}
			oldName := conv.AssignedMemberName
			conv.AssignedMemberID = nil
			conv.AssignedMemberName = ""
			conv.AssignedAt = nil
			udb.Save(conv)
			recordChatActivity(udb, tc, userID, req.DeviceID, phone, "unassigned", "Dilepas dari "+oldName)
			syncLegacyAssignmentName(udb, userID, phone, "")
			c.JSON(http.StatusOK, gin.H{"conversation": conv})
			return
		}

		var member models.TeamMember
		if err := udb.Where("id = ? AND owner_id = ? AND is_active = ?", *req.MemberID, userID, true).First(&member).Error; err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Anggota tim tidak ditemukan atau nonaktif"})
			return
		}
		action := "assigned"
		detail := "Di-assign ke " + member.Name
		if conv.AssignedMemberID != nil && *conv.AssignedMemberID != member.ID {
			action = "reassigned"
			detail = "Dialihkan dari " + conv.AssignedMemberName + " ke " + member.Name
		}
		conv.AssignedMemberID = &member.ID
		conv.AssignedMemberName = member.Name
		conv.AssignedAt = &now
		udb.Save(conv)
		recordChatActivity(udb, tc, userID, req.DeviceID, phone, action, detail)
		syncLegacyAssignmentName(udb, userID, phone, member.Name)
		c.JSON(http.StatusOK, gin.H{"conversation": conv})
	}
}

// listInternalNotes: catatan internal sebuah percakapan (terbaru dulu).
func listInternalNotes(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		tc := resolveTeamContext(c, db, userID)
		phone := c.Param("phone")
		deviceID, _ := strconv.Atoi(c.Query("deviceId"))
		if deviceID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "deviceId wajib diisi"})
			return
		}
		if findConversationForTeam(udb, tc, userID, uint(deviceID), phone) == nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Percakapan tidak ditemukan"})
			return
		}
		var notes []models.ChatInternalNote
		udb.Where("user_id = ? AND device_id = ? AND phone = ?", userID, deviceID, phone).
			Order("created_at DESC").Limit(100).Find(&notes)
		c.JSON(http.StatusOK, gin.H{"notes": notes})
	}
}

// createInternalNote: tambah catatan internal (tidak pernah terkirim ke pelanggan).
func createInternalNote(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		tc := resolveTeamContext(c, db, userID)
		phone := c.Param("phone")
		if !tc.canWrite() {
			c.JSON(http.StatusForbidden, gin.H{"message": "Peran Anda hanya bisa melihat"})
			return
		}
		var req struct {
			DeviceID uint   `json:"deviceId" binding:"required"`
			Content  string `json:"content" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil || strings.TrimSpace(req.Content) == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Isi catatan wajib diisi"})
			return
		}
		if findConversationForTeam(udb, tc, userID, req.DeviceID, phone) == nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Percakapan tidak ditemukan"})
			return
		}
		note := models.ChatInternalNote{
			UserID: userID, DeviceID: req.DeviceID, Phone: phone,
			AuthorMemberID: tc.memberID, AuthorName: tc.memberName,
			Content: strings.TrimSpace(req.Content),
		}
		if err := udb.Create(&note).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan catatan"})
			return
		}
		recordChatActivity(udb, tc, userID, req.DeviceID, phone, "note_added", "Catatan internal ditambahkan")
		c.JSON(http.StatusOK, gin.H{"note": note})
	}
}

// deleteInternalNote: hapus catatan — pemilik/admin boleh hapus apa saja,
// agent hanya catatannya sendiri.
func deleteInternalNote(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		tc := resolveTeamContext(c, db, userID)
		var note models.ChatInternalNote
		if err := udb.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&note).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Catatan tidak ditemukan"})
			return
		}
		if middleware.IsTeamAgentRole(tc.role) && (note.AuthorMemberID == nil || tc.memberID == nil || *note.AuthorMemberID != *tc.memberID) {
			c.JSON(http.StatusForbidden, gin.H{"message": "Hanya penulis yang bisa menghapus catatan ini"})
			return
		}
		if !tc.canWrite() {
			c.JSON(http.StatusForbidden, gin.H{"message": "Peran Anda hanya bisa melihat"})
			return
		}
		udb.Delete(&note)
		c.JSON(http.StatusOK, gin.H{"message": "Catatan dihapus"})
	}
}

// listChatActivity: jejak assign/status/label/catatan sebuah percakapan.
func listChatActivity(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		tc := resolveTeamContext(c, db, userID)
		phone := c.Param("phone")
		deviceID, _ := strconv.Atoi(c.Query("deviceId"))
		if deviceID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "deviceId wajib diisi"})
			return
		}
		if findConversationForTeam(udb, tc, userID, uint(deviceID), phone) == nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Percakapan tidak ditemukan"})
			return
		}
		var items []models.ChatActivity
		udb.Where("user_id = ? AND device_id = ? AND phone = ?", userID, deviceID, phone).
			Order("created_at DESC").Limit(100).Find(&items)
		c.JSON(http.StatusOK, gin.H{"activity": items})
	}
}

// teamMemberStats adalah ringkasan kinerja satu anggota tim.
type teamMemberStats struct {
	MemberID         *uint    `json:"memberId,omitempty"`
	MemberName       string   `json:"memberName"`
	AssignedOpen     int64    `json:"assignedOpen"`
	AssignedPending  int64    `json:"assignedPending"`
	Resolved         int64    `json:"resolved"`
	AvgFirstResponse *float64 `json:"avgFirstResponseSecs,omitempty"`
	AvgResolution    *float64 `json:"avgResolutionSecs,omitempty"`
}

// getTeamStats: ringkasan per anggota tim (aktif) + baris "Belum di-assign".
// Agent hanya melihat baris dirinya sendiri; owner/admin/viewer melihat semua.
func getTeamStats(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		tc := resolveTeamContext(c, db, userID)

		var members []models.TeamMember
		udb.Where("owner_id = ? AND is_active = ?", userID, true).Order("name ASC").Find(&members)

		// Satu baris agregat per assignee (termasuk NULL = belum di-assign).
		type agg struct {
			MemberID         *uint
			OpenCount        int64
			PendingCount     int64
			ResolvedCount    int64
			AvgFirstResponse *float64
			AvgResolution    *float64
		}
		var rows []agg
		udb.Model(&models.ChatConversation{}).
			Select(`assigned_member_id AS member_id,
				COUNT(*) FILTER (WHERE status IN ('open')) AS open_count,
				COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
				COUNT(*) FILTER (WHERE status IN ('resolved','done')) AS resolved_count,
				AVG(first_response_secs) AS avg_first_response,
				AVG(resolution_secs) AS avg_resolution`).
			Where("user_id = ?", userID).
			Group("assigned_member_id").Find(&rows)
		byMember := map[uint]*agg{}
		var unassigned *agg
		for i := range rows {
			if rows[i].MemberID == nil {
				unassigned = &rows[i]
			} else {
				byMember[*rows[i].MemberID] = &rows[i]
			}
		}

		stats := make([]teamMemberStats, 0, len(members)+1)
		knownIDs := map[uint]bool{}
		for _, m := range members {
			knownIDs[m.ID] = true
			if middleware.IsTeamAgentRole(tc.role) && (tc.memberID == nil || m.ID != *tc.memberID) {
				continue
			}
			s := teamMemberStats{MemberID: &m.ID, MemberName: m.Name}
			if a := byMember[m.ID]; a != nil {
				s.AssignedOpen, s.AssignedPending, s.Resolved = a.OpenCount, a.PendingCount, a.ResolvedCount
				s.AvgFirstResponse, s.AvgResolution = a.AvgFirstResponse, a.AvgResolution
			}
			stats = append(stats, s)
		}
		// Baris yatim: percakapan masih ter-assign ke anggota yang sudah
		// dihapus/dinonaktifkan — namanya diambil dari denormalisasi di
		// percakapan agar beban kerjanya tidak hilang diam-diam dari ringkasan.
		if len(byMember) > len(knownIDs) {
			type orphanName struct {
				MemberID *uint
				Name     string
			}
			var names []orphanName
			udb.Model(&models.ChatConversation{}).
				Select("assigned_member_id AS member_id, MAX(assigned_member_name) AS name").
				Where("user_id = ? AND assigned_member_id IS NOT NULL", userID).
				Group("assigned_member_id").Find(&names)
			for _, n := range names {
				if n.MemberID == nil || knownIDs[*n.MemberID] {
					continue
				}
				if middleware.IsTeamAgentRole(tc.role) && (tc.memberID == nil || *n.MemberID != *tc.memberID) {
					continue
				}
				a := byMember[*n.MemberID]
				if a == nil {
					continue
				}
				id := *n.MemberID
				stats = append(stats, teamMemberStats{
					MemberID: &id, MemberName: n.Name,
					AssignedOpen: a.OpenCount, AssignedPending: a.PendingCount, Resolved: a.ResolvedCount,
					AvgFirstResponse: a.AvgFirstResponse, AvgResolution: a.AvgResolution,
				})
			}
		}
		if !middleware.IsTeamAgentRole(tc.role) && unassigned != nil {
			stats = append(stats, teamMemberStats{
				MemberName:   "Belum di-assign",
				AssignedOpen: unassigned.OpenCount, AssignedPending: unassigned.PendingCount,
				Resolved:         unassigned.ResolvedCount,
				AvgFirstResponse: unassigned.AvgFirstResponse, AvgResolution: unassigned.AvgResolution,
			})
		}
		c.JSON(http.StatusOK, gin.H{"stats": stats})
	}
}
