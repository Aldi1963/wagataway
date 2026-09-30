package models

import "time"

// RecurringSchedule adalah jadwal pesan berulang (harian/mingguan/bulanan).
// Backend menghitung NextRunAt dari Frequency + Time + DayOfWeek/DayOfMonth.
type RecurringSchedule struct {
	ID         uint       `gorm:"primaryKey" json:"id"`
	UserID     uint       `gorm:"index;not null" json:"userId"`
	Name       string     `gorm:"size:255;not null" json:"name"`
	DeviceID   uint       `gorm:"index" json:"deviceId"`
	Target     string     `gorm:"size:30;not null" json:"target"` // nomor tujuan
	Message    string     `gorm:"type:text;not null" json:"message"`
	MediaURL   string     `gorm:"size:500" json:"mediaUrl"`
	Frequency  string     `gorm:"size:20;not null" json:"frequency"` // daily, weekly, monthly
	Time       string     `gorm:"size:5;not null" json:"time"`        // HH:MM (WIB)
	DayOfWeek  *int       `json:"dayOfWeek"`                         // 0-6 (Minggu=0), untuk weekly
	DayOfMonth *int       `json:"dayOfMonth"`                        // 1-31, untuk monthly
	IsActive   bool       `gorm:"default:true" json:"isActive"`
	LastRunAt  *time.Time `json:"lastRunAt"`
	NextRunAt  *time.Time `gorm:"index" json:"nextRunAt"`
	CreatedAt  time.Time  `json:"createdAt"`
	UpdatedAt  time.Time  `json:"updatedAt"`

	User User `gorm:"foreignKey:UserID" json:"-"`
}
