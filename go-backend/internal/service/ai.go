package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// AIProvider represents an AI provider (openai, anthropic)
type AIProvider string

const (
	ProviderOpenAI    AIProvider = "openai"
	ProviderAnthropic AIProvider = "anthropic"
)

// AIService handles AI chat completions
type AIService struct {
	OpenAIKey    string
	AnthropicKey string
	HTTPClient   *http.Client
}

// NewAIService creates a new AI service
func NewAIService(openaiKey, anthropicKey string) *AIService {
	return &AIService{
		OpenAIKey:    openaiKey,
		AnthropicKey: anthropicKey,
		HTTPClient:   &http.Client{Timeout: 60 * time.Second},
	}
}

// ChatMessage represents a message in conversation
type ChatMessage struct {
	Role    string `json:"role"` // system, user, assistant
	Content string `json:"content"`
}

// ChatRequest holds parameters for AI completion
type ChatRequest struct {
	Provider    AIProvider
	Model       string
	Messages    []ChatMessage
	MaxTokens   int
	Temperature float64
}

// ChatResponse holds the AI response
type ChatResponse struct {
	Content string
	Tokens  int
}


// Complete sends a chat completion request to the configured provider
func (s *AIService) Complete(req ChatRequest) (*ChatResponse, error) {
	switch req.Provider {
	case ProviderAnthropic:
		return s.completeAnthropic(req)
	default:
		return s.completeOpenAI(req)
	}
}

func (s *AIService) completeOpenAI(req ChatRequest) (*ChatResponse, error) {
	if s.OpenAIKey == "" {
		return nil, fmt.Errorf("OpenAI API key not configured")
	}

	model := req.Model
	if model == "" {
		model = "gpt-4o-mini"
	}
	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = 500
	}
	temp := req.Temperature
	if temp == 0 {
		temp = 0.7
	}

	body := map[string]interface{}{
		"model":       model,
		"messages":    req.Messages,
		"max_tokens":  maxTokens,
		"temperature": temp,
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, _ := http.NewRequest("POST", "https://api.openai.com/v1/chat/completions", bytes.NewReader(jsonBody))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+s.OpenAIKey)

	resp, err := s.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("OpenAI request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("OpenAI error %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
		Usage struct {
			TotalTokens int `json:"total_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse OpenAI response: %w", err)
	}

	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("OpenAI returned no choices")
	}

	return &ChatResponse{
		Content: result.Choices[0].Message.Content,
		Tokens:  result.Usage.TotalTokens,
	}, nil
}


func (s *AIService) completeAnthropic(req ChatRequest) (*ChatResponse, error) {
	if s.AnthropicKey == "" {
		return nil, fmt.Errorf("Anthropic API key not configured")
	}

	model := req.Model
	if model == "" {
		model = "claude-3-5-haiku-20241022"
	}
	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = 500
	}

	// Extract system message
	systemMsg := ""
	messages := []map[string]string{}
	for _, m := range req.Messages {
		if m.Role == "system" {
			systemMsg = m.Content
		} else {
			messages = append(messages, map[string]string{
				"role":    m.Role,
				"content": m.Content,
			})
		}
	}

	body := map[string]interface{}{
		"model":      model,
		"max_tokens": maxTokens,
		"messages":   messages,
	}
	if systemMsg != "" {
		body["system"] = systemMsg
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, _ := http.NewRequest("POST", "https://api.anthropic.com/v1/messages", bytes.NewReader(jsonBody))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", s.AnthropicKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")

	resp, err := s.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("Anthropic request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("Anthropic error %d: %s", resp.StatusCode, string(respBody))
	}

	var result struct {
		Content []struct {
			Text string `json:"text"`
		} `json:"content"`
		Usage struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse Anthropic response: %w", err)
	}

	if len(result.Content) == 0 {
		return nil, fmt.Errorf("Anthropic returned no content")
	}

	return &ChatResponse{
		Content: result.Content[0].Text,
		Tokens:  result.Usage.InputTokens + result.Usage.OutputTokens,
	}, nil
}


// Complete sends a chat completion to the configured AI
func (s *AIService) Complete(req ChatRequest) (*ChatResponse, error) {
	switch req.Provider {
	case ProviderAnthropic:
		return s.completeAnthropic(req)
	default:
		return s.completeOpenAI(req)
	}
}

func (s *AIService) completeOpenAI(req ChatRequest) (*ChatResponse, error) {
	if s.OpenAIKey == "" {
		return nil, fmt.Errorf("OpenAI API key not configured")
	}
	model := req.Model
	if model == "" {
		model = "gpt-4o-mini"
	}
	maxTok := req.MaxTokens
	if maxTok == 0 {
		maxTok = 500
	}
	temp := req.Temperature
	if temp == 0 {
		temp = 0.7
	}
	body := map[string]interface{}{
		"model": model, "messages": req.Messages,
		"max_tokens": maxTok, "temperature": temp,
	}
	jsonBody, _ := json.Marshal(body)
	httpReq, _ := http.NewRequest("POST",
		"https://api.openai.com/v1/chat/completions",
		bytes.NewReader(jsonBody))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Authorization", "Bearer "+s.OpenAIKey)
	resp, err := s.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("OpenAI %d: %s", resp.StatusCode, respBody)
	}
	var r struct {
		Choices []struct {
			Message struct{ Content string } `json:"message"`
		} `json:"choices"`
		Usage struct{ TotalTokens int `json:"total_tokens"` } `json:"usage"`
	}
	json.Unmarshal(respBody, &r)
	if len(r.Choices) == 0 {
		return nil, fmt.Errorf("no choices")
	}
	return &ChatResponse{Content: r.Choices[0].Message.Content, Tokens: r.Usage.TotalTokens}, nil
}


func (s *AIService) completeAnthropic(req ChatRequest) (*ChatResponse, error) {
	if s.AnthropicKey == "" {
		return nil, fmt.Errorf("Anthropic API key not configured")
	}
	model := req.Model
	if model == "" {
		model = "claude-3-5-haiku-20241022"
	}
	maxTok := req.MaxTokens
	if maxTok == 0 {
		maxTok = 500
	}
	systemMsg := ""
	msgs := []map[string]string{}
	for _, m := range req.Messages {
		if m.Role == "system" {
			systemMsg = m.Content
		} else {
			msgs = append(msgs, map[string]string{"role": m.Role, "content": m.Content})
		}
	}
	body := map[string]interface{}{
		"model": model, "max_tokens": maxTok, "messages": msgs,
	}
	if systemMsg != "" {
		body["system"] = systemMsg
	}
	jsonBody, _ := json.Marshal(body)
	httpReq, _ := http.NewRequest("POST",
		"https://api.anthropic.com/v1/messages",
		bytes.NewReader(jsonBody))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-api-key", s.AnthropicKey)
	httpReq.Header.Set("anthropic-version", "2023-06-01")
	resp, err := s.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("Anthropic %d: %s", resp.StatusCode, respBody)
	}
	var r struct {
		Content []struct{ Text string } `json:"content"`
		Usage   struct {
			InputTokens  int `json:"input_tokens"`
			OutputTokens int `json:"output_tokens"`
		} `json:"usage"`
	}
	json.Unmarshal(respBody, &r)
	if len(r.Content) == 0 {
		return nil, fmt.Errorf("no content")
	}
	return &ChatResponse{
		Content: r.Content[0].Text,
		Tokens:  r.Usage.InputTokens + r.Usage.OutputTokens,
	}, nil
}
