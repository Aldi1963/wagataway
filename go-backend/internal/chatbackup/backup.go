// Package chatbackup membangun cadangan percakapan harian (Item 11): satu
// file JSON per user+device berisi semua percakapan (ChatConversation) dan
// pesannya (ChatInbox). Dipakai job scheduler harian dan pemicu manual dari
// handler — logika tulis file + baris metadata tinggal di sini agar keduanya
// konsisten. File disimpan di disk server (Dir), bukan di DB, supaya DB
// tidak membengkak; tabel chat_backups hanya menyimpan metadata + penanda
// kepemilikan untuk otorisasi unduh.
package chatbackup

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"gorm.io/gorm"
)

// Dir adalah direktori akar file cadangan, relatif terhadap CWD server
// (~/workspace/wagataway di produksi). Di bawahnya: <userID>/<deviceID>/.
const Dir = "./data/chat-backups"

// RetentionDays: backup lebih tua dari ini dihapus file + barisnya oleh job
// harian (dan oleh pemicu manual setelah membuat backup baru).
const RetentionDays = 30

// MaxMessagesPerBackup membatasi ukuran satu file agar job harian tidak
// menulis file raksasa tanpa batas; bila tercapai, backup ditandai
// truncated dan pesan terlama yang terpotong tidak ikut.
const MaxMessagesPerBackup = 20000

// Pair adalah satu pasangan pemilik percakapan.
type Pair struct {
	UserID   uint
	DeviceID uint
}

// ListPairs mengembalikan semua pasangan (user, device) yang punya minimal
// satu percakapan — cakupan job backup harian.
func ListPairs(db *gorm.DB) ([]Pair, error) {
	var pairs []Pair
	err := db.Model(&models.ChatConversation{}).
		Select("DISTINCT user_id, device_id").
		Scan(&pairs).Error
	return pairs, err
}

// backupFile adalah isi JSON satu file cadangan.
type backupFile struct {
	Version       int          `json:"version"`
	UserID        uint         `json:"userId"`
	DeviceID      uint         `json:"deviceId"`
	GeneratedAt   time.Time    `json:"generatedAt"`
	Truncated     bool         `json:"truncated,omitempty"`
	Conversations []backupConv `json:"conversations"`
}

type backupConv struct {
	Phone        string      `json:"phone"`
	ContactName  string      `json:"contactName,omitempty"`
	Status       string      `json:"status,omitempty"`
	LastActivity time.Time   `json:"lastActivity,omitempty"`
	Messages     []backupMsg `json:"messages"`
}

type backupMsg struct {
	ID        uint      `json:"id"`
	Direction string    `json:"direction"`
	Type      string    `json:"type"`
	Content   string    `json:"content"`
	MediaURL  string    `json:"mediaUrl,omitempty"`
	CreatedAt time.Time `json:"createdAt"`
}

// Run membuat satu file cadangan untuk pasangan (userID, deviceID) dan
// mencatat baris chat_backups. Idempoten per hari di sisi pemanggil: job
// harian melewati pasangan yang sudah punya backup 'ready' hari ini.
// File ditulis atomik (temp + rename) agar unduh tidak pernah membaca
// file setengah jadi.
func Run(db *gorm.DB, userID, deviceID uint, now time.Time) (*models.ChatBackup, error) {
	rec := &models.ChatBackup{
		UserID:   userID,
		DeviceID: deviceID,
		Format:   "json",
		Status:   "failed",
	}

	var convs []models.ChatConversation
	if err := db.Where("user_id = ? AND device_id = ?", userID, deviceID).
		Order("last_activity ASC").Find(&convs).Error; err != nil {
		rec.ErrorMsg = err.Error()
		db.Create(rec)
		return rec, err
	}

	out := backupFile{
		Version:     1,
		UserID:      userID,
		DeviceID:    deviceID,
		GeneratedAt: now.UTC(),
	}
	remaining := MaxMessagesPerBackup
	for _, conv := range convs {
		bc := backupConv{
			Phone:        conv.Phone,
			ContactName:  conv.ContactName,
			Status:       conv.Status,
			LastActivity: conv.LastActivity,
		}
		if remaining <= 0 {
			out.Truncated = true
			bc.Messages = []backupMsg{}
			out.Conversations = append(out.Conversations, bc)
			continue
		}
		var msgs []models.ChatInbox
		if err := db.Where("user_id = ? AND device_id = ? AND phone = ?", userID, deviceID, conv.Phone).
			Order("created_at ASC").Limit(remaining + 1).Find(&msgs).Error; err != nil {
			rec.ErrorMsg = err.Error()
			db.Create(rec)
			return rec, err
		}
		if len(msgs) > remaining {
			out.Truncated = true
			msgs = msgs[:remaining]
		}
		remaining -= len(msgs)
		for _, m := range msgs {
			bc.Messages = append(bc.Messages, backupMsg{
				ID:        m.ID,
				Direction: m.Direction,
				Type:      m.Type,
				Content:   m.Content,
				MediaURL:  m.MediaURL,
				CreatedAt: m.CreatedAt,
			})
		}
		if bc.Messages == nil {
			bc.Messages = []backupMsg{}
		}
		out.Conversations = append(out.Conversations, bc)
		rec.MessageCount += len(bc.Messages)
	}
	rec.ConversationCount = len(convs)

	raw, err := json.Marshal(out)
	if err != nil {
		rec.ErrorMsg = err.Error()
		db.Create(rec)
		return rec, err
	}

	dir := filepath.Join(Dir, fmt.Sprint(userID), fmt.Sprint(deviceID))
	if err := os.MkdirAll(dir, 0o755); err != nil {
		rec.ErrorMsg = err.Error()
		db.Create(rec)
		return rec, err
	}
	fileName := fmt.Sprintf("chat-backup-%s.json", now.Format("2006-01-02"))
	relPath := filepath.Join(dir, fileName)
	tmpPath := relPath + ".tmp"
	if err := os.WriteFile(tmpPath, raw, 0o644); err != nil {
		rec.ErrorMsg = err.Error()
		db.Create(rec)
		return rec, err
	}
	if err := os.Rename(tmpPath, relPath); err != nil {
		os.Remove(tmpPath)
		rec.ErrorMsg = err.Error()
		db.Create(rec)
		return rec, err
	}

	rec.FileName = fileName
	rec.FilePath = relPath
	rec.SizeBytes = int64(len(raw))
	rec.Status = "ready"
	if err := db.Create(rec).Error; err != nil {
		return rec, err
	}
	return rec, nil
}

// HasReadyToday melaporkan apakah pasangan sudah punya backup 'ready'
// pada tanggal (waktu lokal server) yang diberikan — dipakai job harian
// agar satu hari hanya menghasilkan satu backup per pasangan.
func HasReadyToday(db *gorm.DB, userID, deviceID uint, now time.Time) bool {
	dayStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, now.Location())
	var count int64
	db.Model(&models.ChatBackup{}).
		Where("user_id = ? AND device_id = ? AND status = ? AND created_at >= ?",
			userID, deviceID, "ready", dayStart).
		Count(&count)
	return count > 0
}

// Prune menghapus backup (file + baris) milik pasangan yang lebih tua dari
// RetentionDays. Idempoten; file yang sudah hilang dari disk tidak
// menggagalkan penghapusan barisnya.
func Prune(db *gorm.DB, userID, deviceID uint, now time.Time) {
	cutoff := now.AddDate(0, 0, -RetentionDays)
	var old []models.ChatBackup
	if err := db.Where("user_id = ? AND device_id = ? AND created_at < ?",
		userID, deviceID, cutoff).Find(&old).Error; err != nil {
		return
	}
	for _, b := range old {
		if b.FilePath != "" {
			abs, err := filepath.Abs(b.FilePath)
			base, _ := filepath.Abs(Dir)
			// Jangan pernah hapus di luar direktori cadangan.
			if err == nil && (abs == base || len(abs) > len(base)) && abs[:len(base)] == base {
				os.Remove(abs)
			}
		}
		db.Delete(&b)
	}
}
