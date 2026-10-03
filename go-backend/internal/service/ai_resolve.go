package service

// Resolver koneksi AI milik user: semua fitur AI (auto-reply, tombol
// "Hasilkan Balasan AI", CS bot) lewat sini agar memakai API key + model
// pilihan user sendiri, bukan key global server.

import (
	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/security"
	"gorm.io/gorm"
)

// ConnectionForUser mengembalikan koneksi AI aktif milik user, atau nil bila
// user belum mengonfigurasi. Key tidak didekripsi di sini.
func ConnectionForUser(db *gorm.DB, userID uint) *models.AIConnection {
	var conn models.AIConnection
	if err := db.Where("user_id = ? AND is_active = ?", userID, true).
		First(&conn).Error; err != nil {
		return nil
	}
	return &conn
}

// ServiceForConnection membangun AIService dari koneksi user.
// Mengembalikan nil bila key tidak bisa didekripsi.
func ServiceForConnection(conn *models.AIConnection) *AIService {
	if conn == nil {
		return nil
	}
	key, err := security.Decrypt(conn.APIKeyEnc)
	if err != nil || key == "" {
		return nil
	}
	return NewAIServiceForConnection(AIProvider(conn.Provider), key, conn.BaseURL)
}

// EffectiveModel: model override (mis. dari config bot) bila diisi,
// sonst model dari koneksi, sonst default provider.
func EffectiveModel(conn *models.AIConnection, override string) string {
	if override != "" {
		return override
	}
	if conn != nil && conn.Model != "" {
		return conn.Model
	}
	return ""
}

// ValidProviders adalah daftar provider yang didukung.
var ValidProviders = []AIProvider{ProviderOpenAI, ProviderGemini, ProviderAnthropic, ProviderCustom}

// IsValidProvider memeriksa nama provider.
func IsValidProvider(p string) bool {
	for _, v := range ValidProviders {
		if AIProvider(p) == v {
			return true
		}
	}
	return false
}

// DefaultModelFor mengembalikan model bawaan suatu provider.
func DefaultModelFor(p AIProvider) string {
	if d, ok := ProviderDefaults[p]; ok {
		return d.Model
	}
	return "default"
}
