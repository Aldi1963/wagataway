package whatsapp

import (
	"context"
	"fmt"
	"strings"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/types"
)

// connectedClient mengembalikan whatsmeow client untuk device yang connected.
func (m *Manager) connectedClient(deviceID uint) (*whatsmeow.Client, error) {
	m.mu.RLock()
	sess, exists := m.sessions[deviceID]
	m.mu.RUnlock()

	if !exists || sess.Status != "connected" || sess.Client == nil {
		return nil, fmt.Errorf("device %d tidak terhubung", deviceID)
	}
	return sess.Client, nil
}

// parseGroupJID menerima "xxx@g.us" atau "xxx" dan mengembalikan JID grup.
func parseGroupJID(s string) (types.JID, error) {
	s = strings.TrimSpace(s)
	if s == "" {
		return types.JID{}, fmt.Errorf("JID grup kosong")
	}
	if strings.Contains(s, "@") {
		parts := strings.SplitN(s, "@", 2)
		user := strings.TrimSpace(parts[0])
		server := strings.TrimSpace(parts[1])
		if user == "" || server != types.GroupServer {
			return types.JID{}, fmt.Errorf("format JID grup tidak valid (harus xxx@g.us)")
		}
		return types.NewJID(user, types.GroupServer), nil
	}
	return types.NewJID(s, types.GroupServer), nil
}

// normalizeParticipantJIDs mengubah daftar nomor HP menjadi JID unik,
// melewati nomor yang formatnya tidak valid.
func normalizeParticipantJIDs(phones []string) ([]types.JID, []string) {
	seen := map[string]bool{}
	var jids []types.JID
	var skipped []string
	for _, p := range phones {
		jid, err := parseJID(p)
		if err != nil {
			skipped = append(skipped, p)
			continue
		}
		key := jid.String()
		if seen[key] {
			continue
		}
		seen[key] = true
		jids = append(jids, jid)
	}
	return jids, skipped
}

// CreateWAGroup membuat grup WA baru. Nama grup dibatasi 25 karakter oleh WA.
func (m *Manager) CreateWAGroup(deviceID uint, name string, participantPhones []string) (*types.GroupInfo, error) {
	cli, err := m.connectedClient(deviceID)
	if err != nil {
		return nil, err
	}

	participants, _ := normalizeParticipantJIDs(participantPhones)

	info, err := cli.CreateGroup(context.Background(), whatsmeow.ReqCreateGroup{
		Name:         name,
		Participants: participants,
	})
	if err != nil {
		return nil, err
	}
	return info, nil
}

// UpdateWAGroupParticipants menambah/mengurangi peserta grup.
// action: "add" atau "remove".
func (m *Manager) UpdateWAGroupParticipants(deviceID uint, groupJID string, participantPhones []string, action string) error {
	cli, err := m.connectedClient(deviceID)
	if err != nil {
		return err
	}
	gjid, err := parseGroupJID(groupJID)
	if err != nil {
		return err
	}

	var change whatsmeow.ParticipantChange
	switch action {
	case "add":
		change = whatsmeow.ParticipantChangeAdd
	case "remove":
		change = whatsmeow.ParticipantChangeRemove
	default:
		return fmt.Errorf("action harus 'add' atau 'remove'")
	}

	participants, skipped := normalizeParticipantJIDs(participantPhones)
	if len(participants) == 0 {
		return fmt.Errorf("tidak ada nomor peserta yang valid")
	}

	_, err = cli.UpdateGroupParticipants(context.Background(), gjid, participants, change)
	if err != nil {
		return err
	}
	_ = skipped
	return nil
}

// SetWAGroupMeta memperbarui nama dan/atau deskripsi (topik) grup.
// Kirim string kosong untuk melewati salah satunya.
func (m *Manager) SetWAGroupMeta(deviceID uint, groupJID, name, topic string) error {
	cli, err := m.connectedClient(deviceID)
	if err != nil {
		return err
	}
	gjid, err := parseGroupJID(groupJID)
	if err != nil {
		return err
	}
	ctx := context.Background()

	if name != "" {
		if err := cli.SetGroupName(ctx, gjid, name); err != nil {
			return fmt.Errorf("gagal update nama grup: %w", err)
		}
	}
	if topic != "" {
		if err := cli.SetGroupTopic(ctx, gjid, "", "", topic); err != nil {
			return fmt.Errorf("gagal update deskripsi grup: %w", err)
		}
	}
	return nil
}

// NumberCheckResult adalah hasil validasi satu nomor.
type NumberCheckResult struct {
	Number     string `json:"number"`
	Registered bool   `json:"registered"`
	JID        string `json:"jid"`
}

// CheckNumbersRegistered mengecek banyak nomor sekaligus dalam satu panggilan
// IsOnWhatsApp ke server WA.
func (m *Manager) CheckNumbersRegistered(deviceID uint, phones []string) ([]NumberCheckResult, error) {
	cli, err := m.connectedClient(deviceID)
	if err != nil {
		return nil, err
	}

	type entry struct {
		raw  string
		user string
	}
	var entries []entry
	var users []string
	seen := map[string]bool{}
	for _, p := range phones {
		jid, err := parseJID(p)
		if err != nil || jid.User == "" {
			continue
		}
		if seen[jid.User] {
			continue
		}
		seen[jid.User] = true
		entries = append(entries, entry{raw: p, user: jid.User})
		users = append(users, jid.User)
	}
	if len(users) == 0 {
		return nil, fmt.Errorf("tidak ada nomor yang valid")
	}

	resp, err := cli.IsOnWhatsApp(context.Background(), users)
	if err != nil {
		return nil, err
	}

	registered := map[string]types.JID{} // query phone -> JID nomor HP
	for _, r := range resp {
		if r.IsIn {
			// JID bisa berupa LID (addressing_mode=lid); nomor HP ada di PhoneNumber.
			jid := r.JID
			if !r.PhoneNumber.IsEmpty() && r.PhoneNumber.Server == types.DefaultUserServer {
				jid = r.PhoneNumber
			}
			registered[r.Query] = jid
		}
	}

	results := make([]NumberCheckResult, 0, len(entries))
	for _, e := range entries {
		jid, ok := registered[e.user]
		jidStr := ""
		if ok {
			jidStr = jid.String()
		}
		results = append(results, NumberCheckResult{
			Number:     e.raw,
			Registered: ok,
			JID:        jidStr,
		})
	}
	return results, nil
}
