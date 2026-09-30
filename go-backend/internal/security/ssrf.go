// Package security berisi utilitas pertahanan untuk request HTTP keluar
// (outbound) yang URL-nya berasal dari input user: webhook, media URL,
// dsb. Tujuannya mencegah SSRF — server dipaksa mengakses layanan
// internal (127.0.0.1, 10/8, 169.254.169.254, dsb).
package security

import (
	"context"
	"errors"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"time"
)

// ValidateOutboundURL memeriksa apakah URL aman untuk diakses server:
// skema harus http/https, host tidak boleh kosong, dan SEMUA hasil
// resolve DNS host tersebut harus IP publik (bukan loopback, privat,
// link-local, multicast, atau unspecified).
func ValidateOutboundURL(rawURL string) error {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return errors.New("URL tidak boleh kosong")
	}

	u, err := url.Parse(rawURL)
	if err != nil {
		return fmt.Errorf("URL tidak valid: %v", err)
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return errors.New("skema URL harus http atau https")
	}
	host := u.Hostname()
	if host == "" {
		return errors.New("host URL tidak boleh kosong")
	}

	ips, err := net.LookupIP(host)
	if err != nil || len(ips) == 0 {
		return fmt.Errorf("host %q tidak dapat di-resolve", host)
	}
	for _, ip := range ips {
		if !isPublicIP(ip) {
			return fmt.Errorf("host %q menunjuk ke alamat internal (%s) yang tidak diizinkan", host, ip.String())
		}
	}
	return nil
}

// isPublicIP true bila IP bukan loopback, privat, link-local,
// multicast, atau unspecified.
func isPublicIP(ip net.IP) bool {
	if ip.IsLoopback() ||
		ip.IsPrivate() || // 10/8, 172.16/12, 192.168/16
		ip.IsLinkLocalUnicast() || // 169.254/16, fe80::/10
		ip.IsLinkLocalMulticast() ||
		ip.IsMulticast() ||
		ip.IsUnspecified() {
		return false
	}
	return true
}

// NewSafeClient membuat http.Client untuk request outbound:
//   - timeout sesuai parameter,
//   - redirect TIDAK diikuti (mengembalikan respons 3xx apa adanya),
//   - dial menolak koneksi ke IP non-publik — melindungi dari DNS
//     rebinding (IP berubah setelah validasi).
func NewSafeClient(timeout time.Duration) *http.Client {
	return &http.Client{
		Timeout: timeout,
		CheckRedirect: func(req *http.Request, via []*http.Request) error {
			return http.ErrUseLastResponse
		},
		Transport: &http.Transport{
			DialContext: safeDialContext(timeout),
		},
	}
}

// safeDialContext mengembalikan dial function yang me-resolve host,
// menolak bila ada IP non-publik, lalu dial ke IP yang tervalidasi.
func safeDialContext(timeout time.Duration) func(ctx context.Context, network, addr string) (net.Conn, error) {
	d := &net.Dialer{Timeout: timeout}
	return func(ctx context.Context, network, addr string) (net.Conn, error) {
		host, port, err := net.SplitHostPort(addr)
		if err != nil {
			return nil, err
		}
		ips, err := net.DefaultResolver.LookupIP(ctx, "ip", host)
		if err != nil || len(ips) == 0 {
			return nil, fmt.Errorf("gagal me-resolve host %q", host)
		}
		for _, ip := range ips {
			if !isPublicIP(ip) {
				return nil, fmt.Errorf("koneksi ke %s (%s) ditolak: alamat internal", host, ip.String())
			}
		}
		// Dial langsung ke IP tervalidasi (tanpa resolve ulang).
		// SNI/verifikasi sertifikat TLS tetap memakai hostname asli dari URL.
		return d.DialContext(ctx, network, net.JoinHostPort(ips[0].String(), port))
	}
}
