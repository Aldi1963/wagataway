package whatsapp

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/Aldi1963/wagataway/internal/quota"
	"github.com/rs/zerolog/log"
	"go.mau.fi/whatsmeow"
	waBinary "go.mau.fi/whatsmeow/binary"
	"go.mau.fi/whatsmeow/proto/waCommon"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/util/random"
	"google.golang.org/protobuf/proto"
)

// Button adalah satu tombol quick_reply pada pesan interaktif (maks 3).
type Button struct {
	ID    string
	Title string
}

// SendOptions adalah parameter pengiriman pesan lanjutan.
// Field tambahan hanya dipakai oleh tipe pesan yang relevan.
type SendOptions struct {
	Type     string // text, image, video, document, poll, interactive/buttons, sticker, voicenote/voice, audio, location
	Content  string
	MediaURL string
	ReplyTo  string // WA message ID (stanza ID) yang dibalas
	FileName string // nama file untuk tipe document (fallback: Content)

	// Poll
	PollOptions          []string
	AllowMultipleAnswers bool

	// Interactive
	Buttons []Button
	Footer  string

	// Location
	Latitude     float64
	Longitude    float64
	LocName      string
	LocAddress   string
	LiveLocation bool

	// Kuota pesan (Fitur 3): bila QuotaBypass=false (default), pengiriman
	// diperiksa terhadap kuota bulanan pemilik device. QuotaUserID opsional:
	// bila 0, diambil dari sess.UserID. QuotaBypass=true HANYA untuk jalur
	// sistem yang dikecualikan: balasan bot PPOB, subscription reminder,
	// admin broadcast WA (lihat paket quota untuk keputusan desain).
	QuotaUserID  uint
	QuotaBypass  bool
}

// replyContext membangun ContextInfo untuk membalas pesan tertentu.
// Participant diisi JID lawan bicara (untuk pesan dari kita sendiri, ini
// tetap benar karena reply merujuk ke pesan di chat tersebut).
func replyContext(jid types.JID, replyTo string) *waE2E.ContextInfo {
	if replyTo == "" {
		return nil
	}
	return &waE2E.ContextInfo{
		StanzaID:    proto.String(replyTo),
		Participant: proto.String(jid.String()),
	}
}

// SendMessageNoQuota mengirim tanpa pemeriksaan kuota — HANYA untuk jalur
// sistem yang dikecualikan (balasan bot PPOB, subscription reminder, admin
// broadcast). JANGAN dipakai untuk kirim yang dipicu user/API.
func (m *Manager) SendMessageNoQuota(deviceID uint, to, msgType, content, mediaURL string) error {
	_, err := m.SendMessageWithOptions(deviceID, to, SendOptions{
		Type:        msgType,
		Content:     content,
		MediaURL:    mediaURL,
		QuotaBypass: true,
	})
	return err
}

// SendMessage adalah wrapper kompatibel mundur dari SendMessageWithOptions.
// Kuota pesan pemilik device tetap diperiksa (lihat SendOptions.QuotaBypass).
func (m *Manager) SendMessage(deviceID uint, to, msgType, content, mediaURL string) error {
	_, err := m.SendMessageWithOptions(deviceID, to, SendOptions{
		Type:     msgType,
		Content:  content,
		MediaURL: mediaURL,
	})
	return err
}

// SendMessageWithOptions mengirim pesan WhatsApp dan mengembalikan WA message ID.
// Webhook "message.sent" / "message.failed" difire otomatis sehingga mencakup
// semua jalur kirim: API, bulk, schedule, drip, autoreply, WAMP, live chat.
func (m *Manager) SendMessageWithOptions(deviceID uint, to string, opts SendOptions) (string, error) {
	m.mu.RLock()
	sess, exists := m.sessions[deviceID]
	m.mu.RUnlock()

	if !exists || sess.Status != "connected" {
		return "", fmt.Errorf("device %d tidak terhubung", deviceID)
	}
	if sess.Client == nil {
		return "", fmt.Errorf("device %d client not initialized", deviceID)
	}

	// Kuota pesan bulanan (Fitur 3): blokir sebelum ada efek samping
	// (typing indicator, dsb). Jalur sistem memakai QuotaBypass=true.
	if !opts.QuotaBypass && m.db != nil {
		quotaUserID := opts.QuotaUserID
		if quotaUserID == 0 {
			quotaUserID = sess.UserID
		}
		if quotaUserID != 0 {
			qr, qerr := quota.Check(m.db, quotaUserID)
			if qerr != nil {
				log.Warn().Err(qerr).Uint("deviceID", deviceID).Uint("userID", quotaUserID).
					Msg("Gagal memeriksa kuota pesan, pengiriman dilanjutkan")
			} else if !qr.Allowed {
				log.Warn().Uint("deviceID", deviceID).Uint("userID", quotaUserID).
					Int64("used", qr.Used).Int("limit", qr.Limit).
					Str("code", qr.Code()).Str("subState", qr.SubState).
					Msg("Pengiriman diblokir: kuota habis / langganan expired / batas grace harian")
				return "", &quota.ExceededError{Info: qr}
			}
		}
	}

	// Parse recipient JID
	jid, err := parseJID(to)
	if err != nil {
		return "", fmt.Errorf("nomor tidak valid: %w", err)
	}

	// Indikator "mengetik..." bila flag typingIndicator aktif.
	sess.mu.RLock()
	typing := sess.TypingIndicator
	sess.mu.RUnlock()
	if typing {
		tpCtx, tpCancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer tpCancel()
		_ = sess.Client.SendChatPresence(tpCtx, jid, types.ChatPresenceComposing, types.ChatPresenceMediaText)
		defer func() {
			_ = sess.Client.SendChatPresence(context.Background(), jid, types.ChatPresencePaused, types.ChatPresenceMediaText)
		}()
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	msgType := opts.Type
	now := time.Now()

	// fireStatus mengirim webhook message.sent / message.failed.
	fireStatus := func(waMsgID string, sendErr error) {
		if sendErr != nil {
			go m.fireWebhooks(sess.UserID, deviceID, "message.failed", map[string]interface{}{
				"to":        to,
				"type":      msgType,
				"error":     sendErr.Error(),
				"timestamp": now.Unix(),
			})
			return
		}
		go m.fireWebhooks(sess.UserID, deviceID, "message.sent", map[string]interface{}{
			"to":        to,
			"messageId": waMsgID,
			"type":      msgType,
			"timestamp": now.Unix(),
		})
	}

	var waMsgID string
	switch msgType {
	case "text", "":
		msg := &waE2E.Message{
			ExtendedTextMessage: &waE2E.ExtendedTextMessage{
				Text:        proto.String(opts.Content),
				ContextInfo: replyContext(jid, opts.ReplyTo),
			},
		}
		waMsgID, err = m.sendProto(ctx, sess.Client, jid, msg)

	case "image":
		if opts.MediaURL == "" {
			err = fmt.Errorf("mediaURL wajib untuk tipe image")
			break
		}
		waMsgID, err = m.sendImageMessage(ctx, sess.Client, jid, opts.MediaURL, opts.Content, opts.ReplyTo)

	case "document":
		if opts.MediaURL == "" {
			err = fmt.Errorf("mediaURL wajib untuk tipe document")
			break
		}
		filename := opts.FileName
		if filename == "" {
			filename = opts.Content
		}
		waMsgID, err = m.sendDocumentMessage(ctx, sess.Client, jid, opts.MediaURL, filename, opts.ReplyTo)

	case "video":
		if opts.MediaURL == "" {
			err = fmt.Errorf("mediaURL wajib untuk tipe video")
			break
		}
		waMsgID, err = m.sendVideoMessage(ctx, sess.Client, jid, opts.MediaURL, opts.Content, opts.ReplyTo)

	case "audio":
		if opts.MediaURL == "" {
			err = fmt.Errorf("mediaURL wajib untuk tipe audio")
			break
		}
		waMsgID, err = m.sendAudioMessage(ctx, sess.Client, jid, opts.MediaURL, false)

	case "poll":
		if len(opts.PollOptions) < 2 || len(opts.PollOptions) > 12 {
			err = fmt.Errorf("poll butuh 2-12 opsi")
			break
		}
		waMsgID, err = m.sendPollMessage(ctx, sess.Client, jid, opts)

	case "interactive", "buttons":
		if len(opts.Buttons) < 1 || len(opts.Buttons) > 3 {
			err = fmt.Errorf("interactive butuh 1-3 tombol")
			break
		}
		waMsgID, err = m.sendInteractiveMessage(ctx, sess.Client, jid, opts)

	case "sticker":
		if opts.MediaURL == "" {
			err = fmt.Errorf("mediaURL wajib untuk tipe sticker")
			break
		}
		waMsgID, err = m.sendStickerMessage(ctx, sess.Client, jid, opts.MediaURL)

	case "voicenote", "voice":
		if opts.MediaURL == "" {
			err = fmt.Errorf("mediaURL wajib untuk tipe voicenote")
			break
		}
		waMsgID, err = m.sendVoiceNoteMessage(ctx, sess.Client, jid, opts.MediaURL)

	case "location":
		waMsgID, err = m.sendLocationMessage(ctx, sess.Client, jid, opts)

	default:
		// Default ke text
		msg := &waE2E.Message{
			ExtendedTextMessage: &waE2E.ExtendedTextMessage{
				Text:        proto.String(opts.Content),
				ContextInfo: replyContext(jid, opts.ReplyTo),
			},
		}
		waMsgID, err = m.sendProto(ctx, sess.Client, jid, msg)
	}

	fireStatus(waMsgID, err)

	if err != nil {
		log.Error().Err(err).Uint("deviceID", deviceID).Str("to", to).Msg("Failed to send message")
		return "", err
	}

	log.Info().
		Uint("deviceID", deviceID).
		Str("to", to).
		Str("type", msgType).
		Str("waMsgID", waMsgID).
		Msg("WhatsApp message sent")

	return waMsgID, nil
}

// sendProto mengirim satu proto Message dan mengembalikan WA message ID.
func (m *Manager) sendProto(ctx context.Context, client *whatsmeow.Client, jid types.JID, msg *waE2E.Message, extra ...whatsmeow.SendRequestExtra) (string, error) {
	resp, err := client.SendMessage(ctx, jid, msg, extra...)
	if err != nil {
		return "", err
	}
	return string(resp.ID), nil
}

// interactiveBizNodes adalah additionalNodes wajib agar server WA meneruskan
// pesan interactive (native flow) ke perangkat penerima. Tanpa node biz ini
// server hanya ACK pengiriman tapi pesan tidak pernah sampai (tidak ada receipt delivered).
func interactiveBizNodes() []waBinary.Node {
	return []waBinary.Node{
		{
			Tag: "biz",
			Content: []waBinary.Node{
				{
					Tag:   "interactive",
					Attrs: waBinary.Attrs{"type": "native_flow", "v": "1"},
					Content: []waBinary.Node{
						{
							Tag:   "native_flow",
							Attrs: waBinary.Attrs{"v": "9", "name": "mixed"},
						},
					},
				},
			},
		},
	}
}

// sendImageMessage mengupload dan mengirim gambar; mengembalikan WA message ID.
func (m *Manager) sendImageMessage(ctx context.Context, client *whatsmeow.Client, jid types.JID, mediaURL, caption, replyTo string) (string, error) {
	// Download image dari URL, atau baca langsung bila path lokal (file://).
	data, err := loadMediaData(mediaURL)
	if err != nil {
		return "", fmt.Errorf("gagal download image: %w", err)
	}

	// Upload to WhatsApp
	uploaded, err := client.Upload(ctx, data, whatsmeow.MediaImage)
	if err != nil {
		return "", fmt.Errorf("gagal upload image: %w", err)
	}

	msg := &waE2E.Message{
		ImageMessage: &waE2E.ImageMessage{
			Caption:       proto.String(caption),
			URL:           proto.String(uploaded.URL),
			DirectPath:    proto.String(uploaded.DirectPath),
			MediaKey:      uploaded.MediaKey,
			Mimetype:      proto.String("image/jpeg"),
			FileEncSHA256: uploaded.FileEncSHA256,
			FileSHA256:    uploaded.FileSHA256,
			FileLength:    proto.Uint64(uint64(len(data))),
			ContextInfo:   replyContext(jid, replyTo),
		},
	}

	return m.sendProto(ctx, client, jid, msg)
}

// sendDocumentMessage mengupload dan mengirim dokumen; mengembalikan WA message ID.
func (m *Manager) sendDocumentMessage(ctx context.Context, client *whatsmeow.Client, jid types.JID, mediaURL, filename, replyTo string) (string, error) {
	data, err := loadMediaData(mediaURL)
	if err != nil {
		return "", fmt.Errorf("gagal download document: %w", err)
	}

	uploaded, err := client.Upload(ctx, data, whatsmeow.MediaDocument)
	if err != nil {
		return "", fmt.Errorf("gagal upload document: %w", err)
	}

	if filename == "" {
		filename = "document"
	}

	msg := &waE2E.Message{
		DocumentMessage: &waE2E.DocumentMessage{
			Title:         proto.String(filename),
			FileName:      proto.String(filename),
			URL:           proto.String(uploaded.URL),
			DirectPath:    proto.String(uploaded.DirectPath),
			MediaKey:      uploaded.MediaKey,
			Mimetype:      proto.String("application/octet-stream"),
			FileEncSHA256: uploaded.FileEncSHA256,
			FileSHA256:    uploaded.FileSHA256,
			FileLength:    proto.Uint64(uint64(len(data))),
			ContextInfo:   replyContext(jid, replyTo),
		},
	}

	return m.sendProto(ctx, client, jid, msg)
}

// sendPollMessage mengirim polling/voting.
func (m *Manager) sendPollMessage(ctx context.Context, client *whatsmeow.Client, jid types.JID, opts SendOptions) (string, error) {
	options := make([]*waE2E.PollCreationMessage_Option, 0, len(opts.PollOptions))
	for _, o := range opts.PollOptions {
		if o == "" {
			return "", fmt.Errorf("opsi poll tidak boleh kosong")
		}
		options = append(options, &waE2E.PollCreationMessage_Option{OptionName: proto.String(o)})
	}

	selectable := uint32(1)
	if opts.AllowMultipleAnswers {
		selectable = uint32(len(options))
	}

	msg := &waE2E.Message{
		PollCreationMessage: &waE2E.PollCreationMessage{
			Name:                   proto.String(opts.Content),
			Options:                options,
			SelectableOptionsCount: proto.Uint32(selectable),
		},
		// MessageSecret WAJIB ada agar vote yang masuk bisa didekripsi
		// (whatsmeow menyimpannya di store saat kirim; tanpa ini
		// DecryptPollVote gagal dengan ErrOriginalMessageSecretNotFound).
		// Sama seperti whatsmeow.BuildPollCreation.
		MessageContextInfo: &waE2E.MessageContextInfo{
			MessageSecret: random.Bytes(32),
		},
	}

	return m.sendProto(ctx, client, jid, msg)
}

// sendInteractiveMessage mengirim pesan dengan tombol quick_reply (maks 3).
func (m *Manager) sendInteractiveMessage(ctx context.Context, client *whatsmeow.Client, jid types.JID, opts SendOptions) (string, error) {
	buttons := make([]*waE2E.InteractiveMessage_NativeFlowMessage_NativeFlowButton, 0, len(opts.Buttons))
	for _, b := range opts.Buttons {
		if b.ID == "" || b.Title == "" {
			return "", fmt.Errorf("tombol harus punya id dan title")
		}
		params, _ := json.Marshal(map[string]string{"display_text": b.Title, "id": b.ID})
		buttons = append(buttons, &waE2E.InteractiveMessage_NativeFlowMessage_NativeFlowButton{
			Name:             proto.String("quick_reply"),
			ButtonParamsJSON: proto.String(string(params)),
		})
	}

	interactive := &waE2E.InteractiveMessage{
		InteractiveMessage: &waE2E.InteractiveMessage_NativeFlowMessage_{
			NativeFlowMessage: &waE2E.InteractiveMessage_NativeFlowMessage{
				Buttons:        buttons,
				MessageVersion: proto.Int32(3),
			},
		},
		Body: &waE2E.InteractiveMessage_Body{
			Text: proto.String(opts.Content),
		},
	}
	if opts.Footer != "" {
		interactive.Footer = &waE2E.InteractiveMessage_Footer{
			Text: proto.String(opts.Footer),
		}
	}

	nodes := interactiveBizNodes()
	return m.sendProto(ctx, client, jid, &waE2E.Message{InteractiveMessage: interactive},
		whatsmeow.SendRequestExtra{AdditionalNodes: &nodes})
}

// sendStickerMessage mengupload dan mengirim stiker (wajib webp).
func (m *Manager) sendStickerMessage(ctx context.Context, client *whatsmeow.Client, jid types.JID, mediaURL string) (string, error) {
	data, err := loadMediaData(mediaURL)
	if err != nil {
		return "", fmt.Errorf("gagal download sticker: %w", err)
	}
	// Validasi magic bytes webp: "RIFF"...."WEBP"
	if len(data) < 12 || string(data[0:4]) != "RIFF" || string(data[8:12]) != "WEBP" {
		return "", fmt.Errorf("file bukan webp valid (stiker harus format webp)")
	}

	uploaded, err := client.Upload(ctx, data, whatsmeow.MediaImage)
	if err != nil {
		return "", fmt.Errorf("gagal upload sticker: %w", err)
	}

	msg := &waE2E.Message{
		StickerMessage: &waE2E.StickerMessage{
			URL:           proto.String(uploaded.URL),
			DirectPath:    proto.String(uploaded.DirectPath),
			MediaKey:      uploaded.MediaKey,
			Mimetype:      proto.String("image/webp"),
			FileEncSHA256: uploaded.FileEncSHA256,
			FileSHA256:    uploaded.FileSHA256,
			FileLength:    proto.Uint64(uint64(len(data))),
		},
	}

	return m.sendProto(ctx, client, jid, msg)
}

// sendVideoMessage mengupload dan mengirim video; mengembalikan WA message ID.
// Struktur mirip image (caption + reply context), pakai whatsmeow.MediaVideo.
func (m *Manager) sendVideoMessage(ctx context.Context, client *whatsmeow.Client, jid types.JID, mediaURL, caption, replyTo string) (string, error) {
	data, err := loadMediaData(mediaURL)
	if err != nil {
		return "", fmt.Errorf("gagal download video: %w", err)
	}

	uploaded, err := client.Upload(ctx, data, whatsmeow.MediaVideo)
	if err != nil {
		return "", fmt.Errorf("gagal upload video: %w", err)
	}

	msg := &waE2E.Message{
		VideoMessage: &waE2E.VideoMessage{
			Caption:       proto.String(caption),
			URL:           proto.String(uploaded.URL),
			DirectPath:    proto.String(uploaded.DirectPath),
			MediaKey:      uploaded.MediaKey,
			Mimetype:      proto.String("video/mp4"),
			FileEncSHA256: uploaded.FileEncSHA256,
			FileSHA256:    uploaded.FileSHA256,
			FileLength:    proto.Uint64(uint64(len(data))),
			ContextInfo:   replyContext(jid, replyTo),
		},
	}

	return m.sendProto(ctx, client, jid, msg)
}

// sendVoiceNoteMessage mengupload dan mengirim voice note (PTT).
// File idealnya ogg/opus; format lain tetap dicoba dikirim apa adanya.
func (m *Manager) sendVoiceNoteMessage(ctx context.Context, client *whatsmeow.Client, jid types.JID, mediaURL string) (string, error) {
	return m.sendAudioMessage(ctx, client, jid, mediaURL, true)
}

// sendAudioMessage mengupload dan mengirim audio. ptt=true → voice note
// (tampil sebagai pesan suara), ptt=false → file audio biasa.
func (m *Manager) sendAudioMessage(ctx context.Context, client *whatsmeow.Client, jid types.JID, mediaURL string, ptt bool) (string, error) {
	data, err := loadMediaData(mediaURL)
	if err != nil {
		return "", fmt.Errorf("gagal download audio: %w", err)
	}
	if len(data) == 0 {
		return "", fmt.Errorf("file audio kosong")
	}

	uploaded, err := client.Upload(ctx, data, whatsmeow.MediaAudio)
	if err != nil {
		return "", fmt.Errorf("gagal upload audio: %w", err)
	}

	msg := &waE2E.Message{
		AudioMessage: &waE2E.AudioMessage{
			URL:           proto.String(uploaded.URL),
			DirectPath:    proto.String(uploaded.DirectPath),
			MediaKey:      uploaded.MediaKey,
			Mimetype:      proto.String(sniffAudioMimetype(data)),
			FileEncSHA256: uploaded.FileEncSHA256,
			FileSHA256:    uploaded.FileSHA256,
			FileLength:    proto.Uint64(uint64(len(data))),
			PTT:           proto.Bool(ptt),
		},
	}

	return m.sendProto(ctx, client, jid, msg)
}

// sniffAudioMimetype menebak mime audio dari isi file untuk field Mimetype
// pesan WA. Default audio/mpeg bila tidak dikenali.
func sniffAudioMimetype(data []byte) string {
	head := data
	if len(head) > 512 {
		head = head[:512]
	}
	switch http.DetectContentType(head) {
	case "audio/ogg", "application/ogg":
		return "audio/ogg; codecs=opus"
	case "audio/mp4":
		return "audio/mp4"
	case "audio/webm", "video/webm":
		return "audio/webm"
	default:
		return "audio/mpeg"
	}
}

// sendLocationMessage mengirim lokasi (atau live location bila LiveLocation=true).
func (m *Manager) sendLocationMessage(ctx context.Context, client *whatsmeow.Client, jid types.JID, opts SendOptions) (string, error) {
	if opts.Latitude < -90 || opts.Latitude > 90 {
		return "", fmt.Errorf("latitude harus antara -90 dan 90")
	}
	if opts.Longitude < -180 || opts.Longitude > 180 {
		return "", fmt.Errorf("longitude harus antara -180 dan 180")
	}

	msg := &waE2E.Message{
		LocationMessage: &waE2E.LocationMessage{
			DegreesLatitude:  proto.Float64(opts.Latitude),
			DegreesLongitude: proto.Float64(opts.Longitude),
			Name:            proto.String(opts.LocName),
			Address:         proto.String(opts.LocAddress),
			IsLive:          proto.Bool(opts.LiveLocation),
		},
	}

	return m.sendProto(ctx, client, jid, msg)
}

// RevokeMessage menarik pesan yang sudah terkirim (hapus untuk semua orang).
// Hanya berlaku untuk pesan milik sendiri yang masih dalam jendela waktu WA.
func (m *Manager) RevokeMessage(deviceID uint, to, waMsgID string) error {
	m.mu.RLock()
	sess, exists := m.sessions[deviceID]
	m.mu.RUnlock()

	if !exists || sess.Status != "connected" || sess.Client == nil {
		return fmt.Errorf("device %d tidak terhubung", deviceID)
	}

	jid, err := parseJID(to)
	if err != nil {
		return fmt.Errorf("nomor tidak valid: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	_, err = sess.Client.RevokeMessage(ctx, jid, types.MessageID(waMsgID))
	return err
}

// SendReaction mengirim reaksi emoji ke sebuah pesan. targetFromMe menandai
// apakah pesan yang dituju dikirim oleh kita sendiri (true) atau lawan bicara.
// emoji kosong ("") berarti menghapus reaksi.
func (m *Manager) SendReaction(deviceID uint, to, waMsgID string, targetFromMe bool, emoji string) error {
	m.mu.RLock()
	sess, exists := m.sessions[deviceID]
	m.mu.RUnlock()

	if !exists || sess.Status != "connected" || sess.Client == nil {
		return fmt.Errorf("device %d tidak terhubung", deviceID)
	}

	jid, err := parseJID(to)
	if err != nil {
		return fmt.Errorf("nomor tidak valid: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	msg := &waE2E.Message{
		ReactionMessage: &waE2E.ReactionMessage{
			Key: &waCommon.MessageKey{
				RemoteJID: proto.String(jid.String()),
				FromMe:    proto.Bool(targetFromMe),
				ID:        proto.String(waMsgID),
			},
			Text: proto.String(emoji),
		},
	}
	_, err = sess.Client.SendMessage(ctx, jid, msg)
	return err
}
