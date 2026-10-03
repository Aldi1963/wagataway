package whatsapp

import "encoding/json"

// ChatReaction adalah satu reaksi emoji pada sebuah pesan.
// fromMe=true → reaksi dikirim dari perangkat kita sendiri.
type ChatReaction struct {
	Emoji  string `json:"emoji"`
	FromMe bool   `json:"fromMe"`
}

// ParseChatReactions membaca kolom Reactions (JSON array) menjadi slice.
// String kosong / JSON rusak → slice kosong (tidak error).
func ParseChatReactions(s string) []ChatReaction {
	if s == "" {
		return nil
	}
	var out []ChatReaction
	if err := json.Unmarshal([]byte(s), &out); err != nil {
		return nil
	}
	return out
}

// marshalChatReactions mengembalikan JSON array; selalu "[]" bukan "null"
// agar konsisten dibaca frontend.
func marshalChatReactions(r []ChatReaction) string {
	if len(r) == 0 {
		return "[]"
	}
	b, err := json.Marshal(r)
	if err != nil {
		return "[]"
	}
	return string(b)
}

// AddChatReaction menambah/mengganti reaksi milik satu sisi (fromMe).
// Bila emoji kosong → hanya menghapus reaksi sisi tersebut.
func AddChatReaction(current, emoji string, fromMe bool) string {
	r := ParseChatReactions(current)
	kept := r[:0]
	for _, x := range r {
		if x.FromMe != fromMe {
			kept = append(kept, x)
		}
	}
	if emoji != "" {
		kept = append(kept, ChatReaction{Emoji: emoji, FromMe: fromMe})
	}
	return marshalChatReactions(kept)
}
