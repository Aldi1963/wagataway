package security

// Enkripsi simetris AES-256-GCM untuk secret milik user (mis. API key AI).
// Kunci enkripsi diambil dari env AI_KEYS_SECRET; bila kosong, diturunkan
// dari JWT_SECRET agar tidak ada secret baru yang wajib dikonfigurasi.

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"os"
	"sync"
)

var (
	keyOnce sync.Once
	aeadKey []byte
)

// encryptionKey mengembalikan kunci 32-byte untuk AES-256.
func encryptionKey() []byte {
	keyOnce.Do(func() {
		secret := os.Getenv("AI_KEYS_SECRET")
		if secret == "" {
			secret = os.Getenv("JWT_SECRET")
		}
		if secret == "" {
			secret = "wagataway-dev-only"
		}
		sum := sha256.Sum256([]byte("wagataway-ai-keys-v1:" + secret))
		aeadKey = sum[:]
	})
	return aeadKey
}

// Encrypt mengenkripsi plaintext dan mengembalikan string base64
// "nonce|ciphertext". Gagal bila enkripsi gagal.
func Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", errors.New("nothing to encrypt")
	}
	block, err := aes.NewCipher(encryptionKey())
	if err != nil {
		return "", fmt.Errorf("cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("gcm: %w", err)
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := rand.Read(nonce); err != nil {
		return "", fmt.Errorf("nonce: %w", err)
	}
	ct := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ct), nil
}

// Decrypt mengembalikan plaintext dari hasil Encrypt.
func Decrypt(encoded string) (string, error) {
	raw, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "", fmt.Errorf("decode: %w", err)
	}
	block, err := aes.NewCipher(encryptionKey())
	if err != nil {
		return "", fmt.Errorf("cipher: %w", err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", fmt.Errorf("gcm: %w", err)
	}
	if len(raw) < gcm.NonceSize() {
		return "", errors.New("ciphertext too short")
	}
	nonce, ct := raw[:gcm.NonceSize()], raw[gcm.NonceSize():]
	pt, err := gcm.Open(nil, nonce, ct, nil)
	if err != nil {
		return "", fmt.Errorf("decrypt: %w", err)
	}
	return string(pt), nil
}
