package whatsapp

import (
	"testing"

	"go.mau.fi/whatsmeow/types"
)

func TestBuildWelcomeText(t *testing.T) {
	jid := func(user string) types.JID { return types.JID{User: user, Server: "s.whatsapp.net"} }

	tests := []struct {
		name       string
		welcomeMsg string
		join       []types.JID
		selfUser   string
		want       string
	}{
		{
			name:       "satu anggota baru",
			welcomeMsg: "Selamat datang di grup!",
			join:       []types.JID{jid("6281234567890")},
			selfUser:   "6287847222941",
			want:       "Selamat datang di grup!\n@6281234567890 ",
		},
		{
			name:       "beberapa anggota baru",
			welcomeMsg: "Halo semua",
			join:       []types.JID{jid("628111"), jid("628222")},
			selfUser:   "6287847222941",
			want:       "Halo semua\n@628111 @628222 ",
		},
		{
			name:       "device sendiri yang join dilewati",
			welcomeMsg: "Halo",
			join:       []types.JID{jid("6287847222941")},
			selfUser:   "6287847222941",
			want:       "",
		},
		{
			name:       "campuran: self dilewati, anggota lain disambut",
			welcomeMsg: "Halo",
			join:       []types.JID{jid("6287847222941"), jid("628999")},
			selfUser:   "6287847222941",
			want:       "Halo\n@628999 ",
		},
		{
			name:       "JID kosong dilewati",
			welcomeMsg: "Halo",
			join:       []types.JID{{}},
			selfUser:   "6287847222941",
			want:       "",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := buildWelcomeText(tt.welcomeMsg, tt.join, tt.selfUser); got != tt.want {
				t.Errorf("buildWelcomeText() = %q, want %q", got, tt.want)
			}
		})
	}
}
