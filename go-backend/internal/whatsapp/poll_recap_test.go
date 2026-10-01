package whatsapp

import (
	"crypto/sha256"
	"strings"
	"testing"
)

func TestMatchPollVoteHashes(t *testing.T) {
	options := []string{"Senin pagi", "Selasa siang", "Rabu sore"}
	hash := func(s string) []byte {
		h := sha256.Sum256([]byte(s))
		return h[:]
	}

	// Satu vote cocok ke indeks yang benar.
	got := matchPollVoteHashes(options, [][]byte{hash("Selasa siang")})
	if len(got) != 1 || got[0] != 1 {
		t.Fatalf("harus cocok ke indeks 1, dapat %v", got)
	}

	// Banyak pilihan (poll allowMultiple).
	got = matchPollVoteHashes(options, [][]byte{hash("Rabu sore"), hash("Senin pagi")})
	if len(got) != 2 || got[0] != 2 || got[1] != 0 {
		t.Fatalf("harus cocok ke indeks [2 0], dapat %v", got)
	}

	// Hash asing diabaikan, hash rusak (bukan 32 byte) dilewati.
	got = matchPollVoteHashes(options, [][]byte{hash("Tidak ada"), {1, 2, 3}})
	if len(got) != 0 {
		t.Fatalf("hash asing harus diabaikan, dapat %v", got)
	}

	// Kosong.
	if got := matchPollVoteHashes(options, nil); len(got) != 0 {
		t.Fatalf("nil harus menghasilkan kosong, dapat %v", got)
	}
}

func TestBuildPollRecapText(t *testing.T) {
	text := BuildPollRecapText(
		"Pilih jadwal meeting",
		[]string{"Senin pagi", "Selasa siang", "Rabu sore"},
		[]int{3, 1, 0},
		4,
	)

	for _, want := range []string{
		"Rekap Hasil Polling",
		"Pilih jadwal meeting",
		"1. Senin pagi — *3* suara (75%)",
		"2. Selasa siang — *1* suara (25%)",
		"3. Rabu sore — *0* suara (0%)",
		"Total: 4 suara dari 4 pemilih",
	} {
		if !strings.Contains(text, want) {
			t.Errorf("rekap harus memuat %q.\nDapat:\n%s", want, text)
		}
	}
}

func TestBuildPollRecapTextNoVotes(t *testing.T) {
	text := BuildPollRecapText("Makan apa?", []string{"Nasi", "Mie"}, []int{0, 0}, 0)
	if !strings.Contains(text, "Total: 0 suara dari 0 pemilih") {
		t.Errorf("rekap tanpa vote harus aman dari pembagian nol.\nDapat:\n%s", text)
	}
	if strings.Contains(text, "NaN") {
		t.Errorf("rekap tidak boleh memuat NaN.\nDapat:\n%s", text)
	}
}

func TestPollOptionHashMatchesWhatsmeowConvention(t *testing.T) {
	// whatsmeow.HashPollOptions = SHA-256 dari nama opsi mentah.
	h := pollOptionHash("Opsi A")
	want := sha256.Sum256([]byte("Opsi A"))
	if h != want {
		t.Fatal("hash opsi harus SHA-256 dari nama opsi")
	}
}
