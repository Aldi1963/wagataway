import { Router, type IRouter } from "express";
import { db, usersTable, subscriptionsTable, settingsTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import {
  LoginBody,
  RegisterBody,
  UpdateProfileBody,
} from "@workspace/api-zod";
import crypto from "crypto";
import rateLimit from "express-rate-limit";
import { OAuth2Client } from "google-auth-library";
import { sendWelcomeEmail } from "../lib/email";

const router: IRouter = Router();

// ── Secret key for HMAC token signing ────────────────────────────────────────
const TOKEN_SECRET = process.env.SESSION_SECRET;
if (!TOKEN_SECRET && process.env.NODE_ENV === "production") {
  throw new Error("SESSION_SECRET must be set in production!");
}
const ACTUAL_SECRET = TOKEN_SECRET ?? "fallback-dev-secret";
// Token validity: 30 days
const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

// ── Rate limiters ─────────────────────────────────────────────────────────────
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20,
  message: { message: "Terlalu banyak percobaan. Coba lagi dalam 15 menit.", code: "RATE_LIMITED" },
  standardHeaders: true,
  legacyHeaders: false,
});

export const loginRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10, // stricter for login
  message: { message: "Terlalu banyak percobaan login. Coba lagi dalam 15 menit.", code: "RATE_LIMITED" },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Password hashing ──────────────────────────────────────────────────────────
// Uses scrypt with a per-user salt for new passwords.
// Legacy format: plain sha256 hash (kept for existing accounts).

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;

function hashPasswordLegacy(password: string): string {
  return crypto.createHash("sha256").update(password + "salt_wa_gateway").digest("hex");
}

function hashPasswordScrypt(password: string, salt?: string): string {
  const s = salt ?? crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, s, KEY_LEN, SCRYPT_PARAMS);
  return `scrypt:${s}:${key.toString("hex")}`;
}

function verifyPassword(input: string, stored: string): boolean {
  if (stored.startsWith("scrypt:")) {
    const [, salt, hash] = stored.split(":");
    try {
      const derived = crypto.scryptSync(input, salt, KEY_LEN, SCRYPT_PARAMS).toString("hex");
      return crypto.timingSafeEqual(Buffer.from(derived), Buffer.from(hash));
    } catch {
      return false;
    }
  }
  // Legacy: sha256+static salt (backward compat for existing accounts)
  const legacy = hashPasswordLegacy(input);
  return crypto.timingSafeEqual(Buffer.from(legacy), Buffer.from(stored));
}

// ── HMAC-signed token ─────────────────────────────────────────────────────────
// Format: base64url(payload).base64url(hmac)

function sign(data: string): string {
  return crypto.createHmac("sha256", ACTUAL_SECRET).update(data).digest("base64url");
}

export function generateToken(userId: number): string {
  const payload = Buffer.from(JSON.stringify({ userId, ts: Date.now() })).toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function getUserFromToken(token: string): number | null {
  try {
    if (!token.includes(".")) return null;
    
    // New signed format
    const lastDot = token.lastIndexOf(".");
    const payload = token.slice(0, lastDot);
    const sig = token.slice(lastDot + 1);
    const expected = sign(payload);
    
    if (!crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return null;
    
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString());
    if (!parsed.userId || !parsed.ts) return null;
    
    // Check expiry
    if (Date.now() - parsed.ts > TOKEN_TTL_MS) return null;
    return parsed.userId;
  } catch {
    return null;
  }
}

// ── Google OAuth helpers ──────────────────────────────────────────────────────

async function getGoogleClientId(): Promise<string> {
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key as any, "google_client_id"));
    const fromDb = (row as any)?.value ?? "";
    return fromDb || (process.env.GOOGLE_CLIENT_ID ?? "");
  } catch {
    return process.env.GOOGLE_CLIENT_ID ?? "";
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

// Public: Google OAuth config — returns clientId needed by frontend
router.get("/auth/config", async (_req, res): Promise<void> => {
  const googleClientId = await getGoogleClientId();
  res.json({ googleClientId, googleEnabled: !!googleClientId });
});

// Google OAuth login / register
router.post("/auth/google", authRateLimit, async (req, res): Promise<void> => {
  const { credential } = req.body as { credential?: string };
  if (!credential) {
    res.status(400).json({ message: "Missing credential", code: "INVALID_REQUEST" });
    return;
  }
  const GOOGLE_CLIENT_ID = await getGoogleClientId();
  if (!GOOGLE_CLIENT_ID) {
    res.status(503).json({ message: "Google login belum dikonfigurasi oleh admin", code: "NOT_CONFIGURED" });
    return;
  }
  const googleClient = new OAuth2Client(GOOGLE_CLIENT_ID);
  try {
    const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      res.status(400).json({ message: "Token tidak valid", code: "INVALID_TOKEN" });
      return;
    }
    const { email, name, sub: googleId, picture } = payload;
    // Find by googleId or email
    const [existing] = await db
      .select()
      .from(usersTable)
      .where(or(eq(usersTable.googleId, googleId), eq(usersTable.email, email.toLowerCase())));

    let userId: number;
    if (existing) {
      // Link googleId if not already set
      if (!existing.googleId) {
        await db.update(usersTable).set({ googleId, avatar: existing.avatar ?? picture ?? null }).where(eq(usersTable.id, existing.id));
      }
      userId = existing.id;
    } else {
      // Create new account from Google
      const randomPassword = crypto.randomBytes(32).toString("hex");
      const [created] = await db
        .insert(usersTable)
        .values({
          name: name ?? email.split("@")[0],
          email: email.toLowerCase(),
          password: hashPasswordScrypt(randomPassword),
          avatar: picture ?? null,
          plan: "free",
          googleId,
        })
        .returning();
      userId = created.id;

      const periodEnd = new Date();
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      await db.insert(subscriptionsTable).values({
        userId,
        planId: "free",
        planName: "Free",
        status: "active",
        currentPeriodEnd: periodEnd,
        cancelAtPeriodEnd: false,
      });
    }

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
    const token = generateToken(userId);
    res.json({
      token,
      user: { id: String(user.id), name: user.name, email: user.email, avatar: user.avatar, plan: user.plan, role: user.role ?? "user" },
    });
  } catch (err) {
    console.error("Google auth error:", err);
    res.status(401).json({ message: "Verifikasi Google gagal", code: "GOOGLE_AUTH_FAILED" });
  }
});

router.post("/auth/login", loginRateLimit, async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request", code: "INVALID_REQUEST" });
    return;
  }

  const { email, password } = parsed.data;
  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email.toLowerCase().trim()));

  if (!user || !verifyPassword(password, user.password)) {
    res.status(401).json({ message: "Invalid email or password", code: "INVALID_CREDENTIALS" });
    return;
  }

  if (user.isSuspended) {
    res.status(403).json({ message: "Akun Anda telah disuspend. Hubungi administrator.", code: "ACCOUNT_SUSPENDED" });
    return;
  }

  // Migrate legacy password to scrypt on successful login
  if (!user.password.startsWith("scrypt:")) {
    const newHash = hashPasswordScrypt(password);
    await db.update(usersTable).set({ password: newHash }).where(eq(usersTable.id, user.id));
  }

  // If 2FA is enabled, don't return token yet — require OTP step
  if (user.twoFaEnabled && user.twoFaSecret) {
    res.json({ requires2fa: true, userId: user.id });
    return;
  }

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

router.get("/auth/me", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
  if (!token) {
    res.status(401).json({ message: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }

  const userId = getUserFromToken(token);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId));
  if (!user) {
    res.status(404).json({ message: "User not found", code: "NOT_FOUND" });
    return;
  }

  res.json({
    id: String(user.id),
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    plan: user.plan,
    role: user.role ?? "user",
    createdAt: user.createdAt?.toISOString(),
  });
});

router.put("/auth/profile", async (req, res): Promise<void> => {
  const authHeader = req.headers.authorization;
  const token = (authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null);
  if (!token) {
    res.status(401).json({ message: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }

  const userId = getUserFromToken(token);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }

  const parsed = UpdateProfileBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ message: "Invalid request", code: "INVALID_REQUEST" });
    return;
  }

  const updateData: Record<string, string> = {};
  if (parsed.data.name) updateData.name = parsed.data.name;
  if (parsed.data.email) updateData.email = parsed.data.email.toLowerCase().trim();
  if (parsed.data.avatar) updateData.avatar = parsed.data.avatar;
  if (parsed.data.newPassword) updateData.password = hashPasswordScrypt(parsed.data.newPassword);
  if ((parsed.data as any).aiSettings) (updateData as any).aiSettings = (parsed.data as any).aiSettings;

  const [user] = await db
    .update(usersTable)
    .set(updateData)
    .where(eq(usersTable.id, userId))
    .returning();

  res.json({
    id: String(user.id),
    name: user.name,
    email: user.email,
    avatar: user.avatar,
    plan: user.plan,
    role: user.role ?? "user",
    createdAt: user.createdAt?.toISOString(),
  });
});

export default router;
