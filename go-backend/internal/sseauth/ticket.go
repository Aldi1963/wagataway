// Package sseauth menerbitkan ticket sekali pakai untuk klien EventSource.
// EventSource tidak bisa mengirim header Authorization, sehingga sebelumnya
// JWT dikirim lewat query param (?token=) — ticket acak berumur pendek ini
// menggantikannya agar JWT tidak lagi bocor ke URL, log, atau histori browser.
package sseauth

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"sync"
	"time"
)

// TicketLifetime: masa berlaku ticket sejak diterbitkan.
const TicketLifetime = 60 * time.Second

// Ticket menyimpan identitas pemilik ticket.
type Ticket struct {
	UserID  uint
	Email   string
	Role    string
	Expires time.Time
}

var (
	mu      sync.Mutex
	tickets = make(map[string]Ticket)
)

func init() {
	go func() {
		t := time.NewTicker(5 * time.Minute)
		defer t.Stop()
		for range t.C {
			Cleanup()
		}
	}()
}

// Cleanup menghapus ticket yang sudah kedaluwarsa.
func Cleanup() {
	now := time.Now()
	mu.Lock()
	defer mu.Unlock()
	for k, v := range tickets {
		if v.Expires.Before(now) {
			delete(tickets, k)
		}
	}
}

// Issue membuat ticket acak sekali pakai (256-bit) untuk user.
func Issue(userID uint, email, role string) (string, error) {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	ticket := hex.EncodeToString(buf)

	mu.Lock()
	tickets[ticket] = Ticket{
		UserID:  userID,
		Email:   email,
		Role:    role,
		Expires: time.Now().Add(TicketLifetime),
	}
	mu.Unlock()

	return ticket, nil
}

// ErrInvalidTicket dikembalikan bila ticket tidak dikenal, kedaluwarsa,
// atau sudah pernah dipakai.
var ErrInvalidTicket = errors.New("invalid or expired ticket")

// Consume memvalidasi ticket dan menandainya terpakai (sekali pakai).
func Consume(ticket string) (Ticket, error) {
	mu.Lock()
	defer mu.Unlock()
	t, ok := tickets[ticket]
	if !ok || t.Expires.Before(time.Now()) {
		delete(tickets, ticket)
		return Ticket{}, ErrInvalidTicket
	}
	delete(tickets, ticket)
	return t, nil
}
