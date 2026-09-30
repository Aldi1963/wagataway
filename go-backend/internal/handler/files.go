package handler

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"unicode/utf8"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/middleware"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

func registerFileRoutes(rg *gin.RouterGroup, db *gorm.DB) {
	f := rg.Group("/files")
	{
		f.POST("", uploadFile(db))
		f.GET("", listFiles(db))
		f.GET("/:id/content", serveFileContent(db))
		f.DELETE("/:id", deleteFile(db))
	}
}

// maxUploadBytes: batas ukuran satu file (16MB, sesuai batas media WhatsApp).
const maxUploadBytes = 16 << 20

// allowedUploadMimes memetakan mime hasil sniffing konten -> ekstensi aman.
// Hanya mime ini yang boleh disimpan; nama file di disk selalu dibuat acak.
var allowedUploadMimes = map[string]string{
	"image/jpeg":         ".jpg",
	"image/png":          ".png",
	"image/gif":          ".gif",
	"image/webp":         ".webp",
	"video/mp4":          ".mp4",
	"audio/mpeg":         ".mp3",
	"audio/ogg":          ".ogg",
	"application/ogg":    ".ogg",
	"application/pdf":    ".pdf",
	"application/msword": ".doc",
	"application/vnd.openxmlformats-officedocument.wordprocessingml.document": ".docx",
}

func uploadFile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		// Batasi body agar client nakal tidak bisa bikin OOM.
		c.Request.Body = http.MaxBytesReader(c.Writer, c.Request.Body, maxUploadBytes+1<<20)
		fh, header, err := c.Request.FormFile("file")
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Field 'file' wajib diisi (multipart form)", "code": "VALIDATION_ERROR"})
			return
		}
		defer fh.Close()

		if header.Size > maxUploadBytes {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Ukuran file maksimal 16MB", "code": "VALIDATION_ERROR"})
			return
		}

		// Sniff mime dari isi file — jangan percaya Content-Type dari client.
		sniff := make([]byte, 512)
		n, _ := io.ReadFull(fh, sniff)
		if _, err := fh.Seek(0, io.SeekStart); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal membaca file", "code": "SERVER_ERROR"})
			return
		}
		mime := http.DetectContentType(sniff[:n])
		ext, ok := allowedUploadMimes[mime]
		if !ok {
			// Kasus khusus: docx terdeteksi sebagai zip, doc lawas sebagai octet-stream.
			// Terima hanya bila ekstensi nama asli konsisten.
			origExt := strings.ToLower(filepath.Ext(header.Filename))
			switch {
			case mime == "application/zip" && origExt == ".docx":
				mime = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
				ext = ".docx"
				ok = true
			case mime == "application/octet-stream" && origExt == ".doc":
				mime = "application/msword"
				ext = ".doc"
				ok = true
			}
		}
		if !ok {
			c.JSON(http.StatusBadRequest, gin.H{"message": fmt.Sprintf("Tipe file tidak didukung: %s", mime), "code": "VALIDATION_ERROR"})
			return
		}

		// Nama acak di disk — JANGAN pakai nama asli user untuk path.
		var rb [16]byte
		if _, err := rand.Read(rb[:]); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal memproses file", "code": "SERVER_ERROR"})
			return
		}
		fileName := hex.EncodeToString(rb[:]) + ext

		if err := os.MkdirAll(whatsapp.UploadsDir, 0o755); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyiapkan penyimpanan", "code": "SERVER_ERROR"})
			return
		}
		dst := filepath.Join(whatsapp.UploadsDir, fileName)
		out, err := os.OpenFile(dst, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o644)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan file", "code": "SERVER_ERROR"})
			return
		}
		size, copyErr := io.Copy(out, fh)
		closeErr := out.Close()
		if copyErr != nil || closeErr != nil || size > maxUploadBytes {
			os.Remove(dst)
			c.JSON(http.StatusBadRequest, gin.H{"message": "Ukuran file maksimal 16MB", "code": "VALIDATION_ERROR"})
			return
		}

		rec := models.File{
			UserID:       userID,
			FileName:     fileName,
			OriginalName: sanitizeFileName(header.Filename),
			Mime:         mime,
			Size:         size,
		}
		if err := db.Create(&rec).Error; err != nil {
			os.Remove(dst)
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menyimpan metadata file", "code": "DB_ERROR"})
			return
		}

		c.JSON(http.StatusCreated, gin.H{"file": rec})
	}
}

func listFiles(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		var files []models.File
		var total int64
		db.Model(&models.File{}).Where("user_id = ?", userID).Count(&total)
		db.Where("user_id = ?", userID).
			Order("created_at DESC").
			Limit(100).
			Find(&files)

		c.JSON(http.StatusOK, gin.H{"files": files, "total": total})
	}
}

func serveFileContent(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		var f models.File
		if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&f).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "File tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		// Path hanya dibangun dari nama acak di DB — tidak ada input user.
		path := filepath.Join(whatsapp.UploadsDir, f.FileName)
		fh, err := os.Open(path)
		if err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "File tidak ditemukan di penyimpanan", "code": "NOT_FOUND"})
			return
		}
		defer fh.Close()

		c.DataFromReader(http.StatusOK, f.Size, f.Mime, fh, map[string]string{
			"Content-Disposition": fmt.Sprintf(`inline; filename="%s"`, sanitizeHeaderFileName(f.OriginalName)),
		})
	}
}

func deleteFile(db *gorm.DB) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID := middleware.GetUserID(c)

		var f models.File
		if err := db.Where("id = ? AND user_id = ?", c.Param("id"), userID).First(&f).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "File tidak ditemukan", "code": "NOT_FOUND"})
			return
		}

		// Hapus file di disk (abaikan bila sudah tidak ada), lalu record DB.
		if err := os.Remove(filepath.Join(whatsapp.UploadsDir, f.FileName)); err != nil && !os.IsNotExist(err) {
			// Catat tapi tetap lanjut hapus record agar tidak nyangkut.
			fmt.Fprintf(os.Stderr, "warning: gagal hapus file %s: %v\n", f.FileName, err)
		}
		if err := db.Delete(&f).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Gagal menghapus file", "code": "DB_ERROR"})
			return
		}

		c.JSON(http.StatusOK, gin.H{"message": "File dihapus"})
	}
}

// resolveFileMediaURL mengubah fileId milik user menjadi path lokal
// ber-prefix "file://" yang dimengerti layer pengiriman WhatsApp
// (dibaca langsung dari disk tanpa download ulang).
func resolveFileMediaURL(db *gorm.DB, userID, fileID uint) (string, error) {
	var f models.File
	if err := db.Where("id = ? AND user_id = ?", fileID, userID).First(&f).Error; err != nil {
		return "", err
	}
	abs, err := filepath.Abs(filepath.Join(whatsapp.UploadsDir, f.FileName))
	if err != nil {
		return "", err
	}
	return "file://" + abs, nil
}

// sanitizeFileName membersihkan nama asli untuk disimpan sebagai metadata.
func sanitizeFileName(name string) string {
	name = filepath.Base(strings.TrimSpace(name))
	name = strings.Map(func(r rune) rune {
		if r < 32 || r == 127 {
			return -1
		}
		return r
	}, name)
	if !utf8.ValidString(name) || name == "" || name == "." || name == ".." {
		return "file"
	}
	if utf8.RuneCountInString(name) > 100 {
		runes := []rune(name)
		name = string(runes[:100])
	}
	return name
}

// sanitizeHeaderFileName membersihkan nama untuk header Content-Disposition.
func sanitizeHeaderFileName(name string) string {
	name = strings.ReplaceAll(name, `"`, "")
	name = strings.ReplaceAll(name, `\`, "")
	name = strings.ReplaceAll(name, "\r", "")
	name = strings.ReplaceAll(name, "\n", "")
	name = strings.TrimSpace(name)
	if name == "" {
		return "file"
	}
	return name
}
