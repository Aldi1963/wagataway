package handler

import (
	"fmt"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/Aldi1963/wagataway/internal/whatsapp"
	"github.com/gin-gonic/gin"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// Batas: IP dianggap "baru" bila tidak terlihat dalam 30 hari terakhir.
const newLoginIPWindow = 30 * 24 * time.Hour

// trackLogin mencatat riwayat login dan memberi notifikasi bila IP belum
// pernah terlihat dalam jendela waktu. Dipanggil sekali per login penuh
// (bukan saat token sementara 2FA diterbitkan).
func trackLogin(db *gorm.DB, waManager *whatsapp.Manager, user *models.User, c *gin.Context) {
	ip := c.ClientIP()
	ua := c.GetHeader("User-Agent")
	if len(ua) > 500 {
		ua = ua[:500]
	}

	var count int64
	db.Model(&models.LoginHistory{}).
		Where("user_id = ? AND ip = ? AND created_at > ?", user.ID, ip, time.Now().Add(-newLoginIPWindow)).
		Count(&count)

	db.Create(&models.LoginHistory{UserID: user.ID, IP: ip, UserAgent: ua})

	// Prune: simpan maksimal 100 riwayat terakhir per user.
	var ids []uint
	db.Model(&models.LoginHistory{}).
		Where("user_id = ?", user.ID).
		Order("id DESC").Offset(100).Pluck("id", &ids)
	if len(ids) > 0 {
		db.Where("id IN ?", ids).Delete(&models.LoginHistory{})
	}

	if count > 0 {
		return // IP sudah dikenal
	}

	waktu := time.Now().Format("02 Jan 2006 15:04")
	// Notifikasi dalam aplikasi (selalu dibuat).
	db.Create(&models.Notification{
		UserID:  &user.ID,
		Type:    "security",
		Title:   "Login dari IP baru terdeteksi",
		Message: fmt.Sprintf("Akun Anda diakses dari IP %s pada %s. Jika ini bukan Anda, segera ubah password dan periksa sesi aktif di Pengaturan > Keamanan.", ip, waktu),
		Link:    "/settings?tab=profil",
	})

	// Notifikasi WA bila user mengisi nomor notifikasi & punya device connected.
	notifyWA := strings.TrimSpace(user.NotifyWA)
	if notifyWA == "" {
		return
	}
	var dev models.Device
	if err := db.Where("user_id = ? AND status = ?", user.ID, "connected").
		Order("is_default DESC, id ASC").First(&dev).Error; err != nil {
		return
	}
	msg := fmt.Sprintf("[WaGataway] Login baru terdeteksi di akun %s dari IP %s pada %s. Bukan Anda? Segera amankan akun via Pengaturan > Keamanan.", user.Email, ip, waktu)
	if err := waManager.SendMessageNoQuota(dev.ID, notifyWA, "text", msg, ""); err != nil {
		log.Warn().Err(err).Uint("user", user.ID).Msg("notifikasi login baru via WA gagal")
	}
}
