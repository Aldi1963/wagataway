package whatsapp

import (
	"fmt"
	"reflect"
	"sync"
	"testing"
	"time"
)

// fakeCheck meniru IsOnWhatsApp: nomor yang diakhiri "0" dianggap tidak terdaftar.
func fakeCheck(batch []string) ([]NumberCheckResult, error) {
	out := make([]NumberCheckResult, 0, len(batch))
	for _, b := range batch {
		out = append(out, NumberCheckResult{
			Number:     b,
			Registered: len(b) > 0 && b[len(b)-1] != '0',
		})
	}
	return out, nil
}

func TestDedupePhones(t *testing.T) {
	in := []string{"6281", " 6282 ", "", "6281", "6283", "6282"}
	got := dedupePhones(in)
	want := []string{"6281", "6282", "6283"}
	if !reflect.DeepEqual(got, want) {
		t.Fatalf("dedupePhones = %v, want %v", got, want)
	}
}

func TestChunkStrings(t *testing.T) {
	in := []string{"a", "b", "c", "d", "e"}
	got := chunkStrings(in, 2)
	if len(got) != 3 || len(got[2]) != 1 {
		t.Fatalf("chunkStrings = %v, want 3 potongan (2,2,1)", got)
	}
}

func TestFilterRegisteredNumbers(t *testing.T) {
	// 120 nomor: tiap nomor kelipatan 10 berakhiran "0" -> tidak terdaftar.
	var phones []string
	for i := 1; i <= 120; i++ {
		phones = append(phones, fmt.Sprintf("6281000%04d", i*10))
	}
	// Sisipkan duplikat + entri kosong (keduanya ikut "dibersihkan").
	phones = append(phones, phones[0], phones[5], "   ")

	valid, excluded, cleaned, err := filterRegisteredNumbers(phones, fakeCheck)
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if cleaned != 3 {
		t.Fatalf("dupCount = %d, want 3 (2 duplikat + 1 kosong)", cleaned)
	}
	// 120 nomor unik; yang berakhiran "0" semuanya -> 120 tidak terdaftar.
	if len(valid) != 0 {
		t.Fatalf("valid = %d nomor, want 0", len(valid))
	}
	if len(excluded) != 120 {
		t.Fatalf("excluded = %d nomor, want 120", len(excluded))
	}

	// Campuran: nomor valid harus mempertahankan urutan input.
	phones2 := []string{"6281111", "6282220", "6283333", "6284440"}
	valid, excluded, cleaned, err = filterRegisteredNumbers(phones2, fakeCheck)
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if !reflect.DeepEqual(valid, []string{"6281111", "6283333"}) {
		t.Fatalf("valid = %v", valid)
	}
	if !reflect.DeepEqual(excluded, []string{"6282220", "6284440"}) {
		t.Fatalf("excluded = %v", excluded)
	}
	if cleaned != 0 {
		t.Fatalf("dupCount = %d, want 0", cleaned)
	}
}

func TestFilterRegisteredNumbersError(t *testing.T) {
	boom := fmt.Errorf("WA down")
	_, _, _, err := filterRegisteredNumbers([]string{"6281", "6282"}, func([]string) ([]NumberCheckResult, error) {
		return nil, boom
	})
	if err != boom {
		t.Fatalf("err = %v, want %v", err, boom)
	}
}

func TestFilterRegisteredNumbersParallel(t *testing.T) {
	// Pastikan pemanggilan check berjalan paralel (maks cleanWorkers),
	// bukan sekuensial: 12 batch x 100 nomor.
	var phones []string
	for i := 0; i < 1200; i++ {
		phones = append(phones, fmt.Sprintf("6289%07d", i+1))
	}
	var mu sync.Mutex
	maxInFlight := 0
	inFlight := 0
	batches := 0
	_, _, _, err := filterRegisteredNumbers(phones, func(batch []string) ([]NumberCheckResult, error) {
		mu.Lock()
		batches++
		inFlight++
		if inFlight > maxInFlight {
			maxInFlight = inFlight
		}
		mu.Unlock()
		time.Sleep(20 * time.Millisecond) // simulasi latensi query WA agar overlap teramati
		mu.Lock()
		inFlight--
		mu.Unlock()
		out := make([]NumberCheckResult, 0, len(batch))
		for _, b := range batch {
			out = append(out, NumberCheckResult{Number: b, Registered: true})
		}
		return out, nil
	})
	if err != nil {
		t.Fatalf("err = %v", err)
	}
	if batches != 12 {
		t.Fatalf("batches = %d, want 12", batches)
	}
	if maxInFlight < 2 {
		t.Fatalf("maxInFlight = %d, validasi berjalan sekuensial (ingin paralel)", maxInFlight)
	}
	if maxInFlight > cleanWorkers {
		t.Fatalf("maxInFlight = %d, melebihi batas worker %d", maxInFlight, cleanWorkers)
	}
}
