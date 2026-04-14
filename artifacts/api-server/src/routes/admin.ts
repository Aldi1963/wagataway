import { Router, type IRouter, type Request, type Response, type NextFunction } from "express";
import { db, usersTable, devicesTable, plansTable, subscriptionsTable, settingsTable, vouchersTable, voucherUsagesTable, notificationsTable, transactionsTable, messagesTable } from "@workspace/db";
import { eq, ne, count, sql, desc, ilike, or, and, inArray, gte, lte, like } from "drizzle-orm";
import crypto from "crypto";
import OpenAI from "openai";
import nodemailer from "nodemailer";
import { getUserFromToken } from "./auth";
import { registerSmtpConfigProvider, sendSuspendEmail, sendPasswordResetEmail } from "../lib/email";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

async function requireAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  if (!token) {
    res.status(401).json({ message: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }
  const userId = getUserFromToken(token);
  if (!userId) {
    res.status(401).json({ message: "Unauthorized", code: "UNAUTHORIZED" });
    return;
  }
  const [user] = await db.select({ role: usersTable.role }).from(usersTable).where(eq(usersTable.id, userId));
  if (!user || user.role !== "admin") {
    res.status(403).json({ message: "Akses ditolak. Hanya admin yang dapat mengakses halaman ini.", code: "FORBIDDEN" });
    return;
  }
  next();
}

router.use("/admin", requireAdmin);

const APP_VERSION = "1.4.0";
const startTime = Date.now();

// In-memory server config (demo)
let serverConfig = {
  appName: "WA Gateway SaaS",
  baseUrl: "https://api.wagateway.com",
  maxDevicesPerUser: 5,
  maxMessagesPerDay: 10000,
  smtpHost: "",
  smtpPort: 587,
  smtpUser: "",
  smtpFrom: "noreply@wagateway.com",
  maintenanceMode: false,
  registrationOpen: true,
};

// ── SMTP password helpers (stored in DB for persistence) ────────────────────

// Register SMTP config provider for the email notification module
registerSmtpConfigProvider(async () => {
  const pwd = await getSetting("smtp_password").catch(() => "");
  return {
    host: serverConfig.smtpHost,
    port: serverConfig.smtpPort,
    user: serverConfig.smtpUser,
    from: serverConfig.smtpFrom,
    password: pwd,
    appName: serverConfig.appName,
  };
});

function maskSmtpPassword(pwd: string): string {
  if (!pwd) return "";
  if (pwd.length <= 4) return "••••";
  return pwd.slice(0, 2) + "••••••••" + pwd.slice(-2);
}

// ── Admin: Server Settings ──────────────────────────────────────────────────

router.get("/admin/server-settings", async (req, res): Promise<void> => {
  const uptimeSec = Math.floor((Date.now() - startTime) / 1000);
  const [[{ userCount }], [{ deviceCount }], smtpPwd] = await Promise.all([
    db.select({ userCount: count() }).from(usersTable),
    db.select({ deviceCount: count() }).from(devicesTable),
    getSetting("smtp_password").catch(() => ""),
  ]);

  res.json({
    ...serverConfig,
    smtpPassword: maskSmtpPassword(smtpPwd),
    smtpConfigured: !!(serverConfig.smtpHost && serverConfig.smtpUser && smtpPwd),
    version: APP_VERSION,
    uptimeSeconds: uptimeSec,
    totalUsers: Number(userCount),
    totalDevices: Number(deviceCount),
    nodeVersion: process.version,
    environment: process.env.NODE_ENV ?? "development",
  });
});

router.put("/admin/server-settings", async (req, res): Promise<void> => {
  const b = req.body as Record<string, unknown>;
  if (typeof b.appName === "string") serverConfig.appName = b.appName;
  if (typeof b.baseUrl === "string") serverConfig.baseUrl = b.baseUrl;
  if (typeof b.maxDevicesPerUser === "number") serverConfig.maxDevicesPerUser = b.maxDevicesPerUser;
  if (typeof b.maxMessagesPerDay === "number") serverConfig.maxMessagesPerDay = b.maxMessagesPerDay;
  if (typeof b.smtpHost === "string") serverConfig.smtpHost = b.smtpHost;
  if (typeof b.smtpPort === "number") serverConfig.smtpPort = b.smtpPort;
  if (typeof b.smtpUser === "string") serverConfig.smtpUser = b.smtpUser;
  if (typeof b.smtpFrom === "string") serverConfig.smtpFrom = b.smtpFrom;
  if (typeof b.maintenanceMode === "boolean") serverConfig.maintenanceMode = b.maintenanceMode;
  if (typeof b.registrationOpen === "boolean") serverConfig.registrationOpen = b.registrationOpen;
  // Save SMTP password to DB if provided (non-empty and not the masked placeholder)
  if (typeof b.smtpPassword === "string" && b.smtpPassword && !b.smtpPassword.includes("••")) {
    await setSetting("smtp_password", b.smtpPassword);
  }
  res.json({ success: true, config: serverConfig });
});

// ── Admin: SMTP Test ────────────────────────────────────────────────────────

router.post("/admin/smtp/test", async (req, res): Promise<void> => {
  const { testEmail } = req.body as { testEmail?: string };

  if (!testEmail || !testEmail.includes("@")) {
    res.status(400).json({ ok: false, message: "Alamat email tujuan tidak valid" });
    return;
  }

  const { smtpHost, smtpPort, smtpUser, smtpFrom } = serverConfig;
  if (!smtpHost || !smtpUser) {
    res.status(400).json({ ok: false, message: "Konfigurasi SMTP belum diisi (host dan username wajib)" });
    return;
  }

  const smtpPassword = await getSetting("smtp_password").catch(() => "");
  if (!smtpPassword) {
    res.status(400).json({ ok: false, message: "Password SMTP belum diisi" });
    return;
  }

  try {
    const transporter = nodemailer.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpPort === 465,
      auth: { user: smtpUser, pass: smtpPassword },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });

    await transporter.verify();

    await transporter.sendMail({
      from: `"WA Gateway" <${smtpFrom || smtpUser}>`,
      to: testEmail,
      subject: "✅ Test Email — WA Gateway SMTP",
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:24px;border-radius:12px;border:1px solid #e5e7eb">
          <div style="background:#dcfce7;border-radius:8px;padding:16px;margin-bottom:20px;text-align:center">
            <span style="font-size:32px">✅</span>
            <p style="color:#15803d;font-weight:bold;margin:8px 0 0">Konfigurasi SMTP Berhasil!</p>
          </div>
          <p style="color:#374151">Email ini dikirim untuk memverifikasi bahwa konfigurasi SMTP pada <strong>WA Gateway</strong> sudah berfungsi dengan benar.</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;font-size:13px">
            <tr><td style="padding:6px 0;color:#6b7280">SMTP Host</td><td style="padding:6px 0;font-weight:bold">${smtpHost}:${smtpPort}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Username</td><td style="padding:6px 0;font-weight:bold">${smtpUser}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Pengirim</td><td style="padding:6px 0;font-weight:bold">${smtpFrom || smtpUser}</td></tr>
            <tr><td style="padding:6px 0;color:#6b7280">Waktu Kirim</td><td style="padding:6px 0;font-weight:bold">${new Date().toLocaleString("id-ID")}</td></tr>
          </table>
          <p style="font-size:12px;color:#9ca3af;margin-top:20px">Pesan ini dikirim secara otomatis dari sistem WA Gateway. Abaikan jika Anda tidak mengharapkannya.</p>
        </div>`,
    });

    res.json({
      ok: true,
      message: `Email tes berhasil dikirim ke ${testEmail}`,
      detail: `Terkiria via ${smtpHost}:${smtpPort}`,
    });
  } catch (err: any) {
    const msg = err?.message ?? "Koneksi SMTP gagal";
    const code = err?.code ?? "";
    let hint = "";
    if (code === "ECONNREFUSED") hint = "Host atau port tidak dapat dijangkau";
    else if (code === "ETIMEDOUT") hint = "Koneksi timeout — cek firewall atau port";
    else if (msg.includes("Invalid login") || msg.includes("535")) hint = "Username atau password salah";
    else if (msg.includes("self-signed") || msg.includes("certificate")) hint = "Masalah sertifikat SSL — coba port 587 (TLS)";
    else if (msg.includes("ENOTFOUND")) hint = "Host SMTP tidak ditemukan";

    res.status(500).json({ ok: false, message: hint || msg, detail: msg });
  }
});

// ── Admin: Check Update ─────────────────────────────────────────────────────

const FULL_CHANGELOG = [
  {
    version: "1.4.0",
    date: "2026-04-07",
    notes: "7 Fitur Fonnte: Number Checker, Delivery Status webhook, tipe pesan baru (location/sticker/react/quoted), Group Management API, Device Rotation pool, Message Retry otomatis",
  },
  {
    version: "1.3.0",
    date: "2026-03-20",
    notes: "Admin WA Center Bot, CS Bot multi-provider AI, Live Chat multi-agent, Drip Campaign engine, Reseller & Sub-user management",
  },
  {
    version: "1.2.0",
    date: "2026-03-01",
    notes: "Anti-Banned (typing simulation, delay humanizer, spin syntax), Blacklist/DND, Link Shortener dengan click tracking, Templates pesan, Analytics & Laporan export",
  },
  {
    version: "1.1.0",
    date: "2026-02-15",
    notes: "Bulk Message dengan CSV import, Schedule pesan, Auto Reply dengan keyword regex, Contacts & Contact Groups, Plugin system (Tokopedia, Shopee, WooCommerce), 2FA TOTP",
  },
  {
    version: "1.0.0",
    date: "2026-01-01",
    notes: "Rilis perdana — Device management, Send pesan, Webhook, API Key, Billing & Subscription, Payment Gateway (Midtrans/manual), Voucher system",
  },
];

router.get("/admin/update", async (_req, res): Promise<void> => {
  // Try to check GitHub releases for the latest version
  let latestVersion = APP_VERSION;
  let upToDate = true;
  let releaseNotes = "Versi terbaru sudah terpasang.";

  try {
    const ghRes = await Promise.race([
      fetch("https://api.github.com/repos/wa-gateway-saas/releases/latest", {
        headers: { "User-Agent": "wa-gateway-update-checker" },
        signal: AbortSignal.timeout(4000),
      }),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("timeout")), 4500)),
    ]) as Response;

    if (ghRes.ok) {
      const data = await ghRes.json() as any;
      latestVersion = (data.tag_name ?? APP_VERSION).replace(/^v/, "");
      releaseNotes = data.body ?? "Lihat GitHub untuk catatan rilis";
      upToDate = latestVersion === APP_VERSION;
    }
  } catch {
    // No internet or repo doesn't exist — use local data
  }

  const customChangelogRaw = await getSetting("site_changelog").catch(() => "[]");
  let customChangelog = [];
  try { customChangelog = JSON.parse(customChangelogRaw); } catch { customChangelog = []; }

  // Merge: Custom ones first (most recent), then hardcoded defaults
  const finalChangelog = [...customChangelog, ...FULL_CHANGELOG];

  res.json({
    currentVersion: APP_VERSION,
    latestVersion,
    upToDate,
    releaseNotes: upToDate ? "Versi terbaru sudah terpasang." : releaseNotes,
    checkedAt: new Date().toISOString(),
    changelog: finalChangelog,
  });
});

router.post("/admin/changelog", async (req, res): Promise<void> => {
  const { version, notes, date } = req.body as { version: string; notes: string; date?: string };
  if (!version || !notes) {
    res.status(400).json({ message: "Versi dan catatan update wajib diisi" });
    return;
  }

  const raw = await getSetting("site_changelog").catch(() => "[]");
  let list = [];
  try { list = JSON.parse(raw); } catch { list = []; }

  // Add to beginning of list
  list.unshift({ version, notes, date: date || new Date().toISOString() });

  // Limit to last 50 entries
  if (list.length > 50) list = list.slice(0, 50);

  await setSetting("site_changelog", JSON.stringify(list));
  res.json({ success: true, changelog: list });
});

router.post("/admin/restart", async (_req, res): Promise<void> => {
  res.json({ success: true, message: "Sistem akan direstart dalam beberapa detik..." });
  // Delay restart to allow response to be sent, then gracefully restart
  setTimeout(() => {
    process.kill(process.pid, "SIGTERM");
  }, 1500);
});

// ── Admin: Dashboard Stats ───────────────────────────────────────────────────

router.get("/admin/stats", async (_req, res): Promise<void> => {
  const [
    [{ totalUsers }],
    [{ totalDevices }],
    [{ totalMessages }],
    [{ totalRevenue }],
    [{ activeDevices }],
    [{ pendingMessages }],
  ] = await Promise.all([
    db.select({ totalUsers: count() }).from(usersTable),
    db.select({ totalDevices: count() }).from(devicesTable),
    db.select({ totalMessages: count() }).from(messagesTable),
    db.select({ totalRevenue: sql<number>`COALESCE(SUM(amount), 0)` }).from(transactionsTable).where(eq(transactionsTable.status, "success")),
    db.select({ activeDevices: count() }).from(devicesTable).where(eq(devicesTable.status, "connected")),
    db.select({ pendingMessages: count() }).from(messagesTable).where(eq(messagesTable.status, "pending")),
  ]);

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [{ newUsers30d }] = await db.select({ newUsers30d: count() })
    .from(usersTable)
    .where(gte(usersTable.createdAt, thirtyDaysAgo));

  res.json({
    totalUsers: Number(totalUsers),
    totalDevices: Number(totalDevices),
    totalMessages: Number(totalMessages),
    totalRevenue: Number(totalRevenue),
    activeDevices: Number(activeDevices),
    pendingMessages: Number(pendingMessages),
    newUsers30d: Number(newUsers30d),
  });
});

// ── Admin: Manage Users ─────────────────────────────────────────────────────

router.get("/admin/users", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const search = (req.query.search as string | undefined)?.trim() ?? "";

  const baseQuery = db
    .select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      plan: usersTable.plan,
      role: usersTable.role,
      isSuspended: usersTable.isSuspended,
      isReseller: usersTable.isReseller,
      createdAt: usersTable.createdAt,
      deviceCount: count(devicesTable.id),
    })
    .from(usersTable)
    .leftJoin(devicesTable, eq(devicesTable.userId, usersTable.id))
    .groupBy(usersTable.id);

  const users = search
    ? await baseQuery.where(or(ilike(usersTable.name, `%${search}%`), ilike(usersTable.email, `%${search}%`)))
    : await baseQuery;

  res.json(users.map((u) => ({
    id: String(u.id),
    name: u.name,
    email: u.email,
    plan: u.plan,
    role: u.role,
    isSuspended: u.isSuspended,
    isReseller: u.isReseller,
    deviceCount: Number(u.deviceCount),
    isCurrentUser: u.id === uid,
    createdAt: u.createdAt?.toISOString(),
  })));
});

router.post("/admin/users", async (req, res): Promise<void> => {
  const { name, email, plan = "free", role = "user" } = req.body;
  if (!name || !email) {
    res.status(400).json({ message: "Name and email are required" });
    return;
  }
  const password = crypto.randomBytes(8).toString("hex");
  const [user] = await db.insert(usersTable)
    .values({ name, email, password, plan, role })
    .returning();
  res.status(201).json({
    id: String(user.id),
    name: user.name,
    email: user.email,
    plan: user.plan,
    role: user.role,
    isSuspended: user.isSuspended,
    tempPassword: password,
    createdAt: user.createdAt?.toISOString(),
  });
});

router.put("/admin/users/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const { name, email, plan, role } = req.body;
  const updates: any = {};
  if (name) updates.name = name;
  if (email) updates.email = email;
  if (plan) updates.plan = plan;
  if (role && (role === "admin" || role === "user")) {
    if (id === uid && role !== "admin") {
      res.status(400).json({ message: "Tidak bisa menurunkan role akun sendiri" });
      return;
    }
    updates.role = role;
  }
  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ message: "User tidak ditemukan" }); return; }
  res.json({ id: String(user.id), name: user.name, email: user.email, plan: user.plan, role: user.role, isSuspended: user.isSuspended });
});

router.post("/admin/users/:id/suspend", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  if (id === uid) {
    res.status(400).json({ message: "Tidak bisa mensuspend akun sendiri" });
    return;
  }
  const [user] = await db.update(usersTable).set({ isSuspended: true }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ message: "User tidak ditemukan" }); return; }
  sendSuspendEmail(user.email, user.name, true).catch(() => {});
  res.json({ ok: true, isSuspended: true });
});

router.post("/admin/users/:id/activate", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [user] = await db.update(usersTable).set({ isSuspended: false }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ message: "User tidak ditemukan" }); return; }
  sendSuspendEmail(user.email, user.name, false).catch(() => {});
  res.json({ ok: true, isSuspended: false });
});

router.post("/admin/users/:id/reset-password", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const newPassword = crypto.randomBytes(8).toString("hex");
  const [user] = await db.update(usersTable).set({ password: newPassword }).where(eq(usersTable.id, id)).returning();
  if (!user) { res.status(404).json({ message: "User tidak ditemukan" }); return; }
  sendPasswordResetEmail(user.email, user.name, newPassword).catch(() => {});
  res.json({ ok: true, email: user.email, tempPassword: newPassword });
});

router.delete("/admin/users/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  if (id === uid) {
    res.status(400).json({ message: "Cannot delete your own account" });
    return;
  }
  await db.delete(usersTable).where(eq(usersTable.id, id));
  res.sendStatus(204);
});

router.post("/admin/users/:id/toggle-reseller", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [user] = await db.select({ id: usersTable.id, isReseller: usersTable.isReseller })
    .from(usersTable).where(eq(usersTable.id, id));
  if (!user) { res.status(404).json({ message: "User tidak ditemukan" }); return; }
  const [updated] = await db.update(usersTable).set({ isReseller: !user.isReseller })
    .where(eq(usersTable.id, id)).returning({ isReseller: usersTable.isReseller });
  res.json({ ok: true, isReseller: updated.isReseller });
});

// ── Admin: Plan Management ───────────────────────────────────────────────────

const DEFAULT_PLANS = [
  {
    slug: "free", name: "Free", priceUsd: 0, priceIdr: 0, period: "monthly",
    features: JSON.stringify(["1 Perangkat", "100 pesan/hari", "100 kontak", "Akses API dasar"]),
    limitDevices: 1, limitMessagesPerDay: 100, limitContacts: 100,
    isPopular: false, isActive: true, sortOrder: 0,
  },
  {
    slug: "basic", name: "Basic", priceUsd: 29, priceIdr: 435000, period: "monthly",
    features: JSON.stringify(["5 Perangkat", "5.000 pesan/hari", "10.000 kontak", "Akses API penuh", "Blast pesan", "Auto-reply"]),
    limitDevices: 5, limitMessagesPerDay: 5000, limitContacts: 10000,
    isPopular: true, isActive: true, sortOrder: 1,
  },
  {
    slug: "pro", name: "Pro", priceUsd: 99, priceIdr: 1485000, period: "monthly",
    features: JSON.stringify(["Perangkat tak terbatas", "Pesan tak terbatas", "Kontak tak terbatas", "Support prioritas", "Analitik lanjutan", "Webhook & integrasi kustom"]),
    limitDevices: -1, limitMessagesPerDay: -1, limitContacts: -1,
    isPopular: false, isActive: true, sortOrder: 2,
  },
];

async function seedPlansIfEmpty() {
  const existing = await db.select({ id: plansTable.id }).from(plansTable).limit(1);
  if (existing.length === 0) {
    await db.insert(plansTable).values(DEFAULT_PLANS);
  }
}

function formatPlan(p: typeof plansTable.$inferSelect) {
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    description: p.description ?? "",
    priceUsd: p.priceUsd,
    priceIdr: p.priceIdr,
    priceUsdYearly: p.priceUsdYearly ?? 0,
    priceIdrYearly: p.priceIdrYearly ?? 0,
    yearlyDiscountPercent: p.yearlyDiscountPercent ?? 0,
    period: p.period,
    features: (() => { try { return JSON.parse(p.features); } catch { return []; } })(),
    limitDevices: p.limitDevices,
    limitMessagesPerDay: p.limitMessagesPerDay,
    limitContacts: p.limitContacts,
    limitApiCallsPerDay: p.limitApiCallsPerDay ?? 1000,
    limitBulkRecipients: p.limitBulkRecipients ?? 100,
    limitScheduledMessages: p.limitScheduledMessages ?? 10,
    limitAutoReplies: p.limitAutoReplies ?? 5,
    planColor: p.planColor ?? "",
    planIcon: p.planIcon ?? "",
    trialDays: p.trialDays ?? 0,
    isPopular: p.isPopular,
    isActive: p.isActive,
    aiCsBotEnabled: p.aiCsBotEnabled,
    bulkMessagingEnabled: p.bulkMessagingEnabled ?? true,
    webhookEnabled: p.webhookEnabled ?? false,
    liveChatEnabled: p.liveChatEnabled ?? false,
    apiAccessEnabled: p.apiAccessEnabled ?? true,
    commerceEnabled: p.commerceEnabled ?? false,
    sortOrder: p.sortOrder,
    createdAt: p.createdAt?.toISOString(),
    updatedAt: p.updatedAt?.toISOString(),
  };
}

router.get("/admin/plans", async (_req, res): Promise<void> => {
  await seedPlansIfEmpty();
  const plans = await db.select().from(plansTable).orderBy(plansTable.sortOrder, plansTable.id);
  res.json(plans.map(formatPlan));
});

router.post("/admin/plans", async (req, res): Promise<void> => {
  const b = req.body as Record<string, unknown>;
  if (!b.name || !b.slug) { res.status(400).json({ message: "name dan slug wajib diisi" }); return; }
  const existing = await db.select({ id: plansTable.id }).from(plansTable).where(eq(plansTable.slug, String(b.slug)));
  if (existing.length) { res.status(409).json({ message: "Slug sudah digunakan" }); return; }
  const [plan] = await db.insert(plansTable).values({
    slug: String(b.slug),
    name: String(b.name),
    description: b.description ? String(b.description) : "",
    priceUsd: Number(b.priceUsd ?? 0),
    priceIdr: Number(b.priceIdr ?? 0),
    priceUsdYearly: Number(b.priceUsdYearly ?? 0),
    priceIdrYearly: Number(b.priceIdrYearly ?? 0),
    yearlyDiscountPercent: Number(b.yearlyDiscountPercent ?? 0),
    period: String(b.period ?? "monthly"),
    features: Array.isArray(b.features) ? JSON.stringify(b.features) : String(b.features ?? "[]"),
    limitDevices: Number(b.limitDevices ?? 1),
    limitMessagesPerDay: Number(b.limitMessagesPerDay ?? 100),
    limitContacts: Number(b.limitContacts ?? 100),
    limitApiCallsPerDay: Number(b.limitApiCallsPerDay ?? 1000),
    limitBulkRecipients: Number(b.limitBulkRecipients ?? 100),
    limitScheduledMessages: Number(b.limitScheduledMessages ?? 10),
    limitAutoReplies: Number(b.limitAutoReplies ?? 5),
    planColor: b.planColor ? String(b.planColor) : "",
    planIcon: b.planIcon ? String(b.planIcon) : "",
    trialDays: Number(b.trialDays ?? 0),
    isPopular: Boolean(b.isPopular ?? false),
    isActive: Boolean(b.isActive ?? true),
    aiCsBotEnabled: Boolean(b.aiCsBotEnabled ?? false),
    commerceEnabled: Boolean(b.commerceEnabled ?? false),
    bulkMessagingEnabled: b.bulkMessagingEnabled !== undefined ? Boolean(b.bulkMessagingEnabled) : true,
    webhookEnabled: Boolean(b.webhookEnabled ?? false),
    liveChatEnabled: Boolean(b.liveChatEnabled ?? false),
    apiAccessEnabled: b.apiAccessEnabled !== undefined ? Boolean(b.apiAccessEnabled) : true,
    sortOrder: Number(b.sortOrder ?? 99),
  }).returning();
  res.status(201).json(formatPlan(plan));
});

router.put("/admin/plans/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const b = req.body as Record<string, unknown>;
  const updates: Partial<typeof plansTable.$inferInsert> = { updatedAt: new Date() };
  if (b.name !== undefined) updates.name = String(b.name);
  if (b.slug !== undefined) updates.slug = String(b.slug);
  if (b.description !== undefined) updates.description = String(b.description);
  if (b.priceUsd !== undefined) updates.priceUsd = Number(b.priceUsd);
  if (b.priceIdr !== undefined) updates.priceIdr = Number(b.priceIdr);
  if (b.priceUsdYearly !== undefined) updates.priceUsdYearly = Number(b.priceUsdYearly);
  if (b.priceIdrYearly !== undefined) updates.priceIdrYearly = Number(b.priceIdrYearly);
  if (b.yearlyDiscountPercent !== undefined) updates.yearlyDiscountPercent = Number(b.yearlyDiscountPercent);
  if (b.period !== undefined) updates.period = String(b.period);
  if (b.features !== undefined) updates.features = Array.isArray(b.features) ? JSON.stringify(b.features) : String(b.features);
  if (b.limitDevices !== undefined) updates.limitDevices = Number(b.limitDevices);
  if (b.limitMessagesPerDay !== undefined) updates.limitMessagesPerDay = Number(b.limitMessagesPerDay);
  if (b.limitContacts !== undefined) updates.limitContacts = Number(b.limitContacts);
  if (b.limitApiCallsPerDay !== undefined) updates.limitApiCallsPerDay = Number(b.limitApiCallsPerDay);
  if (b.limitBulkRecipients !== undefined) updates.limitBulkRecipients = Number(b.limitBulkRecipients);
  if (b.limitScheduledMessages !== undefined) updates.limitScheduledMessages = Number(b.limitScheduledMessages);
  if (b.limitAutoReplies !== undefined) updates.limitAutoReplies = Number(b.limitAutoReplies);
  if (b.planColor !== undefined) updates.planColor = String(b.planColor);
  if (b.planIcon !== undefined) updates.planIcon = String(b.planIcon);
  if (b.trialDays !== undefined) updates.trialDays = Number(b.trialDays);
  if (b.isPopular !== undefined) updates.isPopular = Boolean(b.isPopular);
  if (b.isActive !== undefined) updates.isActive = Boolean(b.isActive);
  if (b.aiCsBotEnabled !== undefined) updates.aiCsBotEnabled = Boolean(b.aiCsBotEnabled);
  if (b.commerceEnabled !== undefined) updates.commerceEnabled = Boolean(b.commerceEnabled);
  if (b.bulkMessagingEnabled !== undefined) updates.bulkMessagingEnabled = Boolean(b.bulkMessagingEnabled);
  if (b.webhookEnabled !== undefined) updates.webhookEnabled = Boolean(b.webhookEnabled);
  if (b.liveChatEnabled !== undefined) updates.liveChatEnabled = Boolean(b.liveChatEnabled);
  if (b.apiAccessEnabled !== undefined) updates.apiAccessEnabled = Boolean(b.apiAccessEnabled);
  if (b.sortOrder !== undefined) updates.sortOrder = Number(b.sortOrder);
  const [plan] = await db.update(plansTable).set(updates).where(eq(plansTable.id, id)).returning();
  if (!plan) { res.status(404).json({ message: "Paket tidak ditemukan" }); return; }
  res.json(formatPlan(plan));
});

router.delete("/admin/plans/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.id, id));
  if (!plan) { res.status(404).json({ message: "Paket tidak ditemukan" }); return; }
  // Count active subscribers on this plan
  const [{ sub_count }] = await db.select({ sub_count: count() })
    .from(subscriptionsTable).where(eq(subscriptionsTable.planId, plan.slug));
  if (Number(sub_count) > 0) {
    res.status(409).json({ message: `Tidak bisa dihapus — ${sub_count} pengguna aktif masih menggunakan paket ini` });
    return;
  }
  await db.delete(plansTable).where(eq(plansTable.id, id));
  res.sendStatus(204);
});

// ── Admin: AI Settings ───────────────────────────────────────────────────────

async function getSetting(key: string): Promise<string> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return row?.value ?? "";
}

async function setSetting(key: string, value: string): Promise<void> {
  const existing = await db.select({ id: settingsTable.id }).from(settingsTable).where(eq(settingsTable.key, key));
  if (existing.length > 0) {
    await db.update(settingsTable).set({ value }).where(eq(settingsTable.key, key));
  } else {
    await db.insert(settingsTable).values({ key, value });
  }
}

router.get("/admin/ai-settings", async (_req, res): Promise<void> => {
  const [apiKey, model, loginMethod, accountEmail, accountPassword, accountType, orgId, aiProvider, aiBaseUrl] = await Promise.all([
    getSetting("openai_api_key"),
    getSetting("openai_default_model"),
    getSetting("openai_login_method"),
    getSetting("openai_account_email"),
    getSetting("openai_account_password"),
    getSetting("openai_account_type"),
    getSetting("openai_org_id"),
    getSetting("ai_provider"),
    getSetting("ai_base_url"),
  ]);
  res.json({
    openaiApiKey: apiKey ? `sk-...${apiKey.slice(-4)}` : "",
    openaiDefaultModel: model || "gpt-4o-mini",
    aiEnabled: !!apiKey,
    loginMethod: loginMethod || "apikey",
    accountEmail: accountEmail || "",
    accountPassword: accountPassword ? "••••••••" : "",
    accountPasswordSet: !!accountPassword,
    accountType: accountType || "personal",
    orgId: orgId || "",
    aiProvider: aiProvider || "openai",
    aiBaseUrl: aiBaseUrl || "",
  });
});

router.put("/admin/ai-settings", async (req, res): Promise<void> => {
  const {
    openaiApiKey, openaiDefaultModel,
    loginMethod, accountEmail, accountPassword, accountType, orgId,
    aiProvider, aiBaseUrl,
  } = req.body as Record<string, string>;
  const saves: Promise<void>[] = [];

  if (openaiApiKey !== undefined && !openaiApiKey.startsWith("sk-...")) {
    saves.push(setSetting("openai_api_key", openaiApiKey));
  }
  if (openaiDefaultModel) {
    saves.push(setSetting("openai_default_model", openaiDefaultModel));
  }
  if (loginMethod) {
    saves.push(setSetting("openai_login_method", loginMethod));
  }
  if (accountEmail !== undefined) {
    saves.push(setSetting("openai_account_email", accountEmail));
  }
  if (accountPassword !== undefined && accountPassword !== "••••••••") {
    saves.push(setSetting("openai_account_password", accountPassword));
  }
  if (accountType) {
    saves.push(setSetting("openai_account_type", accountType));
  }
  if (orgId !== undefined) {
    saves.push(setSetting("openai_org_id", orgId));
  }
  if (aiProvider) {
    saves.push(setSetting("ai_provider", aiProvider));
  }
  if (aiBaseUrl !== undefined) {
    saves.push(setSetting("ai_base_url", aiBaseUrl));
  }

  await Promise.all(saves);
  res.json({ ok: true });
});

// ── Admin: Trial Settings ─────────────────────────────────────────────────────

router.get("/admin/trial-settings", async (_req, res): Promise<void> => {
  const [enabled, planSlug, planName, durationDays] = await Promise.all([
    getSetting("trial_enabled").catch(() => "true"),
    getSetting("trial_plan_slug").catch(() => "basic"),
    getSetting("trial_plan_name").catch(() => "Basic"),
    getSetting("trial_duration_days").catch(() => "7"),
  ]);
  res.json({
    trialEnabled: enabled !== "false",
    trialPlanSlug: planSlug || "basic",
    trialPlanName: planName || "Basic",
    trialDurationDays: Number(durationDays) || 7,
  });
});

router.put("/admin/trial-settings", async (req, res): Promise<void> => {
  const { trialEnabled, trialPlanSlug, trialPlanName, trialDurationDays } = req.body as Record<string, unknown>;
  const saves: Promise<void>[] = [];
  if (typeof trialEnabled === "boolean") saves.push(setSetting("trial_enabled", String(trialEnabled)));
  if (typeof trialPlanSlug === "string" && trialPlanSlug) saves.push(setSetting("trial_plan_slug", trialPlanSlug));
  if (typeof trialPlanName === "string" && trialPlanName) saves.push(setSetting("trial_plan_name", trialPlanName));
  if (typeof trialDurationDays === "number" && trialDurationDays > 0) saves.push(setSetting("trial_duration_days", String(trialDurationDays)));
  await Promise.all(saves);
  res.json({ ok: true });
});

router.post("/admin/ai-settings/test", async (_req, res): Promise<void> => {
  const [apiKey, orgId, accountType, aiBaseUrl, aiProvider, model] = await Promise.all([
    getSetting("openai_api_key"),
    getSetting("openai_org_id"),
    getSetting("openai_account_type"),
    getSetting("ai_base_url"),
    getSetting("ai_provider"),
    getSetting("openai_default_model"),
  ]);
  if (!apiKey) {
    res.json({ ok: false, message: "API key belum dikonfigurasi. Simpan API key terlebih dahulu." });
    return;
  }
  // Provider-aware default model fallback
  const providerDefaultModels: Record<string, string> = {
    gemini: "gemini-2.0-flash",
    groq: "llama-3.3-70b-versatile",
    openrouter: "meta-llama/llama-3.3-70b-instruct:free",
  };
  try {
    const clientOpts: any = { apiKey };
    if (accountType === "business" && orgId) clientOpts.organization = orgId;
    if (aiBaseUrl) clientOpts.baseURL = aiBaseUrl;
    // Gemini requires dangerouslyAllowBrowser:false (not needed server-side) but needs no extra headers
    const client = new OpenAI(clientOpts);
    const testModel = model || providerDefaultModels[aiProvider ?? ""] || "gpt-4o-mini";
    const result = await client.chat.completions.create({
      model: testModel,
      max_tokens: 5,
      messages: [{ role: "user", content: "Hi" }],
    });
    if (result.choices[0]?.message?.content !== undefined) {
      const providerLabel = aiProvider && aiProvider !== "openai" ? ` via ${aiProvider}` : "";
      res.json({ ok: true, message: `Koneksi berhasil! Model ${testModel}${providerLabel} merespons.` });
    } else {
      res.json({ ok: false, message: "API key valid tapi tidak ada respons dari model." });
    }
  } catch (err: any) {
    const status: number = err?.status ?? err?.statusCode ?? 0;
    // 429 = rate limited — API key IS valid, just quota/rate issue
    if (status === 429) {
      res.json({ ok: true, message: `API key valid! Rate limit tercapai (429) — kunci berfungsi, coba lagi dalam beberapa detik.` });
      return;
    }
    // 401 = invalid key
    if (status === 401) {
      res.json({ ok: false, message: "API key tidak valid atau sudah kedaluwarsa. Periksa kembali kunci Anda." });
      return;
    }
    const msg: string = err?.message ?? String(err);
    const cleaned = msg.replace(/\n/g, " ").slice(0, 200);
    res.json({ ok: false, message: `Koneksi gagal: ${cleaned}` });
  }
});

// ── Admin: Google OAuth Settings ────────────────────────────────────────────

router.get("/admin/google-oauth", async (_req, res): Promise<void> => {
  const [clientId, clientSecret] = await Promise.all([
    getSetting("google_client_id"),
    getSetting("google_client_secret"),
  ]);
  res.json({
    googleClientId: clientId || "",
    googleClientSecret: clientSecret ? clientSecret.slice(0, 6) + "••••••••" : "",
    configured: !!(clientId),
  });
});

router.put("/admin/google-oauth", async (req, res): Promise<void> => {
  const { googleClientId, googleClientSecret } = req.body as Record<string, string>;
  const saves: Promise<void>[] = [];
  if (typeof googleClientId === "string") {
    saves.push(setSetting("google_client_id", googleClientId.trim()));
  }
  if (typeof googleClientSecret === "string" && !googleClientSecret.includes("••")) {
    saves.push(setSetting("google_client_secret", googleClientSecret.trim()));
  }
  await Promise.all(saves);
  res.json({ ok: true });
});

// ── Admin: Vouchers ──────────────────────────────────────────────────────────

router.get("/admin/vouchers", async (_req, res): Promise<void> => {
  const rows = await db.select().from(vouchersTable).orderBy(sql`${vouchersTable.createdAt} DESC`);
  res.json(rows.map((v) => ({
    id: v.id,
    code: v.code,
    type: v.type,
    planSlug: v.planSlug,
    planName: v.planName,
    durationDays: v.durationDays,
    maxUses: v.maxUses,
    usedCount: v.usedCount,
    expiresAt: v.expiresAt?.toISOString() ?? null,
    description: v.description,
    isActive: v.isActive,
    createdAt: v.createdAt.toISOString(),
  })));
});

router.post("/admin/vouchers", async (req, res): Promise<void> => {
  const b = req.body as Record<string, unknown>;
  const code = String(b.code ?? "").toUpperCase().trim().replace(/\s+/g, "");
  if (!code) { res.status(400).json({ message: "Kode voucher wajib diisi" }); return; }

  const [existing] = await db.select().from(vouchersTable).where(eq(vouchersTable.code, code));
  if (existing) { res.status(409).json({ message: "Kode voucher sudah digunakan" }); return; }

  const [voucher] = await db.insert(vouchersTable).values({
    code,
    type: String(b.type ?? "trial"),
    planSlug: String(b.planSlug ?? "basic"),
    planName: String(b.planName ?? "Basic"),
    durationDays: Number(b.durationDays ?? 7),
    maxUses: Number(b.maxUses ?? 1),
    expiresAt: b.expiresAt ? new Date(b.expiresAt as string) : null,
    description: b.description ? String(b.description) : null,
    isActive: b.isActive !== false,
  }).returning();

  res.status(201).json(voucher);
});

router.put("/admin/vouchers/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const b = req.body as Record<string, unknown>;
  const updates: Partial<typeof vouchersTable.$inferInsert> = { updatedAt: new Date() };
  if (typeof b.type === "string") updates.type = b.type;
  if (typeof b.planSlug === "string") updates.planSlug = b.planSlug;
  if (typeof b.planName === "string") updates.planName = b.planName;
  if (typeof b.durationDays === "number") updates.durationDays = b.durationDays;
  if (typeof b.maxUses === "number") updates.maxUses = b.maxUses;
  if (typeof b.isActive === "boolean") updates.isActive = b.isActive;
  if (typeof b.description === "string") updates.description = b.description;
  if (b.expiresAt !== undefined) updates.expiresAt = b.expiresAt ? new Date(b.expiresAt as string) : null;
  const [updated] = await db.update(vouchersTable).set(updates).where(eq(vouchersTable.id, id)).returning();
  if (!updated) { res.status(404).json({ message: "Voucher tidak ditemukan" }); return; }
  res.json(updated);
});

router.delete("/admin/vouchers/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(voucherUsagesTable).where(eq(voucherUsagesTable.voucherId, id));
  await db.delete(vouchersTable).where(eq(vouchersTable.id, id));
  res.json({ success: true });
});

router.post("/admin/vouchers/generate", async (req, res): Promise<void> => {
  const b = req.body as Record<string, unknown>;
  const prefix = String(b.prefix ?? "WAG").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const count_n = Math.min(Number(b.count ?? 1), 50);
  const generated: string[] = [];

  for (let i = 0; i < count_n; i++) {
    const rand = crypto.randomBytes(4).toString("hex").toUpperCase();
    const code = `${prefix}-${rand}`;
    generated.push(code);
    await db.insert(vouchersTable).values({
      code,
      type: String(b.type ?? "trial"),
      planSlug: String(b.planSlug ?? "basic"),
      planName: String(b.planName ?? "Basic"),
      durationDays: Number(b.durationDays ?? 7),
      maxUses: 1,
      expiresAt: b.expiresAt ? new Date(b.expiresAt as string) : null,
      description: b.description ? String(b.description) : null,
      isActive: true,
    }).onConflictDoNothing();
  }

  res.status(201).json({ generated, count: generated.length });
});

// ── Admin: Notifications CRUD ────────────────────────────────────────────────

router.get("/admin/notifications", async (req, res): Promise<void> => {
  const { search, type, status, limit: limitQ, offset: offsetQ } = req.query as Record<string, string>;
  const lim = Math.min(Number(limitQ ?? 50), 200);
  const off = Number(offsetQ ?? 0);

  const rows = await db
    .select({
      id: notificationsTable.id,
      userId: notificationsTable.userId,
      userName: usersTable.name,
      userEmail: usersTable.email,
      type: notificationsTable.type,
      title: notificationsTable.title,
      message: notificationsTable.message,
      link: notificationsTable.link,
      imageUrl: notificationsTable.imageUrl,
      isRead: notificationsTable.isRead,
      createdAt: notificationsTable.createdAt,
    })
    .from(notificationsTable)
    .leftJoin(usersTable, eq(notificationsTable.userId, usersTable.id))
    .where(
      and(
        search ? or(
          ilike(notificationsTable.title, `%${search}%`),
          ilike(notificationsTable.message, `%${search}%`),
          ilike(usersTable.name, `%${search}%`),
          ilike(usersTable.email, `%${search}%`),
        ) : undefined,
        type && type !== "all" ? eq(notificationsTable.type, type) : undefined,
        status === "read" ? eq(notificationsTable.isRead, true) : undefined,
        status === "unread" ? eq(notificationsTable.isRead, false) : undefined,
      )
    )
    .orderBy(desc(notificationsTable.createdAt))
    .limit(lim)
    .offset(off);

  const [{ total }] = await db.select({ total: count() }).from(notificationsTable);
  const [{ unread }] = await db.select({ unread: count() }).from(notificationsTable).where(eq(notificationsTable.isRead, false));

  res.json({ notifications: rows, total: Number(total), unread: Number(unread) });
});

router.post("/admin/notifications", async (req, res): Promise<void> => {
  const { userIds, type = "system", title, message, link, imageUrl } = req.body as {
    userIds?: number[]; type?: string; title: string; message: string; link?: string; imageUrl?: string;
  };
  if (!title?.trim() || !message?.trim()) {
    res.status(400).json({ message: "Judul dan isi pesan wajib diisi" });
    return;
  }

  if (userIds && userIds.length > 0) {
    await db.insert(notificationsTable).values(
      userIds.map((uid) => ({ userId: uid, type, title: title.trim(), message: message.trim(), link: link || null, imageUrl: imageUrl || null }))
    );
    res.status(201).json({ ok: true, sent: userIds.length });
  } else {
    const users = await db.select({ id: usersTable.id }).from(usersTable);
    if (users.length > 0) {
      await db.insert(notificationsTable).values(
        users.map((u) => ({ userId: u.id, type, title: title.trim(), message: message.trim(), link: link || null, imageUrl: imageUrl || null }))
      );
    }
    res.status(201).json({ ok: true, sent: users.length, broadcast: true });
  }
});

router.put("/admin/notifications/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  const { type, title, message, link, imageUrl, isRead } = req.body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};
  if (typeof type === "string") updates.type = type;
  if (typeof title === "string" && title.trim()) updates.title = title.trim();
  if (typeof message === "string" && message.trim()) updates.message = message.trim();
  if (typeof link === "string") updates.link = link || null;
  if (typeof imageUrl === "string" || imageUrl === null) updates.imageUrl = imageUrl || null;
  if (typeof isRead === "boolean") updates.isRead = isRead;

  const [updated] = await db.update(notificationsTable).set(updates).where(eq(notificationsTable.id, id)).returning();
  if (!updated) { res.status(404).json({ message: "Notifikasi tidak ditemukan" }); return; }
  res.json(updated);
});

router.delete("/admin/notifications/:id", async (req, res): Promise<void> => {
  const id = Number(req.params.id);
  await db.delete(notificationsTable).where(eq(notificationsTable.id, id));
  res.json({ ok: true });
});

router.delete("/admin/notifications", async (req, res): Promise<void> => {
  const { ids } = req.body as { ids?: number[] };
  if (!ids || ids.length === 0) {
    await db.delete(notificationsTable);
    res.json({ ok: true, deleted: "all" });
  } else {
    await db.delete(notificationsTable).where(inArray(notificationsTable.id, ids));
    res.json({ ok: true, deleted: ids.length });
  }
});

// ── Admin: Landing Page Settings ─────────────────────────────────────────────

const LANDING_KEYS = [
  "site_name", "site_logo", "site_tagline",
  "hero_title", "hero_subtitle", "hero_cta1", "hero_cta2", "hero_image",
  "landing_stats", "landing_features", "landing_testimonials", "landing_faqs", "landing_how_it_works",
  "contact_email", "contact_whatsapp", "footer_text", "landing_primary_color",
  "landing_show_pricing", "landing_show_testimonials", "landing_show_stats", "landing_show_how_it_works",
  // SEO
  "seo_title", "seo_description", "seo_keywords", "seo_og_image", "site_favicon",
  "seo_author", "seo_robots",
];

router.get("/admin/landing-settings", async (_req, res): Promise<void> => {
  const entries = await Promise.all(LANDING_KEYS.map(async (k) => [k, await getSetting(k, "")]));
  res.json(Object.fromEntries(entries));
});

router.put("/admin/landing-settings", async (req, res): Promise<void> => {
  const body = req.body as Record<string, string>;
  await Promise.all(
    LANDING_KEYS.filter((k) => body[k] !== undefined).map((k) => setSetting(k, body[k] ?? ""))
  );
  res.json({ ok: true });
});

// ── Admin: Analytics (platform-wide) ───────────────────────────────────────

router.get("/admin/analytics", async (_req, res): Promise<void> => {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);

  const [
    [{ totalUsers }],
    [{ newUsersToday }],
    [{ totalDevices }],
    [{ messagesToday }],
    [{ revenueMonth }],
    [{ totalRevenue }],
    planDist,
    userGrowthRows,
    msgTrendRows,
    topUsersRows,
  ] = await Promise.all([
    db.select({ totalUsers: count() }).from(usersTable),
    db.select({ newUsersToday: count() }).from(usersTable).where(gte(usersTable.createdAt, startOfToday)),
    db.select({ totalDevices: count() }).from(devicesTable),
    db.select({ messagesToday: count() }).from(messagesTable).where(gte(messagesTable.createdAt, startOfToday)),
    db.select({ revenueMonth: sql<string>`COALESCE(SUM(amount::numeric), 0)` }).from(transactionsTable).where(and(eq(transactionsTable.status, "paid"), gte(transactionsTable.createdAt, startOfMonth))),
    db.select({ totalRevenue: sql<string>`COALESCE(SUM(amount::numeric), 0)` }).from(transactionsTable).where(eq(transactionsTable.status, "paid")),
    // Plan distribution
    db.execute(sql`
      SELECT COALESCE(s.plan_id, 'free') AS plan_id, COUNT(u.id) AS count
      FROM users u
      LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
      GROUP BY COALESCE(s.plan_id, 'free')
      ORDER BY count DESC
    `),
    // User growth per day (last 30 days)
    db.execute(sql`
      SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Jakarta')::date AS day, COUNT(*) AS count
      FROM users
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY 1 ORDER BY 1
    `),
    // Message trend per day (last 30 days) — all users
    db.execute(sql`
      SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Jakarta')::date AS day, COUNT(*) AS count
      FROM messages
      WHERE created_at >= ${thirtyDaysAgo}
      GROUP BY 1 ORDER BY 1
    `),
    // Top users by message count last 30 days
    db.execute(sql`
      SELECT u.id, u.email, u.name, u.role,
             COALESCE(s.plan_id, 'free') AS plan_id,
             COUNT(m.id) AS message_count,
             COUNT(DISTINCT d.id) AS device_count
      FROM users u
      LEFT JOIN messages m ON m.user_id = u.id AND m.created_at >= ${thirtyDaysAgo}
      LEFT JOIN devices d ON d.user_id = u.id
      LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
      WHERE u.role != 'admin'
      GROUP BY u.id, u.email, u.name, u.role, s.plan_id
      ORDER BY message_count DESC
      LIMIT 10
    `),
  ]);

  res.json({
    stats: {
      totalUsers: Number(totalUsers),
      newUsersToday: Number(newUsersToday),
      totalDevices: Number(totalDevices),
      messagesToday: Number(messagesToday),
      revenueMonth: parseFloat(revenueMonth as string),
      totalRevenue: parseFloat(totalRevenue as string),
    },
    planDistribution: planDist.rows.map((r: any) => ({ planId: r.plan_id, count: Number(r.count) })),
    userGrowth: userGrowthRows.rows.map((r: any) => ({ day: r.day, count: Number(r.count) })),
    messageTrend: msgTrendRows.rows.map((r: any) => ({ day: r.day, count: Number(r.count) })),
    topUsers: topUsersRows.rows.map((r: any) => ({
      id: r.id, email: r.email, name: r.name,
      planId: r.plan_id,
      messageCount: Number(r.message_count),
      deviceCount: Number(r.device_count),
    })),
  });
});

// ── Admin: All Transactions ─────────────────────────────────────────────────

router.get("/admin/transactions", async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10));
  const limit = Math.min(100, parseInt(String(req.query.limit ?? "30"), 10));
  const search = String(req.query.search ?? "").trim();
  const status = String(req.query.status ?? "").trim();
  const offset = (page - 1) * limit;

  const rows = await db.execute(sql`
    SELECT t.id, t.amount, t.currency, t.status, t.description, t.created_at,
           u.id AS user_id, u.email, u.name
    FROM transactions t
    JOIN users u ON u.id = t.user_id
    WHERE (${search} = '' OR u.email ILIKE ${'%' + search + '%'} OR u.name ILIKE ${'%' + search + '%'} OR t.description ILIKE ${'%' + search + '%'})
      AND (${status} = '' OR t.status = ${status})
    ORDER BY t.created_at DESC
    LIMIT ${limit} OFFSET ${offset}
  `);

  const [{ total }] = (await db.execute(sql`
    SELECT COUNT(*) AS total
    FROM transactions t
    JOIN users u ON u.id = t.user_id
    WHERE (${search} = '' OR u.email ILIKE ${'%' + search + '%'} OR u.name ILIKE ${'%' + search + '%'} OR t.description ILIKE ${'%' + search + '%'})
      AND (${status} = '' OR t.status = ${status})
  `)).rows as any[];

  res.json({
    data: rows.rows.map((r: any) => ({
      id: r.id,
      amount: parseFloat(r.amount),
      currency: r.currency,
      status: r.status,
      description: r.description,
      createdAt: r.created_at,
      user: { id: r.user_id, email: r.email, name: r.name },
    })),
    total: Number(total),
    page,
    totalPages: Math.ceil(Number(total) / limit),
  });
});

/** GET /admin/settings?keys=key1,key2 — ambil beberapa setting sekaligus */
router.get("/admin/settings", async (req, res): Promise<void> => {
  const keysParam = (req.query.keys as string | undefined) ?? "";
  const keys = keysParam.split(",").map((k) => k.trim()).filter(Boolean);
  const result: Record<string, string | null> = {};
  for (const key of keys) {
    const [row] = await db.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, key));
    result[key] = row?.value ?? null;
  }
  res.json(result);
});

/** PUT /admin/settings — simpan key-value pairs ke settings */
router.put("/admin/settings", async (req, res): Promise<void> => {
  const body = req.body as Record<string, string>;
  for (const [key, value] of Object.entries(body)) {
    if (typeof value !== "string") continue;
    const existing = await db.select({ id: settingsTable.id }).from(settingsTable).where(eq(settingsTable.key, key));
    if (existing.length) {
      await db.update(settingsTable).set({ value }).where(eq(settingsTable.key, key));
    } else {
      await db.insert(settingsTable).values({ key, value });
    }
  }
  res.json({ ok: true });
});

/** POST /admin/telegram/test — kirim test notifikasi Telegram */
router.post("/admin/telegram/test", async (_req, res): Promise<void> => {
  const [tokenRow] = await db.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, "telegram_bot_token"));
  const [chatRow] = await db.select({ value: settingsTable.value }).from(settingsTable).where(eq(settingsTable.key, "telegram_chat_id"));

  const token = tokenRow?.value;
  const chatId = chatRow?.value;

  if (!token || !chatId) {
    res.status(400).json({ message: "Bot Token dan Chat ID belum dikonfigurasi" });
    return;
  }

  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text: "✅ <b>Test Notifikasi WA Gateway</b>\n\nKonfigurasi Telegram kamu berhasil! Alert otomatis akan dikirim ke sini.",
      parse_mode: "HTML",
    }),
  });

  if (!r.ok) {
    const err: any = await r.json().catch(() => ({}));
    res.status(400).json({ message: err?.description ?? "Gagal mengirim ke Telegram" });
    return;
  }

  res.json({ ok: true });
});

export { getSetting };
export default router;
