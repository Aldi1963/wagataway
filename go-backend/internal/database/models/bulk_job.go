package models

import (
	"encoding/json"
	"time"

	"gorm.io/gorm"
)

type BulkJob struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `gorm:"index;not null" json:"userId"`
	DeviceID    uint           `gorm:"index;not null" json:"deviceId"` // device utama (kompatibilitas job lama)
	// DeviceIDs: JSON array ID perangkat pengirim untuk rotasi round-robin + failover.
	// Kosong = fallback ke DeviceID tunggal (job yang dibuat sebelum fitur rotasi).
	DeviceIDs string `gorm:"size:255" json:"-"`
	Name        string         `gorm:"size:255" json:"name"`
	Type        string         `gorm:"size:20;default:text" json:"type"`
	Content     string         `gorm:"type:text" json:"content"`
	MediaURL    string         `gorm:"size:500" json:"mediaUrl"`
	Caption     string         `gorm:"type:text" json:"caption"`
	Status      string         `gorm:"size:20;default:pending" json:"status"` // pending, processing, completed, failed, cancelled
	TotalCount  int            `gorm:"default:0" json:"totalCount"`
	SentCount   int            `gorm:"default:0" json:"sentCount"`
	FailedCount int            `gorm:"default:0" json:"failedCount"`
	// Fitur 4 — pembersih nomor otomatis sebelum blast:
	// AutoClean: toggle user saat membuat job. SkippedCount: jumlah nomor yang
	// dicoret (tidak terdaftar di WA). SkippedNumbers: JSON array nomor yang
	// dicoret, untuk audit user.
	AutoClean      bool   `gorm:"default:false" json:"autoClean"`
	SkippedCount   int    `gorm:"default:0" json:"skippedCount"`
	SkippedNumbers string `gorm:"type:text" json:"-"`
	MinDelay    int            `gorm:"default:3" json:"minDelay"` // seconds between messages
	MaxDelay    int            `gorm:"default:8" json:"maxDelay"`
	StartedAt   *time.Time     `json:"startedAt"`
	CompletedAt *time.Time     `json:"completedAt"`
	CreatedAt   time.Time      `json:"createdAt"`
	UpdatedAt   time.Time      `json:"updatedAt"`
	DeletedAt   gorm.DeletedAt `gorm:"index" json:"-"`

	// Relations
	User       User               `gorm:"foreignKey:UserID" json:"-"`
	Device     Device             `gorm:"foreignKey:DeviceID" json:"-"`
	Recipients []BulkJobRecipient `gorm:"foreignKey:BulkJobID" json:"-"`
}

type BulkJobRecipient struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	BulkJobID uint       `gorm:"index;not null" json:"bulkJobId"`
	Phone     string     `gorm:"size:20;not null" json:"phone"`
	Name      string     `gorm:"size:255" json:"name"`
	// DeviceID: device yang benar-benar mengirim pesan ini (bisa berbeda dari
	// device utama job karena rotasi/failover antar device).
	DeviceID  uint       `gorm:"index" json:"deviceId"`
	Status    string     `gorm:"size:20;default:pending" json:"status"` // pending, sent, failed
	ErrorMsg  string     `gorm:"type:text" json:"errorMsg"`
	SentAt    *time.Time `json:"sentAt"`
	CreatedAt time.Time  `json:"createdAt"`
}

// GetDeviceIDs mengembalikan daftar device pengirim job ini.
// Order dari request dipertahankan, duplikat dan ID 0 dibuang.
// Job lama (DeviceIDs kosong) fallback ke DeviceID tunggal.
func (j *BulkJob) GetDeviceIDs() []uint {
	var ids []uint
	if j.DeviceIDs != "" {
		if err := json.Unmarshal([]byte(j.DeviceIDs), &ids); err == nil && len(ids) > 0 {
			seen := map[uint]bool{}
			out := make([]uint, 0, len(ids))
			for _, id := range ids {
				if id == 0 || seen[id] {
					continue
				}
				seen[id] = true
				out = append(out, id)
			}
			if len(out) > 0 {
				return out
			}
		}
	}
	if j.DeviceID != 0 {
		return []uint{j.DeviceID}
	}
	return nil
}
