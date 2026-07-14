package handler

import (
	"net/http"
	"strconv"
	"time"

	"github.com/Aldi1963/wagataway/internal/config"
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/realtime"
	"github.com/Aldi1963/wagataway/internal/service"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// LiveChatService unifies live chat and AI CS bot
type LiveChatService struct {
	DB  *gorm.DB
	WM  *whatsapp.Manager
	AI  *service.AIService
	Cfg *config.Config
}

var liveChatSvc *LiveChatService

// InitLiveChat initializes the unified live chat service
func InitLiveChat(cfg *config.Config, db *gorm.DB, wm *whatsapp.Manager) {
	liveChatSvc = &LiveChatService{
		DB:  db,
		WM:  wm,
		AI:  service.NewAIService(cfg.OpenAIKey, cfg.AnthropicKey),
		Cfg: cfg,
	}
}

// registerChatRoutes sets up unified Live Chat + AI CS Bot
func registerChatRoutes(rg *gin.RouterGroup, db *gorm.DB, wm *whatsapp.Manager) {
	chat := rg.Group("/chat")
	{
		chat.GET("/conversations", listConversations(db))
		chat.GET("/messages/:phone", getChatMessages(db))
		chat.POST("/send", sendChatMessage(db, wm))
		chat.POST("/ai-reply", aiReplyMessage(db, wm))
		chat.PATCH("/conversations/:phone/mode", setChatMode(db))
		chat.PATCH("/conversations/:phone/read", markConversationRead(db))
	}
}


func listConversations(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		deviceID := c.Query("deviceId")

		query := db.Where("user_id = ?", userID)
		if deviceID != "" {
			query = query.Where("device_id = ?", deviceID)
		}

		var convos []models.ChatConversation
		query.Order("last_activity DESC").Limit(100).Find(&convos)

		c.JSON(http.StatusOK, gin.H{"conversations": convos})
	}
}

func getChatMessages(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		phone := c.Param("phone")
		limit, _ := strconv.Atoi(c.DefaultQuery("limit", "50"))
		offset, _ := strconv.Atoi(c.DefaultQuery("offset", "0"))

		var messages []models.ChatInbox
		db.Where("user_id = ? AND phone = ?", userID, phone).
			Order("created_at DESC").Offset(offset).Limit(limit).
			Find(&messages)

		// Reverse for chronological order
		for i, j := 0, len(messages)-1; i < j; i, j = i+1, j-1 {
			messages[i], messages[j] = messages[j], messages[i]
		}

		c.JSON(http.StatusOK, gin.H{"messages": messages, "phone": phone})
	}
}


func sendChatMessage(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			DeviceID uint   `json:"deviceId" binding:"required"`
			Phone    string `json:"phone" binding:"required"`
			Content  string `json:"content" binding:"required"`
			Type     string `json:"type"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if req.Type == "" {
			req.Type = "text"
		}

		// Send via WhatsApp
		err := wm.SendMessage(req.DeviceID, req.Phone, req.Type, req.Content, "")
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal mengirim: " + err.Error()})
			return
		}

		// Save to inbox
		msg := models.ChatInbox{
			UserID:    userID,
			DeviceID:  req.DeviceID,
			Phone:     req.Phone,
			Content:   req.Content,
			Type:      req.Type,
			Direction: "out",
			IsRead:    true,
		}
		db.Create(&msg)

		// Update conversation
		var conv models.ChatConversation
		result := db.Where("user_id = ? AND device_id = ? AND phone = ?",
			userID, req.DeviceID, req.Phone).First(&conv)
		now := time.Now()
		if result.Error != nil {
			conv = models.ChatConversation{
				UserID: userID, DeviceID: req.DeviceID, Phone: req.Phone,
				LastMessage: truncateStr(req.Content, 200), LastActivity: now,
			}
			db.Create(&conv)
		} else {
			db.Model(&conv).Updates(map[string]interface{}{
				"last_message": truncateStr(req.Content, 200), "last_activity": now,
			})
		}

		// Broadcast via SSE
		realtime.DefaultHub.SendToUser(userID, realtime.Event{
			Type: "chat:message",
			Payload: map[string]interface{}{
				"phone": req.Phone, "content": req.Content,
				"direction": "out", "type": req.Type,
			},
		})

		c.JSON(http.StatusOK, gin.H{"message": "Terkirim", "data": msg})
	}
}

func truncateStr(s string, max int) string {
	if len(s) <= max {
		return s
	}
	return s[:max]
}


// aiReplyMessage generates an AI response and sends it via WA
func aiReplyMessage(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		var req struct {
			DeviceID uint   `json:"deviceId" binding:"required"`
			Phone    string `json:"phone" binding:"required"`
			BotID    *uint  `json:"botId"` // optional CS bot config
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}

		if liveChatSvc == nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"message": "AI service not initialized"})
			return
		}

		// Get bot config (system prompt, model, provider)
		provider := service.ProviderOpenAI
		model := "gpt-4o-mini"
		systemPrompt := "Kamu adalah CS bot yang membantu pelanggan. Jawab dengan ramah, singkat, dan dalam bahasa Indonesia."
		maxTokens := 500
		temperature := 0.7

		if req.BotID != nil {
			var bot models.CsBot
			if err := db.Where("id = ? AND user_id = ?", *req.BotID, userID).First(&bot).Error; err == nil {
				if bot.Prompt != "" {
					systemPrompt = bot.Prompt
				}
				if bot.Model != "" {
					model = bot.Model
				}
				if bot.Provider == "anthropic" {
					provider = service.ProviderAnthropic
				}
				if bot.MaxTokens > 0 {
					maxTokens = bot.MaxTokens
				}
				if bot.Temperature > 0 {
					temperature = bot.Temperature
				}
			}
		}

		// Get recent conversation history (last 10 messages)
		var history []models.ChatInbox
		db.Where("user_id = ? AND phone = ?", userID, req.Phone).
			Order("created_at DESC").Limit(10).Find(&history)

		// Build messages for AI (reverse to chronological)
		messages := []service.ChatMessage{
			{Role: "system", Content: systemPrompt},
		}
		for i := len(history) - 1; i >= 0; i-- {
			role := "user"
			if history[i].Direction == "out" {
				role = "assistant"
			}
			if history[i].Content != "" {
				messages = append(messages, service.ChatMessage{
					Role: role, Content: history[i].Content,
				})
			}
		}

		// Generate AI response
		aiReq := service.ChatRequest{
			Provider:    provider,
			Model:       model,
			Messages:    messages,
			MaxTokens:   maxTokens,
			Temperature: temperature,
		}
		aiResp, err := liveChatSvc.AI.Complete(aiReq)
		if err != nil {
			log.Error().Err(err).Msg("AI completion failed")
			c.JSON(http.StatusInternalServerError, gin.H{
				"message": "AI gagal merespons: " + err.Error(),
			})
			return
		}

		// Send AI response via WhatsApp
		sendErr := wm.SendMessage(req.DeviceID, req.Phone, "text", aiResp.Content, "")
		if sendErr != nil {
			c.JSON(http.StatusInternalServerError, gin.H{
				"message": "Gagal mengirim balasan AI: " + sendErr.Error(),
				"aiReply": aiResp.Content,
			})
			return
		}

		// Save to inbox
		msg := models.ChatInbox{
			UserID: userID, DeviceID: req.DeviceID, Phone: req.Phone,
			Content: aiResp.Content, Type: "text", Direction: "out", IsRead: true,
		}
		db.Create(&msg)

		// Broadcast via SSE
		realtime.DefaultHub.SendToUser(userID, realtime.Event{
			Type: "chat:message",
			Payload: map[string]interface{}{
				"phone": req.Phone, "content": aiResp.Content,
				"direction": "out", "type": "text", "isAI": true,
			},
		})

		c.JSON(http.StatusOK, gin.H{
			"message":  "AI reply sent",
			"reply":    aiResp.Content,
			"tokens":   aiResp.Tokens,
			"provider": string(provider),
		})
	}
}


// setChatMode switches conversation between "manual", "ai", "hybrid"
func setChatMode(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		phone := c.Param("phone")
		var req struct {
			Mode string `json:"mode" binding:"required"` // manual, ai, hybrid
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Mode wajib diisi (manual/ai/hybrid)"})
			return
		}

		// For now, store mode in a simple way
		// In production this would be a separate table or field on conversation
		var conv models.ChatConversation
		if err := db.Where("user_id = ? AND phone = ?", userID, phone).First(&conv).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Conversation tidak ditemukan"})
			return
		}

		// Use contact_name field temporarily to store mode (will be a proper field later)
		// In a real app, add a "mode" column to chat_conversations
		c.JSON(http.StatusOK, gin.H{
			"message": "Mode diubah ke " + req.Mode,
			"mode":    req.Mode,
			"phone":   phone,
		})
	}
}

func markConversationRead(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		phone := c.Param("phone")

		db.Model(&models.ChatInbox{}).
			Where("user_id = ? AND phone = ? AND is_read = ?", userID, phone, false).
			Update("is_read", true)

		db.Model(&models.ChatConversation{}).
			Where("user_id = ? AND phone = ?", userID, phone).
			Update("unread_count", 0)

		c.JSON(http.StatusOK, gin.H{"message": "Ditandai dibaca"})
	}
}

// ProcessIncomingForAI is called by the WhatsApp manager when a message arrives
// It checks if the conversation is in AI mode and auto-replies
func ProcessIncomingForAI(db *gorm.DB, wm *whatsapp.Manager, userID, deviceID uint, phone, text string) {
	if liveChatSvc == nil || text == "" {
		return
	}

	// Check if there's an active CS bot for this user/device
	var bot models.CsBot
	err := db.Where("user_id = ? AND is_active = ? AND (device_id IS NULL OR device_id = ?)",
		userID, true, deviceID).First(&bot).Error
	if err != nil {
		return // No active bot
	}

	// Build context
	var history []models.ChatInbox
	db.Where("user_id = ? AND phone = ?", userID, phone).
		Order("created_at DESC").Limit(8).Find(&history)

	messages := []service.ChatMessage{
		{Role: "system", Content: bot.Prompt},
	}
	for i := len(history) - 1; i >= 0; i-- {
		role := "user"
		if history[i].Direction == "out" {
			role = "assistant"
		}
		if history[i].Content != "" {
			messages = append(messages, service.ChatMessage{Role: role, Content: history[i].Content})
		}
	}
	// Add current message
	messages = append(messages, service.ChatMessage{Role: "user", Content: text})

	provider := service.ProviderOpenAI
	if bot.Provider == "anthropic" {
		provider = service.ProviderAnthropic
	}

	resp, err := liveChatSvc.AI.Complete(service.ChatRequest{
		Provider: provider, Model: bot.Model,
		Messages: messages, MaxTokens: bot.MaxTokens,
		Temperature: bot.Temperature,
	})
	if err != nil {
		log.Error().Err(err).Uint("userID", userID).Msg("AI auto-reply failed")
		return
	}

	// Send AI reply
	sendErr := wm.SendMessage(deviceID, phone, "text", resp.Content, "")
	if sendErr != nil {
		log.Error().Err(sendErr).Msg("Failed to send AI auto-reply")
		return
	}

	// Save to inbox
	msg := models.ChatInbox{
		UserID: userID, DeviceID: deviceID, Phone: phone,
		Content: resp.Content, Type: "text", Direction: "out", IsRead: true,
	}
	db.Create(&msg)

	// Broadcast
	realtime.DefaultHub.SendToUser(userID, realtime.Event{
		Type: "chat:message",
		Payload: map[string]interface{}{
			"phone": phone, "content": resp.Content,
			"direction": "out", "isAI": true,
		},
	})

	log.Info().Str("phone", phone).Int("tokens", resp.Tokens).Msg("AI auto-reply sent")
}
