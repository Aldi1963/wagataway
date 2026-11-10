package whatsapp

import (
	"strings"
	"sync"
)

// Batasan performa pembersih nomor otomatis sebelum blast (Fitur 4):
// - Batch 100 nomor per panggilan IsOnWhatsApp (WhatsApp membatasi ukuran query).
// - Maks 5 panggilan paralel (worker pool kecil, tidak membanjiri server WA).
// - Untuk 1000 nomor (maks blast): 10 panggilan dalam ~2 gelombang, biasanya
//   selesai dalam beberapa detik. Bila ribuan nomor dibutuhkan, naikkan batas
//   blast di handler, bukan di sini.
const (
	cleanBatchSize = 100
	cleanWorkers   = 5
)

// dedupePhones membuang entri kosong dan duplikat (perbandingan digit mentah
// setelah trim), mempertahankan urutan kemunculan pertama.
func dedupePhones(phones []string) []string {
	seen := map[string]bool{}
	out := make([]string, 0, len(phones))
	for _, p := range phones {
		p = strings.TrimSpace(p)
		if p == "" || seen[p] {
			continue
		}
		seen[p] = true
		out = append(out, p)
	}
	return out
}

// chunkStrings memotong slice menjadi potongan-potongan berukuran size.
func chunkStrings(in []string, size int) [][]string {
	if size <= 0 {
		size = cleanBatchSize
	}
	var chunks [][]string
	for i := 0; i < len(in); i += size {
		end := i + size
		if end > len(in) {
			end = len(in)
		}
		chunks = append(chunks, in[i:end])
	}
	return chunks
}

// filterRegisteredNumbers memisahkan nomor yang terdaftar di WA (valid) dari
// yang tidak (excluded). Fungsi check disuntikkan agar bisa di-unit-test tanpa
// koneksi WA sungguhan. Urutan nomor valid mengikuti urutan input.
func filterRegisteredNumbers(
	phones []string,
	check func(batch []string) ([]NumberCheckResult, error),
) (valid []string, excluded []string, dupCount int, err error) {
	deduped := dedupePhones(phones)
	dupCount = len(phones) - len(deduped)
	if len(deduped) == 0 {
		return nil, nil, dupCount, nil
	}

	chunks := chunkStrings(deduped, cleanBatchSize)

	// Peta hasil per nomor: number -> registered. Diisi paralel, dibaca setelah
	// semua worker selesai, jadi aman tanpa lock tambahan per hasil (pakai mutex).
	results := make(map[string]bool, len(deduped))
	var mu sync.Mutex
	sem := make(chan struct{}, cleanWorkers)
	var wg sync.WaitGroup
	var firstErr error
	var errMu sync.Mutex

	for _, chunk := range chunks {
		wg.Add(1)
		go func(batch []string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			res, e := check(batch)
			if e != nil {
				errMu.Lock()
				if firstErr == nil {
					firstErr = e
				}
				errMu.Unlock()
				return
			}
			mu.Lock()
			for _, r := range res {
				results[r.Number] = r.Registered
			}
			mu.Unlock()
		}(chunk)
	}
	wg.Wait()

	if firstErr != nil {
		return nil, nil, dupCount, firstErr
	}

	// Urutan output mengikuti urutan input (bukan urutan selesai worker).
	for _, p := range deduped {
		if results[p] {
			valid = append(valid, p)
		} else {
			excluded = append(excluded, p)
		}
	}
	return valid, excluded, dupCount, nil
}

// FilterRegisteredNumbers mengecek nomor-nomor via IsOnWhatsApp memakai device
// yang dipilih, mengembalikan daftar nomor valid dan nomor yang dicoret
// (tidak terdaftar di WA) beserta jumlah duplikat yang dibuang.
// Dipakai fitur "Coret otomatis nomor tidak valid" sebelum blast — validasi
// ini berjalan SEBELUM distribusi round-robin ke device pengirim.
func (m *Manager) FilterRegisteredNumbers(deviceID uint, phones []string) (valid []string, excluded []string, dupCount int, err error) {
	return filterRegisteredNumbers(phones, func(batch []string) ([]NumberCheckResult, error) {
		return m.CheckNumbersRegistered(deviceID, batch)
	})
}
