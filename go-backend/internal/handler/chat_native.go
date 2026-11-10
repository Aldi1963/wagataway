package handler

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/realtime"
	"github.com/Aldi1963/wagataway/internal/rls"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// ── Helper murni (ada unit test) ─────────────────────────────────────────────

// maxReactionRunes: batas panjang emoji reaksi (8 rune; "" = hapus reaksi).
const maxReactionRunes = 8

// validateReactionEmoji memeriksa emoji reaksi: boleh kosong (hapus reaksi),
// selain itu maksimal 8 rune.
func validateReactionEmoji(emoji string) bool {
	return utf8.RuneCountInString(emoji) <= maxReactionRunes
}

// chatMediaURLToLocalPath mengubah URL publik media chat ("/uploads/chat/<nama>")
// menjadi path file:// server-side untuk dikirim via WhatsApp. Hanya menerima
// nama file datar (tanpa subdirektori / traversal); input lain ditolak agar
// caller tidak bisa membaca file sembarang lewat prefix file://.
func chatMediaURLToLocalPath(mediaURL string) (string, bool) {
	const prefix = "/uploads/chat/"
	if !strings.HasPrefix(mediaURL, prefix) {
		return "", false
	}
	name := strings.TrimPrefix(mediaURL, prefix)
	if name == "" || name != filepath.Base(name) || strings.Contains(name, "..") {
		return "", false
	}
	return "file://" + whatsapp.ChatUploadsDir + "/" + name, true
}

// chatMediaTypeGroups memetakan filter query tab Media ke tipe chat_inbox.
// "" → semua bermedia (nil). ok=false bila filter tidak dikenal.
func chatMediaTypeGroups(filter string) (types []string, ok bool) {
	switch filter {
	case "":
		return nil, true
	case "image":
		return []string{"image", "video"}, true
	case "document":
		return []string{"document", "audio", "voicenote", "voice"}, true
	default:
		return nil, false
	}
}

// ── POST /api/chat/upload ────────────────────────────────────────────────────

// chatUploadMaxBytes: batas ukuran media chat (16MB, sesuai batas WhatsApp).
const chatUploadMaxBytes = 16 << 20

// chatAllowedMimes memetakan mime hasil sniffing konten -> ekstensi aman.
var chatAllowedMimes = map[string]string{
	"image/jpeg":      ".jpg",
	"image/png":       ".png",
	"image/gif":       ".gif",
	"image/webp":      ".webp",
	"video/mp4":       ".mp4",
	"audio/mpeg":      ".mp3",
	"audio/ogg":       ".ogg",
	"application/ogg": ".ogg",
	"audio/webm":      ".webm",
	"video/webm":      ".webm",
	"audio/mp4":       ".m4a",
	"application/pdf": ".pdf",
}

// uploadChatMedia menerima multipart field "file", menyimpan ke
// ./public/uploads/chat/<acak>.<ext>, dan mengembalikan URL publik.
// Untuk voice note webm: dicoba konversi ke ogg/opus via ffmpeg bila tersedia
// (best effort); bila gagal, file webm disimpan apa adanya.
func uploadChatMedia(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		// Auth: pastikan request terautentikasi (media chat milik user yang login).
		_ = middleware.GetUserID(c)

		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, chatUploadMaxBytes+1<<20)
		fh, header, err := c.Request.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Field 'file' wajib diisi (multipart form)"})
			return
		}
		defer fh.Close()

		if header.Size > chatUploadMaxBytes {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Ukuran file maksimal 16MB"})
			return
		}

		// Sniff mime dari isi file — jangan percaya Content-Type client.
		sniff := make([]byte, 512)
		n, _ := io.ReadFull(fh, sniff)
		if _, err := fh.Seek(0, io.SeekStart); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membaca file"})
			return
		}
		mime := http.DetectContentType(sniff[:n])
		ext, ok := chatAllowedMimes[mime]
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"message": fmt.Sprintf("Tipe file tidak didukung: %s", mime)})
			return
		}

		var rb [16]byte
		if _, err := rand.Read(rb[:]); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memproses file"})
			return
		}
		fileName := hex.EncodeToString(rb[:]) + ext

		if err := os.MkdirAll(whatsapp.ChatUploadsDir, 0o755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyiapkan penyimpanan"})
			return
		}
		dst := filepath.Join(whatsapp.ChatUploadsDir, fileName)
		out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan file"})
			return
		}
		size, copyErr := io.Copy(out, fh)
		closeErr := out.Close()
		if copyErr != nil || closeErr != nil || size > chatUploadMaxBytes {
			os.Remove(dst)
			c.JSON(http.StatusBadRequest, gin.H{"message": "Ukuran file maksimal 16MB"})
			return
		}

		// Voice note webm → coba konversi ke ogg/opus (best effort).
		if ext == ".webm" {
			if oggName, ok := convertWebmToOgg(dst, hex.EncodeToString(rb[:])); ok {
				os.Remove(dst)
				fileName = oggName
				dst = filepath.Join(whatsapp.ChatUploadsDir, fileName)
				mime = "audio/ogg"
				if fi, serr := os.Stat(dst); serr == nil {
					size = fi.Size()
				}
			}
		}

		c.JSON(http.StatusCreated, gin.H{
			"url":  "/uploads/chat/" + fileName,
			"mime": mime,
			"size": size,
		})
	}
}

// convertWebmToOgg mengonversi file webm ke ogg/opus via ffmpeg.
// Mengembalikan nama file hasil bila sukses. Best effort: false bila ffmpeg
// tidak ada / konversi gagal (caller tetap memakai file webm asli).
func convertWebmToOgg(srcPath, hexName string) (string, bool) {
	ffmpeg, err := exec.LookPath("ffmpeg")
	if err != nil {
		return "", false
	}
	outName := hexName + ".ogg"
	outPath := filepath.Join(whatsapp.ChatUploadsDir, outName)
	ctx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, ffmpeg, "-y", "-loglevel", "error",
		"-i", srcPath, "-c:a", "libopus", outPath)
	if err := cmd.Run(); err != nil {
		os.Remove(outPath)
		return "", false
	}
	if fi, err := os.Stat(outPath); err != nil || fi.Size() == 0 {
		os.Remove(outPath)
		return "", false
	}
	return outName, true
}

// ── POST /api/chat/react ─────────────────────────────────────────────────────

// reactToMessage mengirim reaksi emoji ke sebuah pesan via WhatsApp,
// menyimpan ke kolom Reactions, dan menyiarkan SSE chat:reaction.
// Body: {deviceId, phone, waMessageId, emoji}; emoji "" = hapus reaksi.
func reactToMessage(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req struct {
			DeviceID    uint   `json:"deviceId" binding:"required"`
			Phone       string `json:"phone" binding:"required"`
			WaMessageID string `json:"waMessageId" binding:"required"`
			Emoji       string `json:"emoji"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}
		if !validateReactionEmoji(req.Emoji) {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Emoji terlalu panjang"})
			return
		}

		// Cari pesan yang dituju untuk tahu direction (fromMe untuk MessageKey).
		var target models.ChatInbox
		if err := udb.Where("user_id = ? AND device_id = ? AND wa_message_id = ?",
			userID, req.DeviceID, req.WaMessageID).First(&target).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Pesan tidak ditemukan"})
			return
		}

		to := resolveSenderJID(udb, userID, req.DeviceID, req.Phone)
		if err := wm.SendReaction(req.DeviceID, to, req.WaMessageID, target.Direction == "out", req.Emoji); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal mengirim reaksi: " + err.Error()})
			return
		}

		reactions := whatsapp.AddChatReaction(target.Reactions, req.Emoji, true)
		udb.Model(&target).Update("reactions", reactions)

		realtime.DefaultHub.SendToUser(userID, realtime.Event{
			Type: "chat:reaction",
			Payload: map[string]interface{}{
				"deviceId":    req.DeviceID,
				"phone":       req.Phone,
				"waMessageId": req.WaMessageID,
				"emoji":       req.Emoji,
				"fromMe":      true,
			},
		})

		c.JSON(http.StatusOK, gin.H{"message": "OK", "reactions": reactions})
	}
}

// ── DELETE /api/chat/messages/:id ────────────────────────────────────────────

// deleteChatMessage me-revoke pesan terkirim ("hapus untuk semua") via
// WhatsApp, lalu menandai IsDeleted + mengosongkan konten/media.
func deleteChatMessage(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		id := c.Param("id")

		var msg models.ChatInbox
		if err := udb.Where("id = ? AND user_id = ?", id, userID).First(&msg).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Pesan tidak ditemukan"})
			return
		}
		if msg.Direction != "out" {
			c.JSON(http.StatusForbidden, gin.H{"message": "Hanya pesan terkirim yang bisa dihapus untuk semua"})
			return
		}
		if msg.WaMessageID == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Pesan lama tidak mendukung hapus untuk semua"})
			return
		}

		to := resolveSenderJID(udb, userID, msg.DeviceID, msg.Phone)
		if err := wm.RevokeMessage(msg.DeviceID, to, msg.WaMessageID); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menghapus: " + err.Error()})
			return
		}

		udb.Model(&msg).Updates(map[string]interface{}{
			"is_deleted": true,
			"content":    "",
			"media_url":  "",
		})

		realtime.DefaultHub.SendToUser(userID, realtime.Event{
			Type: "chat:delete",
			Payload: map[string]interface{}{
				"id":          msg.ID,
				"phone":       msg.Phone,
				"waMessageId": msg.WaMessageID,
			},
		})

		c.JSON(http.StatusOK, gin.H{"message": "Dihapus"})
	}
}

// ── GET /api/chat/media ──────────────────────────────────────────────────────

// listChatMedia mengembalikan daftar media sebuah percakapan untuk tab Media.
// Query: deviceId, phone (wajib), type opsional (image|document).
func listChatMedia(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		deviceID := c.Query("deviceId")
		phone := c.Query("phone")
		if deviceID == "" || phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "deviceId & phone wajib diisi"})
			return
		}
		groups, ok := chatMediaTypeGroups(c.Query("type"))
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"message": "type tidak dikenal (image|document)"})
			return
		}

		q := udb.Where("user_id = ? AND device_id = ? AND phone = ? AND media_url <> '' AND is_deleted = ?",
			userID, deviceID, phone, false)
		if groups != nil {
			q = q.Where("type IN ?", groups)
		}
		var items []models.ChatInbox
		if err := q.Order("created_at DESC").Limit(100).Find(&items).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memuat media"})
			return
		}

		out := make([]gin.H, 0, len(items))
		for _, m := range items {
			out = append(out, gin.H{
				"id":        m.ID,
				"type":      m.Type,
				"mediaUrl":  m.MediaURL,
				"content":   m.Content,
				"createdAt": m.CreatedAt,
			})
		}
		c.JSON(http.StatusOK, gin.H{"items": out})
	}
}

// ── Presence ─────────────────────────────────────────────────────────────────

// subscribePresence meminta update presence (online/mengetik) untuk kontak.
// Body: {deviceId, phone}.
func subscribePresence(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var req struct {
			DeviceID uint   `json:"deviceId" binding:"required"`
			Phone    string `json:"phone" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Data tidak valid"})
			return
		}

		to := resolveSenderJID(udb, userID, req.DeviceID, req.Phone)
		if err := wm.SubscribePresenceTo(req.DeviceID, to); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Gagal subscribe presence: " + err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}

// getPresenceState mengembalikan state presence terakhir sebuah kontak.
// Query: deviceId, phone.
func getPresenceState(db *gorm.DB, wm *whatsapp.Manager) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)
		udb := rls.Scoped(db, userID)
		var deviceID uint
		if _, err := fmt.Sscan(c.Query("deviceId"), &deviceID); err != nil || deviceID == 0 {
			c.JSON(http.StatusBadRequest, gin.H{"message": "deviceId wajib diisi"})
			return
		}
		phone := c.Query("phone")
		if phone == "" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "phone wajib diisi"})
			return
		}

		to := resolveSenderJID(udb, userID, deviceID, phone)
		st := wm.GetPresence(deviceID, to)
		var lastSeen int64
		if !st.LastSeen.IsZero() {
			lastSeen = st.LastSeen.Unix()
		}
		c.JSON(http.StatusOK, gin.H{
			"online":   st.Online,
			"typing":   st.Typing,
			"lastSeen": lastSeen,
		})
	}
}
