package config

import (
	"os"
	"time"

	"github.com/joho/godotenv"
)

type Config struct {
	// Server
	Port    string
	GinMode string
	AppName string
	AppURL  string

	// Database
	DatabaseURL string

	// Redis
	RedisURL string

	// JWT
	JWTSecret string
	JWTExpiry time.Duration

	// WhatsApp
	WASessionsDir string

	// Email
	SMTPHost string
	SMTPPort string
	SMTPUser string
	SMTPPass string
	SMTPFrom string

	// AI
	OpenAIKey    string
	AnthropicKey string

	// Payment
	PaymentKey    string
	PaymentSecret string

	// Telegram
	TelegramBotToken string
	TelegramChatID   string
}

func Load() *Config {
	_ = godotenv.Load()

	expiry, _ := time.ParseDuration(getEnv("JWT_EXPIRY", "24h"))

	return &Config{
		Port:    getEnv("PORT", "8080"),
		GinMode: getEnv("GIN_MODE", "debug"),
		AppName: getEnv("APP_NAME", "WaGataway"),
		AppURL:  getEnv("APP_URL", "http://localhost:8080"),

		DatabaseURL: getEnv("DATABASE_URL", "postgres://user:password@localhost:5432/wagataway?sslmode=disable"),
		RedisURL:    getEnv("REDIS_URL", "redis://localhost:6379"),

		JWTSecret: getEnv("JWT_SECRET", "change-me-in-production"),
		JWTExpiry: expiry,

		WASessionsDir: getEnv("WA_SESSIONS_DIR", "./wa-sessions"),

		SMTPHost: getEnv("SMTP_HOST", ""),
		SMTPPort: getEnv("SMTP_PORT", "587"),
		SMTPUser: getEnv("SMTP_USER", ""),
		SMTPPass: getEnv("SMTP_PASS", ""),
		SMTPFrom: getEnv("SMTP_FROM", ""),

		OpenAIKey:    getEnv("OPENAI_API_KEY", ""),
		AnthropicKey: getEnv("ANTHROPIC_API_KEY", ""),

		PaymentKey:    getEnv("PAYMENT_GATEWAY_KEY", ""),
		PaymentSecret: getEnv("PAYMENT_GATEWAY_SECRET", ""),

		TelegramBotToken: getEnv("TELEGRAM_BOT_TOKEN", ""),
		TelegramChatID:   getEnv("TELEGRAM_CHAT_ID", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
