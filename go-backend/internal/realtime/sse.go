package realtime

import (
	"encoding/json"
	"fmt"
	"sync"
	"time"
)

// Event represents a server-sent event
type Event struct {
	Type    string      `json:"type"`
	Payload interface{} `json:"payload"`
}

// Client is a connected SSE client
type Client struct {
	ID     string
	UserID uint
	Events chan Event
	Done   chan struct{}
}

// Hub manages all SSE connections
type Hub struct {
	clients map[uint][]*Client // userID -> clients
	mu      sync.RWMutex
}

var DefaultHub = NewHub()

func NewHub() *Hub {
	return &Hub{
		clients: make(map[uint][]*Client),
	}
}


// Register adds a client to the hub
func (h *Hub) Register(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client.UserID] = append(h.clients[client.UserID], client)
}

// Unregister removes a client from the hub
func (h *Hub) Unregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	clients := h.clients[client.UserID]
	for i, c := range clients {
		if c.ID == client.ID {
			h.clients[client.UserID] = append(clients[:i], clients[i+1:]...)
			break
		}
	}
}

// SendToUser sends an event to all clients of a user
func (h *Hub) SendToUser(userID uint, evt Event) {
	h.mu.RLock()
	clients := h.clients[userID]
	h.mu.RUnlock()

	for _, c := range clients {
		select {
		case c.Events <- evt:
		default:
			// Client buffer full, skip
		}
	}
}

// FormatSSE formats an event for SSE protocol
func FormatSSE(eventType string, data interface{}) string {
	jsonData, _ := json.Marshal(data)
	return fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, string(jsonData))
}

// Heartbeat sends periodic keepalive pings
func Heartbeat(client *Client) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			select {
			case client.Events <- Event{Type: "ping", Payload: nil}:
			default:
			}
		case <-client.Done:
			return
		}
	}
}


// Register adds a client to the hub
func (h *Hub) Register(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	h.clients[client.UserID] = append(h.clients[client.UserID], client)
}

// Unregister removes a client from the hub
func (h *Hub) Unregister(client *Client) {
	h.mu.Lock()
	defer h.mu.Unlock()
	clients := h.clients[client.UserID]
	for i, c := range clients {
		if c.ID == client.ID {
			h.clients[client.UserID] = append(clients[:i], clients[i+1:]...)
			break
		}
	}
}

// SendToUser sends an event to all connected clients of a user
func (h *Hub) SendToUser(userID uint, evt Event) {
	h.mu.RLock()
	clients := h.clients[userID]
	h.mu.RUnlock()

	for _, c := range clients {
		select {
		case c.Events <- evt:
		default:
		}
	}
}

// FormatSSE formats a server-sent event string
func FormatSSE(eventType string, data interface{}) string {
	jsonData, _ := json.Marshal(data)
	return fmt.Sprintf("event: %s\ndata: %s\n\n", eventType, string(jsonData))
}

// Heartbeat sends periodic keepalive pings
func Heartbeat(client *Client) {
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-ticker.C:
			select {
			case client.Events <- Event{Type: "ping", Payload: nil}:
			default:
			}
		case <-client.Done:
			return
		}
	}
}
