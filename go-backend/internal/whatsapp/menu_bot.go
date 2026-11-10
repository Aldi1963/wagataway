package whatsapp

// Chatbot menu bertingkat (Fitur 2).
//
// Alur: pengirim mengetik keyword pemicu (atau pesan apa pun bila menu diset
// "selalu aktif") → sesi dimulai dan menu utama dikirim. Pengirim membalas
// dengan angka untuk memilih opsi: tiap opsi membalas teks atau melompat ke
// sub-menu (MenuBot lain). "0"/"kembali" naik satu level; di menu utama ia
// mengakhiri sesi. Sesi kedaluwarsa setelah 10 menit idle.
//
// checkMenuBot dipanggil dari handleIncomingMessage SEBELUM auto-reply
// (autoreply.go) dan AI reply: bila ia menangani pesan (return true), keduanya
// dilewati agar tidak bentrok. Menu bot default NONAKTIF per device sehingga
// integrasi lain (mis. bot PPOB via webhook di device 1) tidak terganggu —
// ia hanya aktif bila admin mengaktifkannya eksplisit di UI.

import (
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
	"gorm.io/gorm"
)

// menuBotSessionTimeout: sesi dianggap kedaluwarsa setelah idle selama ini.
const menuBotSessionTimeout = 10 * time.Minute

// maxMenuBotDepth: batas kedalaman lompatan sub-menu (anti loop A→B→A→...).
const maxMenuBotDepth = 10

// itemsOrder dipakai untuk Preload("Items") agar opsi selalu bernomor urut.
func itemsOrder(db *gorm.DB) *gorm.DB {
	return db.Order("position ASC, id ASC")
}

// checkMenuBot mengevaluasi pesan masuk terhadap chatbot menu bertingkat.
// Mengembalikan true bila pesan ditangani menu bot (pemanggil harus melewati
// auto-reply & AI reply); false bila pesan bukan urusan menu bot.
func (m *Manager) checkMenuBot(sess *SessionState, senderJID, senderPhone, text string, isGroup bool) bool {
	if isGroup {
		return false
	}
	t := strings.TrimSpace(text)
	if t == "" {
		return false
	}

	// 1. Sesi yang sedang berjalan untuk (device, nomor) ini?
	var s models.MenuBotSession
	if err := m.db.Where("device_id = ? AND phone = ?", sess.DeviceID, senderPhone).First(&s).Error; err == nil {
		if time.Since(s.LastActiveAt) > menuBotSessionTimeout {
			m.db.Delete(&s)
		} else {
			return m.handleMenuBotSession(sess, &s, senderJID, t)
		}
	}

	// 2. Tidak ada sesi: cocokkan keyword pemicu / selalu-aktif.
	var bots []models.MenuBot
	m.db.Where("user_id = ? AND is_active = ? AND (device_id IS NULL OR device_id = ?)",
		sess.UserID, true, sess.DeviceID).
		Preload("Items", itemsOrder).
		Order("id ASC").
		Find(&bots)
	if len(bots) == 0 {
		return false
	}

	tl := strings.ToLower(t)
	for i := range bots {
		bot := &bots[i]
		kw := strings.ToLower(strings.TrimSpace(bot.TriggerKeyword))
		if bot.AlwaysActive || (kw != "" && tl == kw) {
			m.startMenuBotSession(sess, bot, senderJID, senderPhone)
			return true
		}
	}
	return false
}

// startMenuBotSession memulai sesi baru (menggantikan sesi lama bila ada)
// lalu mengirim teks menu utama.
func (m *Manager) startMenuBotSession(sess *SessionState, bot *models.MenuBot, senderJID, senderPhone string) {
	m.db.Where("device_id = ? AND phone = ?", sess.DeviceID, senderPhone).
		Delete(&models.MenuBotSession{})
	m.db.Create(&models.MenuBotSession{
		UserID:        sess.UserID,
		DeviceID:      sess.DeviceID,
		Phone:         senderPhone,
		RootMenuID:    bot.ID,
		CurrentMenuID: bot.ID,
		History:       "",
		LastActiveAt:  time.Now(),
	})
	if err := m.SendMessage(sess.DeviceID, senderJID, "text", renderMenuText(bot.IntroText, bot.Items, false), ""); err != nil {
		log.Error().Err(err).Uint("menuBotID", bot.ID).Str("to", senderPhone).Msg("Menu bot: gagal mengirim menu utama")
	} else {
		log.Info().Uint("menuBotID", bot.ID).Str("to", senderPhone).Msg("Menu bot: sesi dimulai, menu utama dikirim")
	}
}

// loadActiveMenu memuat menu beserta opsinya; memastikan menu masih aktif
// dan milik user/device sesi ini.
func (m *Manager) loadActiveMenu(sess *SessionState, menuID uint) (*models.MenuBot, bool) {
	var menu models.MenuBot
	if err := m.db.Preload("Items", itemsOrder).
		Where("id = ? AND user_id = ?", menuID, sess.UserID).
		First(&menu).Error; err != nil {
		return nil, false
	}
	if !menu.IsActive {
		return nil, false
	}
	if menu.DeviceID != nil && *menu.DeviceID != sess.DeviceID {
		return nil, false
	}
	return &menu, true
}

// handleMenuBotSession memproses satu pesan dari pengirim yang sedang dalam
// sesi menu. Selalu mengembalikan true (pesan dikonsumsi menu bot).
func (m *Manager) handleMenuBotSession(sess *SessionState, s *models.MenuBotSession, senderJID, text string) bool {
	menu, ok := m.loadActiveMenu(sess, s.CurrentMenuID)
	if !ok {
		// Menu dihapus/dinonaktifkan saat sesi berjalan → akhiri sesi diam-diam.
		m.db.Delete(s)
		return true
	}

	// Ketik keyword menu lain di tengah sesi → pindah ke menu tersebut.
	if bot := m.matchMenuBotTrigger(sess, text); bot != nil && bot.ID != s.RootMenuID {
		m.startMenuBotSession(sess, bot, senderJID, s.Phone)
		return true
	}

	kind, n := parseMenuInput(text)
	now := time.Now()
	touch := func() {
		s.LastActiveAt = now
		m.db.Model(s).Update("last_active_at", now)
	}

	switch kind {
	case "back":
		parentID, rest, hasParent := popMenuHistory(s.History)
		if !hasParent {
			// Di menu utama: akhiri sesi.
			m.db.Delete(s)
			_ = m.SendMessage(sess.DeviceID, senderJID, "text",
				"Sesi menu selesai. Ketik *"+menu.TriggerKeyword+"* untuk memulai lagi.", "")
			log.Info().Str("to", s.Phone).Msg("Menu bot: sesi diakhiri dari menu utama")
			return true
		}
		parent, ok := m.loadActiveMenu(sess, parentID)
		if !ok {
			m.db.Delete(s)
			return true
		}
		s.CurrentMenuID = parent.ID
		s.History = rest
		s.LastActiveAt = now
		m.db.Save(s)
		_ = m.SendMessage(sess.DeviceID, senderJID, "text",
			renderMenuText(parent.IntroText, parent.Items, hasMenuParent(rest)), "")
		log.Info().Uint("menuBotID", parent.ID).Str("to", s.Phone).Msg("Menu bot: kembali ke menu induk")
		return true

	case "choice":
		if n < 1 || n > len(menu.Items) {
			touch()
			_ = m.SendMessage(sess.DeviceID, senderJID, "text",
				"Pilihan tidak valid. Silakan balas dengan angka:\n\n"+
					renderMenuText(menu.IntroText, menu.Items, hasMenuParent(s.History)), "")
			return true
		}
		opt := menu.Items[n-1]
		if opt.ActionType == "submenu" && opt.SubMenuID != nil {
			if menuDepth(s.History) >= maxMenuBotDepth {
				touch()
				_ = m.SendMessage(sess.DeviceID, senderJID, "text",
					"Terlalu dalam. Ketik *0* untuk kembali.", "")
				return true
			}
			sub, ok := m.loadActiveMenu(sess, *opt.SubMenuID)
			if !ok {
				touch()
				_ = m.SendMessage(sess.DeviceID, senderJID, "text",
					"Sub-menu tidak tersedia saat ini.", "")
				return true
			}
			s.History = pushMenuHistory(s.History, menu.ID)
			s.CurrentMenuID = sub.ID
			s.LastActiveAt = now
			m.db.Save(s)
			_ = m.SendMessage(sess.DeviceID, senderJID, "text",
				renderMenuText(sub.IntroText, sub.Items, true), "")
			log.Info().Uint("menuBotID", sub.ID).Str("to", s.Phone).Msg("Menu bot: lompat ke sub-menu")
			return true
		}
		// Aksi balas teks: kirim jawaban, sesi tetap di menu yang sama.
		reply := strings.TrimSpace(opt.ReplyText)
		if reply == "" {
			reply = "(belum ada balasan untuk opsi ini)"
		}
		touch()
		_ = m.SendMessage(sess.DeviceID, senderJID, "text", reply, "")
		log.Info().Uint("menuBotID", menu.ID).Int("option", n).Str("to", s.Phone).Msg("Menu bot: opsi teks terkirim")
		return true

	default: // "invalid"
		touch()
		_ = m.SendMessage(sess.DeviceID, senderJID, "text",
			"Perintah tidak dikenali. Balas dengan angka pilihan, atau *0* untuk kembali:\n\n"+
				renderMenuText(menu.IntroText, menu.Items, hasMenuParent(s.History)), "")
		return true
	}
}

// matchMenuBotTrigger mencari menu aktif yang keyword-nya cocok persis
// (case-insensitive) dengan teks. Dipakai untuk pindah menu di tengah sesi.
func (m *Manager) matchMenuBotTrigger(sess *SessionState, text string) *models.MenuBot {
	tl := strings.ToLower(strings.TrimSpace(text))
	if tl == "" {
		return nil
	}
	var bots []models.MenuBot
	m.db.Where("user_id = ? AND is_active = ? AND (device_id IS NULL OR device_id = ?)",
		sess.UserID, true, sess.DeviceID).
		Preload("Items", itemsOrder).
		Order("id ASC").
		Find(&bots)
	for i := range bots {
		kw := strings.ToLower(strings.TrimSpace(bots[i].TriggerKeyword))
		if kw != "" && tl == kw {
			return &bots[i]
		}
	}
	return nil
}

// parseMenuInput mengklasifikasikan input pengguna:
// "back" untuk "0"/"kembali"/"back", "choice"+n untuk angka positif,
// "invalid" untuk sisanya.
func parseMenuInput(text string) (kind string, n int) {
	t := strings.ToLower(strings.TrimSpace(text))
	if t == "0" || t == "kembali" || t == "back" {
		return "back", 0
	}
	num, err := strconv.Atoi(t)
	if err != nil || num <= 0 {
		return "invalid", 0
	}
	return "choice", num
}

// renderMenuText merangkai teks menu: teks pembuka + opsi bernomor +
// baris "0. Kembali" bila ada menu induk.
func renderMenuText(intro string, options []models.MenuBotItem, hasParent bool) string {
	var b strings.Builder
	if strings.TrimSpace(intro) != "" {
		b.WriteString(strings.TrimSpace(intro))
	}
	if len(options) > 0 {
		if b.Len() > 0 {
			b.WriteString("\n")
		}
		for i, opt := range options {
			fmt.Fprintf(&b, "\n%d. %s", i+1, opt.Label)
		}
	}
	if hasParent {
		b.WriteString("\n\n0. Kembali")
	}
	return strings.TrimSpace(b.String())
}

// pushMenuHistory menambahkan ID menu ke tumpukan riwayat.
func pushMenuHistory(history string, menuID uint) string {
	if history == "" {
		return strconv.FormatUint(uint64(menuID), 10)
	}
	return history + "," + strconv.FormatUint(uint64(menuID), 10)
}

// popMenuHistory mengambil ID menu induk teratas dari tumpukan.
// hasParent=false berarti sudah di menu utama (tumpukan kosong).
func popMenuHistory(history string) (parentID uint, rest string, hasParent bool) {
	history = strings.Trim(history, ",")
	if history == "" {
		return 0, "", false
	}
	parts := strings.Split(history, ",")
	last := parts[len(parts)-1]
	id, err := strconv.ParseUint(strings.TrimSpace(last), 10, 32)
	if err != nil {
		return 0, "", false
	}
	rest = strings.Join(parts[:len(parts)-1], ",")
	return uint(id), rest, true
}

// menuDepth menghitung kedalaman tumpukan riwayat.
func menuDepth(history string) int {
	history = strings.Trim(history, ",")
	if history == "" {
		return 0
	}
	return len(strings.Split(history, ","))
}

// hasMenuParent: true bila tumpukan riwayat tidak kosong.
func hasMenuParent(history string) bool {
	return strings.Trim(history, ",") != ""
}
