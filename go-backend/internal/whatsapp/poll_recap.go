package whatsapp

import (
	"context"
	"crypto/sha256"
	"fmt"
	"strings"
	"time"

	"github.com/rs/zerolog/log"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
	"gorm.io/gorm"

	"github.com/Aldi1963/wagataway/internal/database/models"
)

// pollOptionHash menghitung SHA-256 dari nama opsi — sama dengan yang dipakai
// whatsmeow (HashPollOptions) untuk mencocokkan vote terdekripsi ke opsi.
func pollOptionHash(option string) [32]byte {
	return sha256.Sum256([]byte(option))
}

// matchPollVoteHashes mencocokkan hash opsi terdekripsi ke indeks opsi poll.
// Mengembalikan indeks opsi yang dipilih pemilih.
func matchPollVoteHashes(options []string, selectedHashes [][]byte) []int {
	hashToIdx := make(map[[32]byte]int, len(options))
	for i, opt := range options {
		hashToIdx[pollOptionHash(opt)] = i
	}
	var out []int
	for _, h := range selectedHashes {
		if len(h) != 32 {
			continue
		}
		var key [32]byte
		copy(key[:], h)
		if idx, ok := hashToIdx[key]; ok {
			out = append(out, idx)
		}
	}
	return out
}

// handlePollVote menangkap vote polling yang masuk (PollUpdateMessage).
// Dipanggil dari handleEvent SEBELUM handleIncomingMessage agar vote tidak
// masuk ke alur bot/menu/AI/webhook (termasuk webhook bot PPOB).
//
// Batasan yang jujur:
//   - Vote hanya tercatat bila event PollUpdateMessage benar-benar diterima
//     dari WhatsApp DAN berhasil didekripsi (butuh message secret poll yang
//     dikirim device ini — poll yang dikirim sebelum Fitur 6 tidak punya
//     secret sehingga vote-nya tidak bisa didekripsi).
//   - Bila dekripsi gagal, vote dilewati (hanya log) — rekap memakai data
//     yang berhasil tercatat.
func (m *Manager) handlePollVote(sess *SessionState, msg *events.Message) {
	deviceID := sess.DeviceID

	// Abaikan vote dari device sendiri.
	if msg.Info.IsFromMe {
		return
	}

	pollUpdate := msg.Message.GetPollUpdateMessage()
	if pollUpdate == nil {
		return
	}
	creationKey := pollUpdate.GetPollCreationMessageKey()
	if creationKey == nil || creationKey.GetID() == "" {
		return
	}
	pollMsgID := string(creationKey.GetID())

	// Cari poll yang dilacak device ini.
	var poll models.Poll
	if err := m.db.Where("device_id = ? AND message_id = ?", deviceID, pollMsgID).First(&poll).Error; err != nil {
		// Bukan poll yang dikirim lewat gateway ini — abaikan.
		return
	}

	if sess.Client == nil {
		return
	}
	decrypted, err := sess.Client.DecryptPollVote(context.Background(), msg)
	if err != nil {
		log.Warn().
			Uint("deviceID", deviceID).
			Uint("pollID", poll.ID).
			Err(err).
			Msg("Vote poll masuk tapi gagal didekripsi — dilewati")
		return
	}

	options := poll.Options()
	selected := matchPollVoteHashes(options, decrypted.GetSelectedOptions())
	if len(selected) == 0 {
		log.Debug().Uint("deviceID", deviceID).Uint("pollID", poll.ID).Msg("Vote poll tidak cocok ke opsi manapun — dilewati")
		return
	}

	// Identitas pemilih: pakai nomor asli (PN) bila pengirim berupa LID,
	// pola yang sama dengan handleIncomingMessage.
	senderPhone := msg.Info.Sender.User
	if msg.Info.Sender.Server == types.HiddenUserServer && msg.Info.SenderAlt.User != "" &&
		msg.Info.SenderAlt.Server == types.DefaultUserServer {
		senderPhone = msg.Info.SenderAlt.User
	}
	voterJID := msg.Info.Sender.String()

	// Semantik update WhatsApp: vote terbaru menimpa vote lama pemilih.
	now := time.Now()
	if err := m.db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Where("poll_id = ? AND voter_phone = ?", poll.ID, senderPhone).
			Delete(&models.PollVote{}).Error; err != nil {
			return err
		}
		for _, idx := range selected {
			if err := tx.Create(&models.PollVote{
				PollID:      poll.ID,
				VoterPhone:  senderPhone,
				VoterJID:    voterJID,
				OptionIndex: idx,
				VotedAt:     now,
			}).Error; err != nil {
				return err
			}
		}
		return nil
	}); err != nil {
		log.Error().Uint("deviceID", deviceID).Uint("pollID", poll.ID).Err(err).Msg("Gagal menyimpan vote poll")
		return
	}

	log.Info().
		Uint("deviceID", deviceID).
		Uint("pollID", poll.ID).
		Str("voter", senderPhone).
		Ints("options", selected).
		Msg("Vote poll tercatat")
}

// BuildPollRecapText menyusun teks rekap hasil polling yang rapi untuk dikirim
// ke nomor/grup. counts[i] = jumlah vote opsi ke-i.
func BuildPollRecapText(question string, options []string, counts []int, totalVoters int) string {
	var sb strings.Builder
	sb.WriteString("📊 *Rekap Hasil Polling*\n\n")
	sb.WriteString(fmt.Sprintf("❓ %s\n\n", question))
	totalVotes := 0
	for _, c := range counts {
		totalVotes += c
	}
	for i, opt := range options {
		votes := 0
		if i < len(counts) {
			votes = counts[i]
		}
		pct := 0.0
		if totalVotes > 0 {
			pct = float64(votes) / float64(totalVotes) * 100
		}
		sb.WriteString(fmt.Sprintf("%d. %s — *%d* suara (%.0f%%)\n", i+1, opt, votes, pct))
	}
	sb.WriteString(fmt.Sprintf("\n🗳️ Total: %d suara dari %d pemilih", totalVotes, totalVoters))
	return sb.String()
}
