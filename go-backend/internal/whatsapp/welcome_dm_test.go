package whatsapp

import (
	"testing"

	"go.mau.fi/whatsmeow/types"
)

func TestRenderWelcomeDM(t *testing.T) {
	tests := []struct {
		name      string
		template  string
		member    string
		groupName string
		want      string
	}{
		{
			name:      "variabel nama dan grup diganti",
			template:  "Halo {nama}, selamat datang di {grup}! 🙏",
			member:    "Budi",
			groupName: "Pelanggan VIP",
			want:      "Halo Budi, selamat datang di Pelanggan VIP! 🙏",
		},
		{
			name:      "tanpa variabel",
			template:  "Selamat datang!",
			member:    "Budi",
			groupName: "G",
			want:      "Selamat datang!",
		},
		{
			name:      "variabel berulang",
			template:  "{nama} masuk {grup}, halo {nama}!",
			member:    "Ani",
			groupName: "Komunitas",
			want:      "Ani masuk Komunitas, halo Ani!",
		},
		{
			name:      "placeholder lain tidak disentuh",
			template:  "Halo {nama}, kode {kode}",
			member:    "Budi",
			groupName: "G",
			want:      "Halo Budi, kode {kode}",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := renderWelcomeDM(tt.template, tt.member, tt.groupName); got != tt.want {
				t.Fatalf("renderWelcomeDM() = %q, want %q", got, tt.want)
			}
		})
	}
}

func TestShouldSkipWelcomeDM(t *testing.T) {
	jid := func(user, server string, device uint16) types.JID {
		return types.JID{User: user, Server: server, Device: device}
	}
	pn := types.DefaultUserServer
	lid := types.HiddenUserServer

	tests := []struct {
		name     string
		j        types.JID
		selfUser string
		leaveSet map[string]bool
		skip     bool
	}{
		{
			name:     "anggota normal tidak dilewati",
			j:        jid("6281234567890", pn, 0),
			selfUser: "6287847222941",
			leaveSet: map[string]bool{},
			skip:     false,
		},
		{
			name:     "JID LID tidak dilewati",
			j:        jid("29897368010797", lid, 0),
			selfUser: "6287847222941",
			leaveSet: map[string]bool{},
			skip:     false,
		},
		{
			name:     "nomor sendiri dilewati",
			j:        jid("6287847222941", pn, 0),
			selfUser: "6287847222941",
			leaveSet: map[string]bool{},
			skip:     true,
		},
		{
			name:     "bot dilewati",
			j:        jid("13135550002", pn, 0), // MetaAI
			selfUser: "6287847222941",
			leaveSet: map[string]bool{},
			skip:     true,
		},
		{
			name:     "perangkat pendamping dilewati",
			j:        jid("6281234567890", pn, 1),
			selfUser: "6287847222941",
			leaveSet: map[string]bool{},
			skip:     true,
		},
		{
			name:     "JID kosong dilewati",
			j:        types.JID{},
			selfUser: "6287847222941",
			leaveSet: map[string]bool{},
			skip:     true,
		},
		{
			name:     "join tapi langsung leave dilewati",
			j:        jid("6281234567890", pn, 0),
			selfUser: "6287847222941",
			leaveSet: map[string]bool{"6281234567890@" + pn: true},
			skip:     true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := shouldSkipWelcomeDM(tt.j, tt.selfUser, tt.leaveSet); got != tt.skip {
				t.Fatalf("shouldSkipWelcomeDM() = %v, want %v", got, tt.skip)
			}
		})
	}
}

func TestWelcomeDMKey(t *testing.T) {
	k1 := welcomeDMKey(1, "120363@g.us", "628123")
	k2 := welcomeDMKey(1, "120363@g.us", "628123")
	k3 := welcomeDMKey(1, "120363@g.us", "628456")
	k4 := welcomeDMKey(2, "120363@g.us", "628123")
	if k1 != k2 || k1 == k3 || k1 == k4 {
		t.Fatalf("welcomeDMKey tidak stabil/unik: %q %q %q %q", k1, k2, k3, k4)
	}
}
