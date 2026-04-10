import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { getUserFromToken, generateToken } from "./auth";
import { generateSecret, generate, verify, generateURI } from "otplib";
import QRCode from "qrcode";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

async function generateTOTP(secret: string): Promise<string> {
  return generate({ secret, strategy: "totp" });
}

async function verifyTOTP(token: string, secret: string): Promise<boolean> {
  const result = await verify({ token, secret, strategy: "totp" });
  // otplib functional API returns { valid: boolean, ... } not a plain boolean
  if (result && typeof result === "object" && "valid" in result) {
    return (result as { valid: boolean }).valid;
  }
  return Boolean(result);
}

/** GET /2fa/status */
router.get("/2fa/status", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  if (!user) { res.status(404).json({ message: "User not found" }); return; }
  res.json({ enabled: user.twoFaEnabled });
});

/** POST /2fa/setup — generate secret & QR code */
router.post("/2fa/setup", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  if (!user) { res.status(404).json({ message: "User not found" }); return; }

  const secret = generateSecret();
  const otpauth = generateURI({ issuer: "WA Gateway", label: user.email, secret, strategy: "totp" });
  const qrDataUrl = await QRCode.toDataURL(otpauth);

  await db.update(usersTable)
    .set({ twoFaSecret: secret, twoFaEnabled: false })
    .where(eq(usersTable.id, uid));

  res.json({ secret, qrDataUrl, otpauth });
});

/** POST /2fa/verify — verifikasi OTP lalu aktifkan 2FA */
router.post("/2fa/verify", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { token: otp } = req.body as { token: string };

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  if (!user || !user.twoFaSecret) {
    res.status(400).json({ message: "2FA belum di-setup. Panggil /2fa/setup terlebih dahulu." });
    return;
  }

  const valid = await verifyTOTP(otp, user.twoFaSecret);
  if (!valid) {
    res.status(400).json({ message: "Kode OTP tidak valid atau sudah kedaluwarsa." });
    return;
  }

  await db.update(usersTable).set({ twoFaEnabled: true }).where(eq(usersTable.id, uid));
  res.json({ success: true, message: "2FA berhasil diaktifkan." });
});

/** POST /2fa/disable — nonaktifkan 2FA */
router.post("/2fa/disable", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { token: otp } = (req.body ?? {}) as { token?: string };
  if (!otp) {
    res.status(400).json({ message: "Kode OTP wajib diisi untuk menonaktifkan 2FA." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  if (!user || !user.twoFaSecret || !user.twoFaEnabled) {
    res.status(400).json({ message: "2FA tidak aktif." });
    return;
  }

  const valid = await verifyTOTP(otp, user.twoFaSecret);
  if (!valid) {
    res.status(400).json({ message: "Kode OTP tidak valid." });
    return;
  }

  await db.update(usersTable).set({ twoFaEnabled: false, twoFaSecret: null }).where(eq(usersTable.id, uid));
  res.json({ success: true, message: "2FA berhasil dinonaktifkan." });
});

/** POST /auth/2fa/check — cek OTP saat login, return JWT token jika valid */
router.post("/auth/2fa/check", async (req, res): Promise<void> => {
  const { userId, token: otp } = req.body as { userId: number; token: string };

  if (!userId || !otp) {
    res.status(400).json({ message: "userId dan token OTP wajib diisi." });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, Number(userId)));
  if (!user || !user.twoFaSecret || !user.twoFaEnabled) {
    res.status(400).json({ message: "2FA tidak aktif untuk user ini." });
    return;
  }

  const valid = await verifyTOTP(otp, user.twoFaSecret);
  if (!valid) {
    res.status(400).json({ message: "Kode OTP salah atau sudah kedaluwarsa." });
    return;
  }

  // OTP valid — generate JWT and return full user data
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
