package whatsapp

import (
	"context"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"sync"
	"time"
	"unicode"

	"github.com/Aldi1963/wagataway/internal/database/models"
	"github.com/rs/zerolog/log"
	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/proto/waCompanionReg"
	"go.mau.fi/whatsmeow/store"
	"go.mau.fi/whatsmeow/store/sqlstore"
	waLog "go.mau.fi/whatsmeow/util/log"
	"google.golang.org/protobuf/proto"
)

// pairCodeTTL adalah masa berlaku kode pairing yang ditampilkan ke pengguna.
const pairCodeTTL = 120 * time.Second

type pairCodeInfo struct {
	Code      string
	ExpiresAt time.Time
}

// pairCodes menyimpan kode pairing aktif per device. Disimpan di luar
// SessionState agar tidak perlu mengubah manager.go.
var (
	pairCodes   = make(map[uint]pairCodeInfo)
	pairCodesMu sync.RWMutex
)

// GetPairCode mengembalikan kode pairing aktif untuk device,
// atau string kosong bila tidak ada atau sudah kedaluwarsa.
func (m *Manager) GetPairCode(deviceID uint) (string, time.Time) {
	pairCodesMu.RLock()
	defer pairCodesMu.RUnlock()
	info, ok := pairCodes[deviceID]
	if !ok || time.Now().After(info.ExpiresAt) {
		return "", time.Time{}
	}
	return info.Code, info.ExpiresAt
}

// normalizePairPhone membersihkan nomor HP ke format internasional (62...).
func normalizePairPhone(phone string) string {
	var b strings.Builder
	for _, r := range phone {
		if unicode.IsDigit(r) {
			b.WriteRune(r)
		}
	}
	d := b.String()
	if strings.HasPrefix(d, "0") {
		d = "62" + d[1:]
	}
	return d
}

// RequestPairCode meminta kode pairing 8 digit dari WhatsApp untuk device.
// Alur: ambil/buat sesi → sambungkan websocket → PairPhone → kembalikan kode.
// Pengguna memasukkan kode di WhatsApp HP: Perangkat tertaut → Tautkan
// perangkat → "Tautkan dengan nomor telepon".
func (m *Manager) RequestPairCode(deviceID uint, phone string) (string, error) {
	phone = normalizePairPhone(phone)
	if len(phone) <= 6 {
		return "", errors.New("nomor HP tidak valid, gunakan format 62812xxxxxxx")
	}

	var device models.Device
	if err := m.db.Where("id = ?", deviceID).First(&device).Error; err != nil {
		return "", errors.New("perangkat tidak ditemukan")
	}

	m.mu.Lock()
	sess, exists := m.sessions[deviceID]
	if !exists {
		sess = &SessionState{DeviceID: deviceID, UserID: device.UserID, Status: "connecting"}
		m.sessions[deviceID] = sess
	}
	m.mu.Unlock()

	sess.mu.RLock()
	client := sess.Client
	sess.mu.RUnlock()

	ctx := context.Background()

	if client == nil {
		var err error
		client, err = m.newPairingClient(sess)
		if err != nil {
			return "", err
		}
	}

	if client.IsLoggedIn() {
		return "", errors.New("perangkat sudah terhubung, tidak perlu pairing ulang")
	}

	if !client.IsConnected() {
		qrChan, _ := client.GetQRChannel(ctx)
		if err := client.Connect(); err != nil {
			sess.mu.Lock()
			sess.Status = "disconnected"
			sess.mu.Unlock()
			m.db.Model(&models.Device{}).Where("id = ?", deviceID).Update("status", "disconnected")
			return "", fmt.Errorf("gagal menghubungkan ke WhatsApp: %w", err)
		}
		go m.watchPairingEvents(sess, qrChan)
	}

	// Minta kode segera setelah websocket tersambung agar masa berlakunya maksimal.
	// Nama tampilan harus berformat "Browser (OS)" dan browser/OS yang umum,
	// kalau tidak server WhatsApp menolak dengan 400.
	code, err := client.PairPhone(ctx, phone, true, whatsmeow.PairClientChrome, "Chrome (Linux)")
	if err != nil {
		return "", fmt.Errorf("gagal meminta kode pairing: %w", err)
	}

	pairCodesMu.Lock()
	pairCodes[deviceID] = pairCodeInfo{Code: code, ExpiresAt: time.Now().Add(pairCodeTTL)}
	pairCodesMu.Unlock()

	sess.mu.Lock()
	sess.Status = "connecting"
	sess.QR = ""
	sess.mu.Unlock()
	m.db.Model(&models.Device{}).Where("id = ?", deviceID).Update("status", "connecting")

	log.Info().Uint("deviceID", deviceID).Msg("Kode pairing diterbitkan, menunggu input di HP")
	return code, nil
}

// newPairingClient membuat client whatsmeow baru untuk sesi,
// mengikuti pola pembuatan client di startSession.
func (m *Manager) newPairingClient(sess *SessionState) (*whatsmeow.Client, error) {
	deviceID := sess.DeviceID
	dbPath := filepath.Join(m.sessionDir, fmt.Sprintf("device_%d.db", deviceID))
	dbURI := fmt.Sprintf("file:%s?_foreign_keys=on", dbPath)

	container, err := sqlstore.New(context.Background(), "sqlite3", dbURI, waLog.Noop)
	if err != nil {
		log.Error().Err(err).Uint("deviceID", deviceID).Msg("Gagal membuat sqlstore (pairing)")
		return nil, errors.New("gagal menyiapkan sesi WhatsApp")
	}

	deviceStore, err := container.GetFirstDevice(context.Background())
	if err != nil {
		log.Error().Err(err).Uint("deviceID", deviceID).Msg("Gagal mengambil device store (pairing)")
		return nil, errors.New("gagal menyiapkan sesi WhatsApp")
	}

	store.DeviceProps.Os = proto.String("WaGataway")
	store.DeviceProps.PlatformType = waCompanionReg.DeviceProps_CHROME.Enum()

	client := whatsmeow.NewClient(deviceStore, waLog.Noop)
	client.AddEventHandler(func(evt interface{}) {
		m.handleEvent(sess, evt)
	})

	sess.mu.Lock()
	sess.Container = container
	sess.Client = client
	sess.mu.Unlock()

	return client, nil
}

// watchPairingEvents memantau channel pairing di background.
// Status "connected" final ditangani handleEvent via events.Connected;
// di sini kami membersihkan kode dan mencatat hasil akhir.
func (m *Manager) watchPairingEvents(sess *SessionState, qrChan <-chan whatsmeow.QRChannelItem) {
	deviceID := sess.DeviceID
	for evt := range qrChan {
		switch evt.Event {
		case "success":
			sess.mu.Lock()
			sess.QR = ""
			sess.mu.Unlock()
			pairCodesMu.Lock()
			delete(pairCodes, deviceID)
			pairCodesMu.Unlock()
			log.Info().Uint("deviceID", deviceID).Msg("Pairing via kode berhasil")
			return
		case "error":
			log.Error().Err(evt.Error).Uint("deviceID", deviceID).Msg("Pairing via kode gagal")
			sess.mu.Lock()
			sess.Status = "disconnected"
			sess.mu.Unlock()
			m.db.Model(&models.Device{}).Where("id = ?", deviceID).Update("status", "disconnected")
			return
		case "timeout":
			log.Warn().Uint("deviceID", deviceID).Msg("Pairing via kode timeout")
			return
		}
	}
}
