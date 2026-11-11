package worker

import (
	"time"

	"github.com/Aldi1963/wagataway/internal/chatbackup"
	"github.com/rs/zerolog/log"
)

// processChatBackups membuat cadangan percakapan harian (Item 11): satu
// file JSON per pasangan (user, device) yang punya percakapan. Idempoten
// per hari — pasangan yang sudah punya backup 'ready' hari ini dilewati,
// jadi restart server / dobel jalan tidak membuat duplikat. Setelah itu
// backup lebih tua dari retensi dihapus (file + baris).
func (s *Scheduler) processChatBackups() {
	now := time.Now()
	pairs, err := chatbackup.ListPairs(s.db)
	if err != nil {
		log.Error().Err(err).Msg("Backup chat harian: gagal membaca pasangan user/device")
		return
	}
	made, skipped, failed := 0, 0, 0
	for _, p := range pairs {
		if chatbackup.HasReadyToday(s.db, p.UserID, p.DeviceID, now) {
			skipped++
			continue
		}
		rec, err := chatbackup.Run(s.db, p.UserID, p.DeviceID, now)
		if err != nil {
			failed++
			log.Error().Err(err).Uint("userID", p.UserID).Uint("deviceID", p.DeviceID).
				Msg("Backup chat harian gagal")
			continue
		}
		made++
		log.Info().Uint("backupID", rec.ID).Uint("userID", p.UserID).Uint("deviceID", p.DeviceID).
			Int("conversations", rec.ConversationCount).Int("messages", rec.MessageCount).
			Msg("Backup chat harian dibuat")
		chatbackup.Prune(s.db, p.UserID, p.DeviceID, now)
	}
	if made+failed > 0 {
		log.Info().Int("made", made).Int("skipped", skipped).Int("failed", failed).
			Msg("Backup chat harian selesai")
	}
}
