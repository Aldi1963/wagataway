/**
 * Target kembali setelah login berhasil (mis. /redeem?code=HEMAT50).
 *
 * Disimpan di sessionStorage — bukan localStorage — supaya target usang
 * tidak bertahan antar sesi browser. Hanya path relatif same-origin yang
 * diterima, agar nilai ini tidak bisa dipakai sebagai open redirect.
 */
const KEY = "wag-post-login-redirect";

export function savePostLoginRedirect(target: string) {
  if (target.startsWith("/") && !target.startsWith("//")) {
    sessionStorage.setItem(KEY, target);
  }
}

/** Ambil target tersimpan (sekali pakai); null bila tidak ada / tidak valid. */
export function consumePostLoginRedirect(): string | null {
  const target = sessionStorage.getItem(KEY);
  sessionStorage.removeItem(KEY);
  if (target && target.startsWith("/") && !target.startsWith("//")) {
    return target;
  }
  return null;
}
