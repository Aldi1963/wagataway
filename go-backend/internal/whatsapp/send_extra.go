package whatsapp

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/rs/zerolog/log"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
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
	Type     string // text, image, document, poll, interactive/buttons, sticker, voicenote/voice, location
	Content  string
	MediaURL string
	ReplyTo  string // WA message ID (stanza ID) yang dibalas

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

// SendMessage adalah wrapper kompatibel mundur dari SendMessageWithOptions.
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
		waMsgID, err = m.sendDocumentMessage(ctx, sess.Client, jid, opts.MediaURL, opts.Content, opts.ReplyTo)

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
func (m *Manager) sendProto(ctx context.Context, client *whatsmeow.Client, jid types.JID, msg *waE2E.Message) (string, error) {
	resp, err := client.SendMessage(ctx, jid, msg)
	if err != nil {
		return "", err
	}
	return string(resp.ID), nil
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

	return m.sendProto(ctx, client, jid, &waE2E.Message{InteractiveMessage: interactive})
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

// sendVoiceNoteMessage mengupload dan mengirim voice note (PTT).
// File idealnya ogg/opus; format lain tetap dicoba dikirim apa adanya.
func (m *Manager) sendVoiceNoteMessage(ctx context.Context, client *whatsmeow.Client, jid types.JID, mediaURL string) (string, error) {
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
			Mimetype:      proto.String("audio/ogg; codecs=opus"),
			FileEncSHA256: uploaded.FileEncSHA256,
			FileSHA256:    uploaded.FileSHA256,
			FileLength:    proto.Uint64(uint64(len(data))),
			PTT:           proto.Bool(true),
		},
	}

	return m.sendProto(ctx, client, jid, msg)
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
