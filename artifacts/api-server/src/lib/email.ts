/**
 * Email Notification Service
 * Uses SMTP config from admin settings (serverConfig + smtp_password from DB)
 */
import nodemailer from "nodemailer";

// Injected from admin.ts to avoid circular imports
let getSmtpConfig: (() => Promise<{
  host: string; port: number; user: string; from: string; password: string; appName: string;
}>) | null = null;

export function registerSmtpConfigProvider(fn: typeof getSmtpConfig) {
  getSmtpConfig = fn;
}

async function createTransporter() {
  if (!getSmtpConfig) return null;
  const cfg = await getSmtpConfig();
  if (!cfg || !cfg.host || !cfg.user || !cfg.password) return null;
  return {
    transport: nodemailer.createTransport({
      host: cfg.host,
      port: Number(cfg.port),
      secure: Number(cfg.port) === 465,
      auth: { user: cfg.user, pass: cfg.password },
      tls: {
        rejectUnauthorized: false,
      },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    }),
    from: `"${cfg.appName}" <${cfg.from || cfg.user}>`,
    appName: cfg.appName,
  };
}

function baseTemplate(content: string, appName: string) {
  return `
  <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:0;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb">
    <div style="background:linear-gradient(135deg,#25d366,#128c7e);padding:24px 28px">
      <p style="color:white;font-size:20px;font-weight:bold;margin:0">${appName}</p>
    </div>
    <div style="padding:28px">
      ${content}
    </div>
    <div style="padding:16px 28px;background:#f9fafb;border-top:1px solid #e5e7eb">
      <p style="font-size:11px;color:#9ca3af;margin:0">Pesan ini dikirim secara otomatis oleh sistem ${appName}. Abaikan jika tidak relevan.</p>
    </div>
  </div>`;
}

export async function sendWelcomeEmail(to: string, name: string, plan: string): Promise<void> {
  const t = await createTransporter();
  if (!t) return;

  await t.transport.sendMail({
    from: t.from,
    to,
    subject: `Selamat datang di ${t.appName}! 🎉`,
    html: baseTemplate(`
      <h2 style="color:#111827;margin-top:0">Selamat datang, ${name}! 👋</h2>
      <p style="color:#374151">Akun Anda di <strong>${t.appName}</strong> telah berhasil dibuat.</p>
      <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #22c55e">
        <p style="margin:0;color:#15803d;font-weight:bold">Paket: ${plan.charAt(0).toUpperCase() + plan.slice(1)}</p>
      </div>
      <p style="color:#374151">Mulai dengan menghubungkan perangkat WhatsApp Anda dari dashboard.</p>
      <p style="color:#374151;margin-bottom:0">Salam,<br><strong>Tim ${t.appName}</strong></p>
    `, t.appName),
  });
}

export async function sendPasswordResetEmail(to: string, name: string, newPassword: string): Promise<void> {
  const t = await createTransporter();
  if (!t) return;

  await t.transport.sendMail({
    from: t.from,
    to,
    subject: `[${t.appName}] Password Anda Telah Direset`,
    html: baseTemplate(`
      <h2 style="color:#111827;margin-top:0">Reset Password</h2>
      <p style="color:#374151">Halo <strong>${name}</strong>,</p>
      <p style="color:#374151">Password akun Anda telah direset oleh administrator. Gunakan password baru berikut untuk login:</p>
      <div style="background:#fef3c7;border-radius:8px;padding:16px;margin:16px 0;text-align:center;border:1px dashed #f59e0b">
        <p style="margin:0;font-size:22px;font-weight:bold;font-family:monospace;letter-spacing:4px;color:#92400e">${newPassword}</p>
      </div>
      <p style="color:#ef4444;font-size:13px">⚠️ Segera ganti password setelah login untuk keamanan akun Anda.</p>
      <p style="color:#374151;margin-bottom:0">Salam,<br><strong>Tim ${t.appName}</strong></p>
    `, t.appName),
  });
}

export async function sendSubscriptionEmail(to: string, name: string, planName: string, periodEnd: Date): Promise<void> {
  const t = await createTransporter();
  if (!t) return;

  const endStr = periodEnd.toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });

  await t.transport.sendMail({
    from: t.from,
    to,
    subject: `[${t.appName}] Langganan ${planName} Aktif ✅`,
    html: baseTemplate(`
      <h2 style="color:#111827;margin-top:0">Langganan Berhasil Diaktifkan! 🎉</h2>
      <p style="color:#374151">Halo <strong>${name}</strong>,</p>
      <p style="color:#374151">Langganan Anda telah berhasil diaktifkan:</p>
      <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #22c55e">
        <p style="margin:0 0 4px;color:#374151;font-size:13px">Paket</p>
        <p style="margin:0;color:#15803d;font-size:20px;font-weight:bold">${planName}</p>
        <p style="margin:8px 0 0;color:#6b7280;font-size:13px">Berlaku hingga <strong style="color:#374151">${endStr}</strong></p>
      </div>
      <p style="color:#374151;margin-bottom:0">Nikmati semua fitur premium Anda.<br>Salam,<br><strong>Tim ${t.appName}</strong></p>
    `, t.appName),
  });
}

export async function sendDeviceAlertEmail(
  to: string,
  name: string,
  deviceName: string,
  event: "connected" | "disconnected",
  phone?: string | null,
): Promise<void> {
  const t = await createTransporter();
  if (!t) return;

  const isConn = event === "connected";
  const timeStr = new Date().toLocaleString("id-ID", { timeZone: "Asia/Jakarta", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

  await t.transport.sendMail({
    from: t.from,
    to,
    subject: `[${t.appName}] Perangkat "${deviceName}" ${isConn ? "Terhubung ✅" : "Terputus ⚠️"}`,
    html: baseTemplate(`
      <h2 style="color:#111827;margin-top:0">Notifikasi Perangkat WhatsApp</h2>
      <p style="color:#374151">Halo <strong>${name}</strong>,</p>
      <div style="background:${isConn ? "#f0fdf4" : "#fef2f2"};border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid ${isConn ? "#22c55e" : "#ef4444"}">
        <p style="margin:0;font-size:15px;font-weight:bold;color:${isConn ? "#15803d" : "#b91c1c"}">
          ${isConn ? "✅ Perangkat Terhubung" : "⚠️ Perangkat Terputus"}
        </p>
        <p style="margin:8px 0 0;color:#374151;font-size:13px">Nama: <strong>${deviceName}</strong></p>
        ${phone ? `<p style="margin:4px 0 0;color:#374151;font-size:13px">Nomor: <strong>${phone}</strong></p>` : ""}
        <p style="margin:4px 0 0;color:#6b7280;font-size:12px">Waktu: ${timeStr} WIB</p>
      </div>
      ${!isConn ? `<p style="color:#374151;font-size:13px">Perangkat WhatsApp Anda terputus dari server. Silakan login ke dashboard dan hubungkan kembali perangkat Anda.</p>` : `<p style="color:#374151;font-size:13px">Perangkat WhatsApp Anda berhasil terhubung dan siap mengirim/menerima pesan.</p>`}
      <p style="color:#374151;margin-bottom:0">Salam,<br><strong>Tim ${t.appName}</strong></p>
    `, t.appName),
  });
}

export async function sendOtpEmail(to: string, otp: string, type: "register" | "forgot_password"): Promise<void> {
  const t = await createTransporter();
  if (!t) return;

  const isRegister = type === "register";
  const subject = isRegister
    ? `[${t.appName}] Kode Verifikasi Email Anda`
    : `[${t.appName}] Kode Reset Password`;

  await t.transport.sendMail({
    from: t.from,
    to,
    subject,
    html: baseTemplate(`
      <h2 style="color:#111827;margin-top:0">${isRegister ? "Verifikasi Email" : "Reset Password"}</h2>
      <p style="color:#374151">${isRegister ? "Terima kasih telah mendaftar! Gunakan kode OTP berikut untuk memverifikasi email Anda:" : "Gunakan kode OTP berikut untuk mereset password Anda:"}</p>
      <div style="background:#f0fdf4;border-radius:12px;padding:24px;margin:20px 0;text-align:center;border:2px solid #22c55e">
        <p style="margin:0 0 8px;font-size:12px;color:#6b7280;text-transform:uppercase;letter-spacing:2px;font-weight:600">Kode OTP</p>
        <p style="margin:0;font-size:36px;font-weight:800;font-family:monospace;letter-spacing:8px;color:#15803d">${otp}</p>
        <p style="margin:12px 0 0;font-size:12px;color:#9ca3af">Kode berlaku selama <strong>10 menit</strong></p>
      </div>
      <div style="background:#fef3c7;border-radius:8px;padding:12px 16px;margin:16px 0">
        <p style="margin:0;color:#92400e;font-size:13px">⚠️ <strong>Jangan bagikan kode ini</strong> kepada siapapun, termasuk tim ${t.appName}.</p>
      </div>
      <p style="color:#6b7280;font-size:13px;margin-bottom:0">Jika Anda tidak ${isRegister ? "mendaftar" : "meminta reset password"} di ${t.appName}, abaikan email ini.</p>
    `, t.appName),
  });
}

export async function sendSuspendEmail(to: string, name: string, suspended: boolean, reason?: string): Promise<void> {
  const t = await createTransporter();
  if (!t) return;

  await t.transport.sendMail({
    from: t.from,
    to,
    subject: `[${t.appName}] Akun Anda ${suspended ? "Disuspend" : "Diaktifkan Kembali"}`,
    html: baseTemplate(`
      <h2 style="color:#111827;margin-top:0">Pembaruan Status Akun</h2>
      <p style="color:#374151">Halo <strong>${name}</strong>,</p>
      ${suspended ? `
        <div style="background:#fef2f2;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #ef4444">
          <p style="margin:0;color:#b91c1c;font-weight:bold">⛔ Akun Anda telah disuspend</p>
          ${reason ? `<p style="margin:8px 0 0;color:#6b7280;font-size:13px">Alasan: ${reason}</p>` : ""}
        </div>
        <p style="color:#374151">Anda tidak dapat login sampai administrator mengaktifkan kembali akun Anda. Hubungi dukungan untuk informasi lebih lanjut.</p>
      ` : `
        <div style="background:#f0fdf4;border-radius:8px;padding:16px;margin:16px 0;border-left:4px solid #22c55e">
          <p style="margin:0;color:#15803d;font-weight:bold">✅ Akun Anda telah diaktifkan kembali</p>
        </div>
        <p style="color:#374151">Anda sekarang dapat login dan menggunakan layanan seperti biasa.</p>
      `}
      <p style="color:#374151;margin-bottom:0">Salam,<br><strong>Tim ${t.appName}</strong></p>
    `, t.appName),
  });
}
