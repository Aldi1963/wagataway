/**
 * OTP-based Authentication Routes
 * - POST /auth/otp/send        — kirim OTP ke email (register | forgot_password)
 * - POST /auth/register        — daftar akun baru (wajib OTP terverifikasi)
 * - POST /auth/password/forgot — verifikasi OTP + set password baru
 */
import { Router, type IRouter } from "express";
import { db, usersTable, emailOtpsTable, settingsTable, subscriptionsTable } from "@workspace/db";
import { eq, and, gt, isNull } from "drizzle-orm";
import crypto from "crypto";
import { authRateLimit, generateToken } from "./auth";
import { sendOtpEmail, sendWelcomeEmail } from "../lib/email";
import { sendOnboardingMessage } from "../lib/admin-bot-processor";

const router: IRouter = Router();

function generateOtp(): string {
  return String(100000 + crypto.randomInt(900000)).padStart(6, "0");
}

function hashPasswordScrypt(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:${salt}:${key.toString("hex")}`;
}

// ─── POST /auth/otp/send ──────────────────────────────────────────────────────
router.post("/auth/otp/send", authRateLimit, async (req, res): Promise<void> => {
  const { email, type } = req.body ?? {};
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email) || !["register", "forgot_password"].includes(type)) {
    res.status(400).json({ message: "Email tidak valid atau tipe tidak dikenali." });
    return;
  }
  const lowerEmail = email.toLowerCase().trim();

  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, lowerEmail));

  if (type === "register" && existing) {
    res.status(400).json({ message: "Email sudah terdaftar. Silakan login atau gunakan email lain.", code: "EMAIL_TAKEN" });
    return;
  }
  if (type === "forgot_password" && !existing) {
    // Jangan reveal apakah email terdaftar (keamanan)
    res.json({ message: "Jika email terdaftar, kode OTP akan dikirim." });
    return;
  }

  // Rate limit: max 1 OTP per 60 detik per email+type
  const oneMinuteAgo = new Date(Date.now() - 60_000);
  const [recent] = await db
    .select({ id: emailOtpsTable.id })
    .from(emailOtpsTable)
    .where(
      and(
        eq(emailOtpsTable.email, lowerEmail),
        eq(emailOtpsTable.type, type),
        gt(emailOtpsTable.createdAt, oneMinuteAgo),
        isNull(emailOtpsTable.usedAt),
      ),
    );

  if (recent) {
    res.status(429).json({ message: "Kode OTP sudah dikirim. Tunggu 60 detik sebelum meminta kode baru." });
    return;
  }

  const otp = generateOtp();
  const expiresAt = new Date(Date.now() + 10 * 60_000); // 10 menit

  await db.insert(emailOtpsTable).values({ email: lowerEmail, otp, type, expiresAt });

  try {
    await sendOtpEmail(lowerEmail, otp, type);
  } catch (err) {
    console.error("[OTP Email] Gagal kirim:", err);
    // Tetap lanjut — OTP tersimpan di DB, admin bisa cek
  }

  res.json({ message: "Kode OTP telah dikirim ke email Anda. Berlaku 10 menit." });
});

// ─── POST /auth/register ─────────────────────────────────────────────────────
router.post("/auth/register", authRateLimit, async (req, res): Promise<void> => {
  const { name, email, password, otp } = req.body ?? {};
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!name || name.length < 2 || !email || !emailRegex.test(email) || !password || password.length < 6 || !otp || String(otp).length !== 6) {
    res.status(400).json({ message: "Data tidak valid. Pastikan semua field diisi dengan benar." });
    return;
  }
  const lowerEmail = email.toLowerCase().trim();

  // Cek email sudah ada
  const [existing] = await db.select({ id: usersTable.id }).from(usersTable).where(eq(usersTable.email, lowerEmail));
  if (existing) {
    res.status(409).json({ message: "Email sudah terdaftar.", code: "EMAIL_TAKEN" });
    return;
  }

  // Verifikasi OTP
  const now = new Date();
  const [otpRecord] = await db
    .select()
    .from(emailOtpsTable)
    .where(
      and(
        eq(emailOtpsTable.email, lowerEmail),
        eq(emailOtpsTable.type, "register"),
        gt(emailOtpsTable.expiresAt, now),
        isNull(emailOtpsTable.usedAt),
      ),
    );

  if (!otpRecord || otpRecord.otp !== otp) {
    res.status(400).json({ message: "Kode OTP salah atau sudah kedaluwarsa. Minta kode baru.", code: "INVALID_OTP" });
    return;
  }

  // Mark OTP as used
  await db.update(emailOtpsTable).set({ usedAt: now }).where(eq(emailOtpsTable.id, otpRecord.id));

  // Buat akun
  const [newUser] = await db
    .insert(usersTable)
    .values({ name: name.trim(), email: lowerEmail, password: hashPasswordScrypt(password), plan: "free" })
    .returning();

  // Trial subscription dari konfigurasi admin
  const [trialEnabledRow, trialDaysRow, trialPlanSlugRow, trialPlanNameRow] = await Promise.all([
    db.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, "trial_enabled")),
    db.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, "trial_duration_days")),
    db.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, "trial_plan_slug")),
    db.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, "trial_plan_name")),
  ]);
  const trialEnabled = (trialEnabledRow[0]?.value ?? "true") !== "false";
  const trialDays = Number(trialDaysRow[0]?.value ?? "7") || 7;
  const trialPlanSlug = trialPlanSlugRow[0]?.value || "basic";
  const trialPlanName = trialPlanNameRow[0]?.value || "Basic";

  if (trialEnabled) {
    const trialEnd = new Date();
    trialEnd.setDate(trialEnd.getDate() + trialDays);
    await db.insert(subscriptionsTable).values({
      userId: newUser.id,
      planId: trialPlanSlug,
      planName: trialPlanName,
      status: "trial",
      currentPeriodEnd: trialEnd,
      cancelAtPeriodEnd: false,
    });
    await db.update(usersTable).set({ plan: trialPlanSlug }).where(eq(usersTable.id, newUser.id));
  }

  const token = generateToken(newUser.id);
  sendWelcomeEmail(newUser.email, newUser.name, trialEnabled ? trialPlanName : "Free").catch(() => {});
  // Send WA onboarding message if admin WA bot is enabled
  sendOnboardingMessage(newUser.name, newUser.email).catch(() => {});

  res.status(201).json({
    token,
    user: {
      id: String(newUser.id),
      name: newUser.name,
      email: newUser.email,
      avatar: newUser.avatar,
      plan: trialEnabled ? trialPlanSlug : "free",
      role: newUser.role ?? "user",
      createdAt: newUser.createdAt?.toISOString(),
    },
  });
});

// ─── POST /auth/password/forgot ───────────────────────────────────────────────
router.post("/auth/password/forgot", authRateLimit, async (req, res): Promise<void> => {
  const { email, otp, newPassword } = req.body ?? {};
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email) || !otp || String(otp).length !== 6 || !newPassword || newPassword.length < 6) {
    res.status(400).json({ message: "Data tidak valid. Password minimal 6 karakter." });
    return;
  }
  const lowerEmail = email.toLowerCase().trim();

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, lowerEmail));
  if (!user) {
    res.status(400).json({ message: "Email tidak terdaftar." });
    return;
  }

  // Verifikasi OTP
  const now = new Date();
  const [otpRecord] = await db
    .select()
    .from(emailOtpsTable)
    .where(
      and(
        eq(emailOtpsTable.email, lowerEmail),
        eq(emailOtpsTable.type, "forgot_password"),
        gt(emailOtpsTable.expiresAt, now),
        isNull(emailOtpsTable.usedAt),
      ),
    );

  if (!otpRecord || otpRecord.otp !== otp) {
    res.status(400).json({ message: "Kode OTP salah atau sudah kedaluwarsa. Minta kode baru.", code: "INVALID_OTP" });
    return;
  }

  // Mark OTP as used + update password
  await Promise.all([
    db.update(emailOtpsTable).set({ usedAt: now }).where(eq(emailOtpsTable.id, otpRecord.id)),
    db.update(usersTable).set({ password: hashPasswordScrypt(newPassword) }).where(eq(usersTable.id, user.id)),
  ]);

  // Auto-login setelah reset berhasil
  const token = generateToken(user.id);
  res.json({
    token,
    user: {
      id: String(user.id),
      name: user.name,
      email: user.email,
      avatar: user.avatar,
      plan: user.plan,
      role: user.role ?? "user",
      createdAt: user.createdAt?.toISOString(),
    },
  });
});

export default router;
