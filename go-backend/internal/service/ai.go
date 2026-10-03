package service

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

// AIProvider represents an AI provider (openai, gemini, anthropic, custom)
type AIProvider string

const (
	ProviderOpenAI    AIProvider = "openai"
	ProviderGemini    AIProvider = "gemini"
	ProviderAnthropic AIProvider = "anthropic"
	ProviderCustom    AIProvider = "custom" // OpenAI-compatible endpoint (base URL sendiri)
)

// ProviderDefaults: model bawaan + base URL tiap provider.
var ProviderDefaults = map[AIProvider]struct {
	BaseURL string
	Model   string
}{
	ProviderOpenAI:    {"https://api.openai.com/v1", "gpt-4o-mini"},
	ProviderGemini:    {"https://generativelanguage.googleapis.com/v1beta", "gemini-2.0-flash"},
	ProviderAnthropic: {"https://api.anthropic.com/v1", "claude-3-5-haiku-20241022"},
	ProviderCustom:    {"", "default"},
}

// CuratedModels: daftar model yang ditawarkan di dropdown UI per provider.
// Pengguna tetap bisa mengetik nama model lain secara manual.
var CuratedModels = map[AIProvider][]string{
	ProviderOpenAI:    {"gpt-4o-mini", "gpt-4o", "gpt-4.1-mini", "gpt-4.1"},
	ProviderGemini:    {"gemini-2.0-flash", "gemini-2.5-flash", "gemini-1.5-flash"},
	ProviderAnthropic: {"claude-3-5-haiku-20241022", "claude-sonnet-4-20250514"},
	ProviderCustom:    {},
}

// AIService handles AI chat completions
type AIService struct {
	OpenAIKey    string
	AnthropicKey string
	// Koneksi milik user (menggantikan key env bila diisi).
	Provider AIProvider
	APIKey   string
	BaseURL  string
	HTTPClient *http.Client
}

// aiHTTPClient: client dengan proxy dari env (wajib di sandbox Muse agar
// TLS ke API eksternal tidak gagal) + timeout.
func aiHTTPClient() *http.Client {
	tr := http.DefaultTransport.(*http.Transport).Clone()
	tr.Proxy = http.ProxyFromEnvironment
	return &http.Client{Timeout: 60 * time.Second, Transport: tr}
}

// NewAIService creates a new AI service (legacy: keys dari env)
func NewAIService(openaiKey, anthropicKey string) *AIService {
	return &AIService{
		OpenAIKey:    openaiKey,
		AnthropicKey: anthropicKey,
		HTTPClient:   aiHTTPClient(),
	}
}

// NewAIServiceForConnection membuat AI service dari koneksi milik user.
func NewAIServiceForConnection(provider AIProvider, apiKey, baseURL string) *AIService {
	return &AIService{
		Provider:   provider,
		APIKey:     apiKey,
		BaseURL:    baseURL,
		HTTPClient: aiHTTPClient(),
	}
}

// baseURLFor mengembalikan base URL efektif (custom bila diisi, default bila kosong).
func (s *AIService) baseURLFor(p AIProvider) string {
	if s.BaseURL != "" {
		return strings.TrimSuffix(s.BaseURL, "/")
	}
	if d, ok := ProviderDefaults[p]; ok {
		return d.BaseURL
	}
	return ""
}

// apiKeyFor mengembalikan API key efektif: dari koneksi user bila provider-nya
// cocok, sonst fallback ke key env (legacy).
func (s *AIService) apiKeyFor(p AIProvider) string {
	if s.Provider == p && s.APIKey != "" {
		return s.APIKey
	}
	switch p {
	case ProviderOpenAI, ProviderCustom:
		return s.OpenAIKey
	case ProviderAnthropic:
		return s.AnthropicKey
	}
	return ""
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
	case ProviderGemini:
		return s.completeGemini(req)
	case ProviderCustom:
		return s.completeOpenAICompatible(req)
	default:
		return s.completeOpenAI(req)
	}
}

func (s *AIService) defaultsFor(req ChatRequest) (model string, maxTokens int, temp float64) {
	model = req.Model
	maxTokens = req.MaxTokens
	if maxTokens == 0 {
		maxTokens = 500
	}
	temp = req.Temperature
	if temp == 0 {
		temp = 0.7
	}
	return model, maxTokens, temp
}

func (s *AIService) completeOpenAI(req ChatRequest) (*ChatResponse, error) {
	key := s.apiKeyFor(ProviderOpenAI)
	if key == "" {
		return nil, fmt.Errorf("OpenAI API key not configured")
	}
	model, maxTokens, temp := s.defaultsFor(req)
	if model == "" {
		model = ProviderDefaults[ProviderOpenAI].Model
	}
	return s.postChatCompletions(s.baseURLFor(ProviderOpenAI)+"/chat/completions", key, model, req.Messages, maxTokens, temp)
}

// completeOpenAICompatible dipakai untuk provider=custom: endpoint
// OpenAI-compatible (9router, OpenRouter, Ollama, dsb.).
func (s *AIService) completeOpenAICompatible(req ChatRequest) (*ChatResponse, error) {
	key := s.apiKeyFor(ProviderCustom)
	base := s.baseURLFor(ProviderCustom)
	if base == "" {
		return nil, fmt.Errorf("custom AI base URL not configured")
	}
	model, maxTokens, temp := s.defaultsFor(req)
	if model == "" {
		model = "default"
	}
	return s.postChatCompletions(base+"/chat/completions", key, model, req.Messages, maxTokens, temp)
}

func (s *AIService) postChatCompletions(url, key, model string, messages []ChatMessage, maxTokens int, temp float64) (*ChatResponse, error) {
	body := map[string]interface{}{
		"model":       model,
		"messages":    messages,
		"max_tokens":  maxTokens,
		"temperature": temp,
	}

	jsonBody, _ := json.Marshal(body)
	httpReq, _ := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	httpReq.Header.Set("Content-Type", "application/json")
	if key != "" {
		httpReq.Header.Set("Authorization", "Bearer "+key)
	}

	resp, err := s.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("AI request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("AI error %d: %s", resp.StatusCode, truncateAIError(string(respBody)))
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
		return nil, fmt.Errorf("failed to parse AI response: %w", err)
	}

	if len(result.Choices) == 0 {
		return nil, fmt.Errorf("AI returned no choices")
	}

	return &ChatResponse{
		Content: result.Choices[0].Message.Content,
		Tokens:  result.Usage.TotalTokens,
	}, nil
}

// truncateAIError memotong pesan error agar tidak membocorkan seluruh body.
func truncateAIError(s string) string {
	s = strings.TrimSpace(s)
	if len(s) > 300 {
		return s[:300] + "…"
	}
	return s
}


func (s *AIService) completeAnthropic(req ChatRequest) (*ChatResponse, error) {
	key := s.apiKeyFor(ProviderAnthropic)
	if key == "" {
		return nil, fmt.Errorf("Anthropic API key not configured")
	}

	model := req.Model
	if model == "" {
		model = ProviderDefaults[ProviderAnthropic].Model
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
	httpReq.Header.Set("x-api-key", key)
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

// completeGemini memanggil Google Generative Language API (generateContent).
// Bentuk API berbeda dari OpenAI: role "assistant" dipetakan ke "model",
// system prompt dikirim via system_instruction, auth via header x-goog-api-key.
func (s *AIService) completeGemini(req ChatRequest) (*ChatResponse, error) {
	key := s.apiKeyFor(ProviderGemini)
	if key == "" {
		return nil, fmt.Errorf("Gemini API key not configured")
	}
	model := req.Model
	if model == "" {
		model = ProviderDefaults[ProviderGemini].Model
	}
	maxTokens := req.MaxTokens
	if maxTokens == 0 {
		maxTokens = 500
	}
	temp := req.Temperature
	if temp == 0 {
		temp = 0.7
	}

	type part struct {
		Text string `json:"text"`
	}
	type content struct {
		Role  string `json:"role,omitempty"`
		Parts []part `json:"parts"`
	}
	var systemText string
	var contents []content
	for _, m := range req.Messages {
		switch m.Role {
		case "system":
			if systemText == "" {
				systemText = m.Content
			} else {
				systemText += "\n" + m.Content
			}
		case "assistant":
			contents = append(contents, content{Role: "model", Parts: []part{{Text: m.Content}}})
		default:
			contents = append(contents, content{Role: "user", Parts: []part{{Text: m.Content}}})
		}
	}

	body := map[string]interface{}{
		"contents": contents,
		"generationConfig": map[string]interface{}{
			"maxOutputTokens": maxTokens,
			"temperature":     temp,
		},
	}
	if systemText != "" {
		body["system_instruction"] = map[string]interface{}{
			"parts": []part{{Text: systemText}},
		}
	}

	jsonBody, _ := json.Marshal(body)
	url := s.baseURLFor(ProviderGemini) + "/models/" + model + ":generateContent"
	httpReq, _ := http.NewRequest("POST", url, bytes.NewReader(jsonBody))
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("x-goog-api-key", key)

	resp, err := s.HTTPClient.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("Gemini request failed: %w", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("Gemini error %d: %s", resp.StatusCode, truncateAIError(string(respBody)))
	}

	var result struct {
		Candidates []struct {
			Content struct {
				Parts []struct {
					Text string `json:"text"`
				} `json:"parts"`
			} `json:"content"`
		} `json:"candidates"`
		UsageMetadata struct {
			TotalTokenCount int `json:"totalTokenCount"`
		} `json:"usageMetadata"`
		Error struct {
			Message string `json:"message"`
		} `json:"error"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("failed to parse Gemini response: %w", err)
	}
	if result.Error.Message != "" {
		return nil, fmt.Errorf("Gemini error: %s", result.Error.Message)
	}
	if len(result.Candidates) == 0 || len(result.Candidates[0].Content.Parts) == 0 {
		return nil, fmt.Errorf("Gemini returned no content")
	}

	var sb strings.Builder
	for _, p := range result.Candidates[0].Content.Parts {
		sb.WriteString(p.Text)
	}
	return &ChatResponse{
		Content: strings.TrimSpace(sb.String()),
		Tokens:  result.UsageMetadata.TotalTokenCount,
	}, nil
}
