package security

// Enkripsi simetris AES-256-GCM untuk secret milik user (mis. API key AI).
// Kunci enkripsi diambil dari env AI_KEYS_SECRET; bila kosong, diturunkan
// dari JWT_SECRET agar tidak ada secret baru yang wajib dikonfigurasi.
// Bila keduanya kosong, enkripsi GAGAL (fail-closed) — tidak ada secret
// default bawaan. (Secret default lama dihapus 11 Nov 2026 sebelum repo
// dibuka publik; jangan kembalikan fallback apa pun.)

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
	keyErr  error
)

// encryptionKey mengembalikan kunci 32-byte untuk AES-256.
// FAIL-CLOSED: bila AI_KEYS_SECRET dan JWT_SECRET keduanya kosong,
// kembalikan error — tidak ada secret default yang dipakai diam-diam.
func encryptionKey() ([]byte, error) {
	keyOnce.Do(func() {
		secret := os.Getenv("AI_KEYS_SECRET")
		if secret == "" {
			secret = os.Getenv("JWT_SECRET")
		}
		if secret == "" {
			keyErr = errors.New("AI_KEYS_SECRET atau JWT_SECRET belum di-set")
			return
		}
		sum := sha256.Sum256([]byte("wagataway-ai-keys-v1:" + secret))
		aeadKey = sum[:]
	})
	if keyErr != nil {
		return nil, keyErr
	}
	return aeadKey, nil
}

// Encrypt mengenkripsi plaintext dan mengembalikan string base64
// "nonce|ciphertext". Gagal bila enkripsi gagal.
func Encrypt(plaintext string) (string, error) {
	if plaintext == "" {
		return "", errors.New("nothing to encrypt")
	}
	key, err := encryptionKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
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
	key, err := encryptionKey()
	if err != nil {
		return "", err
	}
	block, err := aes.NewCipher(key)
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
