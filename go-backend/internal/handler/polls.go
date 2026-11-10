package handler

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// registerPollRoutes mendaftarkan endpoint rekap polling otomatis (Fitur 6).
func registerPollRoutes(rg *gin.RouterGroup, db *gorm.DB, wm *whatsapp.Manager) {
	polls := rg.Group("/polls")
	{
		polls.GET("", listPolls(db))
		polls.GET("/:id/results", getPollResults(db))
		polls.POST("/:id/close", closePoll(db))
		polls.POST("/:id/recap", sendPollRecap(db, wm))
	}
}

// pollOptionResult adalah hasil per opsi untuk respons API.
type pollOptionResult struct {
	Text  string `json:"text"`
	Votes int    `json:"votes"`
}

// pollResultResponse adalah bentuk respons GET /api/polls/:id/results.
type pollResultResponse struct {
	ID          uint               `json:"id"`
	Question    string             `json:"question"`
	Options     []pollOptionResult `json:"options"`
	TotalVotes  int                `json:"totalVotes"`
	TotalVoters int                `json:"totalVoters"`
	IsClosed    bool               `json:"isClosed"`
	IsGroup     bool               `json:"isGroup"`
	To          string             `json:"to"`
	DeviceID    uint               `json:"deviceId"`
	MessageID   string             `json:"messageId"`
	SentAt      *string            `json:"sentAt"`
}

// buildPollResult menghitung hasil vote sebuah poll dari DB.
func buildPollResult(db *gorm.DB, poll *models.Poll) pollResultResponse {
	options := poll.Options()
	counts := make([]int, len(options))
	type row struct {
		OptionIndex int
		Count       int64
	}
	var rows []row
	db.Model(&models.PollVote{}).
		Select("option_index, COUNT(*) as count").
		Where("poll_id = ?", poll.ID).
		Group("option_index").
		Scan(&rows)
	for _, r := range rows {
		if r.OptionIndex >= 0 && r.OptionIndex < len(counts) {
			counts[r.OptionIndex] = int(r.Count)
		}
	}
	var totalVoters int64
	db.Model(&models.PollVote{}).Where("poll_id = ?", poll.ID).Distinct("voter_phone").Count(&totalVoters)

	opts := make([]pollOptionResult, len(options))
	totalVotes := 0
	for i, opt := range options {
		opts[i] = pollOptionResult{Text: opt, Votes: counts[i]}
		totalVotes += counts[i]
	}
	var sentAt *string
	if poll.SentAt != nil {
		s := poll.SentAt.Format("2006-01-02T15:04:05Z07:00")
		sentAt = &s
	}
	return pollResultResponse{
		ID:          poll.ID,
		Question:    poll.Question,
		Options:     opts,
		TotalVotes:  totalVotes,
		TotalVoters: int(totalVoters),
		IsClosed:    poll.IsClosed,
		IsGroup:     poll.IsGroup,
		To:          poll.To,
		DeviceID:    poll.DeviceID,
		MessageID:   poll.MessageID,
		SentAt:      sentAt,
	}
}

// getUserPoll mengambil poll milik user atau 404.
func getUserPoll(c *gin.Context, db *gorm.DB, userID uint) (*models.Poll, bool) {
	id, err := strconv.ParseUint(c.Param("id"), 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "ID poll tidak valid", "code": "VALIDATION_ERROR"})
		return nil, false
	}
	var poll models.Poll
	if err := db.Where("id = ? AND user_id = ?", id, userID).First(&poll).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Poll tidak ditemukan", "code": "NOT_FOUND"})
		return nil, false
	}
	return &poll, true
}

// listPolls: GET /api/polls — daftar poll milik user beserta ringkasan vote.
func listPolls(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		page, _ := strconv.Atoi(c.DefaultQuery("page", "1"))
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
		if page < 1 {
			page = 1
		}
		if limit < 1 || limit > 100 {
			limit = 20
		}

		var total int64
		udb.Model(&models.Poll{}).Where("user_id = ?", userID).Count(&total)

		var polls []models.Poll
		if err := udb.Where("user_id = ?", userID).
			Order("id DESC").
			Offset((page - 1) * limit).Limit(limit).
			Find(&polls).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memuat daftar poll", "code": "DB_ERROR"})
			return
		}

		results := make([]pollResultResponse, 0, len(polls))
		for i := range polls {
			results = append(results, buildPollResult(udb, &polls[i]))
		}
		c.JSON(http.StatusOK, gin.H{"data": gin.H{"polls": results, "total": total, "page": page, "limit": limit}})
	}
}

// getPollResults: GET /api/polls/:id/results — hasil vote sebuah poll.
func getPollResults(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		poll, ok := getUserPoll(c, udb, userID)
		if !ok {
			return
		}
		c.JSON(http.StatusOK, gin.H{"data": buildPollResult(udb, poll)})
	}
}

// closePoll: POST /api/polls/:id/close — menandai poll selesai (rekap manual).
func closePoll(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		poll, ok := getUserPoll(c, udb, userID)
		if !ok {
			return
		}
		if err := udb.Model(poll).Update("is_closed", true).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menutup poll", "code": "DB_ERROR"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"message": "Poll ditutup", "data": buildPollResult(udb, poll)})
	}
}

// sendPollRecap: POST /api/polls/:id/recap {to} — kirim ringkasan hasil poll
// sebagai pesan teks via device yang sama dengan pengirim poll.
func sendPollRecap(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		poll, ok := getUserPoll(c, udb, userID)
		if !ok {
			return
		}
		var req struct {
			To string `json:"to" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Tujuan (to) wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}
		req.To = strings.TrimSpace(req.To)
		if req.To == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Tujuan (to) wajib diisi", "code": "VALIDATION_ERROR"})
			return
		}
		if !checkDeviceOwnership(c, udb, userID, poll.DeviceID) {
			return
		}

		// Kuota pesan bulanan (Fitur 3): tolak 429 bila habis.
		if !requireMessageQuota(c, udb, userID, 1) {
			return
		}

		result := buildPollResult(udb, poll)
		counts := make([]int, len(result.Options))
		options := make([]string, len(result.Options))
		for i, o := range result.Options {
			options[i] = o.Text
			counts[i] = o.Votes
		}
		text := whatsapp.BuildPollRecapText(result.Question, options, counts, result.TotalVoters)

		waID, err := wm.SendMessageWithOptions(poll.DeviceID, req.To, whatsapp.SendOptions{
			Type:    "text",
			Content: text,
		})
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal mengirim rekap: " + err.Error(), "code": "SEND_FAILED"})
			return
		}
		c.JSON(http.StatusOK, gin.H{
			"message": "Rekap hasil poll terkirim",
			"data":    gin.H{"to": req.To, "messageId": waID, "pollId": poll.ID},
		})
	}
}
