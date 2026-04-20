import { Router, type IRouter } from "express";
import { db, subscriptionsTable, transactionsTable, usersTable, plansTable, vouchersTable, voucherUsagesTable, walletTransactionsTable, adminWaBotSessionsTable, adminWaBotSettingsTable, paymentWebhookLogsTable } from "@workspace/db";
import { sendSubscriptionEmail } from "../lib/email";
import { eq, sql, and } from "drizzle-orm";
import { getUserPlan, countUserDevices, countTodayMessages, countUserContacts } from "../lib/plan-limits";
import { getUserFromToken } from "./auth";
import { createCheckout, pendingOrders, gatewayConfig, type PendingOrder } from "./payment-gateway";
import { getSession } from "../lib/wa-manager";
import { logger } from "../lib/logger";
import crypto from "crypto";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

function fmtRpBilling(n: number): string {
  return "Rp " + n.toLocaleString("id-ID");
}

const PAID_STATUSES = new Set(["paid", "settlement", "capture", "success", "completed", "1"]);
const SENSITIVE_WEBHOOK_FIELDS = new Set([
  "api_key",
  "apikey",
  "apiKey",
  "signature",
  "secret",
  "token",
  "private_key",
  "privateKey",
]);

type PaymentWebhookProcessingStatus = "received" | "ignored" | "paid" | "failed";

function sanitizePaymentWebhookPayload(body: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(body).map(([key, value]) => [
      key,
      SENSITIVE_WEBHOOK_FIELDS.has(key) ? "[redacted]" : value,
    ]),
  );
}

async function recordPaymentWebhookLog(input: {
  gateway?: string | null;
  orderId?: string | null;
  userId?: number | null;
  eventStatus?: string | null;
  processingStatus: PaymentWebhookProcessingStatus;
  httpStatus?: number | null;
  amount?: number | null;
  project?: string | null;
  message?: string | null;
  payload: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.insert(paymentWebhookLogsTable).values({
      gateway: input.gateway || "unknown",
      orderId: input.orderId ?? null,
      userId: input.userId ?? null,
      eventStatus: input.eventStatus ?? null,
      processingStatus: input.processingStatus,
      httpStatus: input.httpStatus ?? null,
      amount: input.amount === undefined || input.amount === null ? null : String(input.amount),
      project: input.project ?? null,
      message: input.message ?? null,
      payload: input.payload,
    });
  } catch (err) {
    logger.error({ err }, "[Billing] Failed to record payment webhook log");
  }
}

function readWebhookString(value: unknown): string | null {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return null;
}

function readWebhookRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function readWebhookAmount(body: Record<string, unknown>): number | null {
  const raw =
    body.amount ??
    body.jumlah ??
    body.gross_amount ??
    body.total_amount ??
    body.total;

  if (raw === undefined || raw === null || raw === "") return null;

  const normalized =
    typeof raw === "string"
      ? Number(raw.replace(/[^\d.-]/g, ""))
      : Number(raw);

  return Number.isFinite(normalized) && normalized > 0 ? normalized : null;
}

function isPaidStatus(value: unknown): boolean {
  return PAID_STATUSES.has(String(value ?? "").trim().toLowerCase());
}

function readPakasirTransaction(data: unknown): Record<string, unknown> | null {
  const root = readWebhookRecord(data);
  if (!root) return null;

  const nestedData = readWebhookRecord(root.data);
  return (
    readWebhookRecord(root.transaction) ??
    readWebhookRecord(nestedData?.transaction) ??
    nestedData
  );
}

async function verifyPakasirTransaction(order: PendingOrder): Promise<{ ok: boolean; retryable: boolean; reason: string }> {
  const project = gatewayConfig.pakasir.merchantId.trim();
  const apiKey = gatewayConfig.pakasir.apiKey.trim();

  if (!project || !apiKey) {
    return { ok: false, retryable: false, reason: "Pakasir project/API key is not configured" };
  }

  const url = new URL("https://app.pakasir.com/api/transactiondetail");
  url.searchParams.set("project", project);
  url.searchParams.set("amount", String(order.amount));
  url.searchParams.set("order_id", order.orderId);
  url.searchParams.set("api_key", apiKey);

  try {
    const response = await fetch(url);
    if (!response.ok) {
      return {
        ok: false,
        retryable: response.status >= 500 || response.status === 429,
        reason: `Pakasir transactiondetail HTTP ${response.status}`,
      };
    }

    const data = await response.json().catch(() => null);
    const transaction = readPakasirTransaction(data);
    if (!transaction) {
      return { ok: false, retryable: false, reason: "Pakasir transactiondetail response has no transaction" };
    }

    const remoteOrderId = readWebhookString(transaction.order_id ?? transaction.orderId);
    const remoteProject = readWebhookString(transaction.project);
    const remoteAmount = readWebhookAmount(transaction);
    const remoteStatus = transaction.status ?? transaction.transaction_status ?? transaction.payment_status;

    if (remoteOrderId !== order.orderId) {
      return { ok: false, retryable: false, reason: "Pakasir order_id mismatch" };
    }

    if (remoteProject !== project) {
      return { ok: false, retryable: false, reason: "Pakasir project mismatch" };
    }

    if (remoteAmount !== order.amount) {
      return { ok: false, retryable: false, reason: "Pakasir amount mismatch" };
    }

    if (!isPaidStatus(remoteStatus)) {
      return { ok: false, retryable: false, reason: `Pakasir status is ${String(remoteStatus ?? "empty")}` };
    }

    return { ok: true, retryable: false, reason: "verified" };
  } catch (err: any) {
    logger.error({ err, orderId: order.orderId }, "[Billing] Pakasir transaction verification failed");
    return { ok: false, retryable: true, reason: err?.message ?? "Pakasir verification request failed" };
  }
}

async function sendBotNotification(userId: number, message: string): Promise<void> {
  try {
    const [settings] = await db.select().from(adminWaBotSettingsTable).limit(1);
    if (!settings?.isEnabled || !settings.deviceId) return;

    const [session] = await db.select({ phone: adminWaBotSessionsTable.phone })
      .from(adminWaBotSessionsTable)
      .where(eq(adminWaBotSessionsTable.userId, userId));
    if (!session?.phone) return;

    const sessionState = getSession(settings.deviceId);
    if (!sessionState?.socket || sessionState.status !== "connected") return;
    const sock = sessionState.socket;

    const jid = session.phone.replace(/\D/g, "").replace(/^0/, "62") + "@s.whatsapp.net";
    await sock.sendMessage(jid, { text: message });
  } catch (err: any) {
    console.error("[Billing] Gagal kirim notifikasi WA:", err?.message);
  }
}

export async function getPlansFromDb() {
  const rows = await db.select().from(plansTable).orderBy(plansTable.sortOrder, plansTable.id);
  if (rows.length === 0) return null;
  return rows.filter((p) => p.isActive).map((p) => ({
    id: p.slug,
    name: p.name,
    description: p.description ?? "",
    price: p.priceUsd,
    priceIdr: p.priceIdr,
    priceUsdYearly: p.priceUsdYearly ?? 0,
    priceIdrYearly: p.priceIdrYearly ?? 0,
    yearlyDiscountPercent: p.yearlyDiscountPercent ?? 0,
    period: p.period,
    features: (() => { try { return JSON.parse(p.features); } catch { return []; } })(),
    limits: {
      devices: p.limitDevices,
      messagesPerDay: p.limitMessagesPerDay,
      contacts: p.limitContacts,
      apiCallsPerDay: p.limitApiCallsPerDay ?? 1000,
      bulkRecipients: p.limitBulkRecipients ?? 100,
      scheduledMessages: p.limitScheduledMessages ?? 10,
      autoReplies: p.limitAutoReplies ?? 5,
    },
    planColor: p.planColor ?? "",
    planIcon: p.planIcon ?? "",
    trialDays: p.trialDays ?? 0,
    isPopular: p.isPopular,
    aiCsBotEnabled: p.aiCsBotEnabled ?? false,
    bulkMessagingEnabled: p.bulkMessagingEnabled ?? true,
    webhookEnabled: p.webhookEnabled ?? false,
    liveChatEnabled: p.liveChatEnabled ?? false,
    apiAccessEnabled: p.apiAccessEnabled ?? true,
    commerceEnabled: p.commerceEnabled ?? false,
  }));
}

const PLANS_FALLBACK = [
  { id: "free", name: "Free", price: 0, priceIdr: 0, period: "monthly", features: ["1 Perangkat", "100 pesan/hari", "100 kontak", "Akses API dasar"], limits: { devices: 1, messagesPerDay: 100, contacts: 100 }, isPopular: false },
  { id: "basic", name: "Basic", price: 29, priceIdr: 435000, period: "monthly", features: ["5 Perangkat", "5.000 pesan/hari", "10.000 kontak", "Akses API penuh", "Blast pesan", "Auto-reply"], limits: { devices: 5, messagesPerDay: 5000, contacts: 10000 }, isPopular: true },
  { id: "pro", name: "Pro", price: 99, priceIdr: 1485000, period: "monthly", features: ["Perangkat tak terbatas", "Pesan tak terbatas", "Kontak tak terbatas", "Support prioritas", "Analitik lanjutan", "Webhook & integrasi kustom"], limits: { devices: -1, messagesPerDay: -1, contacts: -1 }, isPopular: false },
];

router.get("/billing/plans", async (_req, res): Promise<void> => {
  const plans = await getPlansFromDb();
  res.json(plans ?? PLANS_FALLBACK);
});

router.get("/billing/subscription", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, uid));

  if (!sub) {
    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    res.json({
      id: "default",
      planId: "free",
      planName: "Free",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: periodEnd.toISOString(),
      cancelAtPeriodEnd: false,
    });
    return;
  }

  res.json({
    id: String(sub.id),
    planId: sub.planId,
    planName: sub.planName,
    status: sub.status,
    currentPeriodStart: sub.currentPeriodStart?.toISOString(),
    currentPeriodEnd: sub.currentPeriodEnd?.toISOString(),
    cancelAtPeriodEnd: sub.cancelAtPeriodEnd,
  });
});

router.get("/billing/transactions", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const txs = await db.select().from(transactionsTable).where(eq(transactionsTable.userId, uid)).orderBy(sql`${transactionsTable.createdAt} DESC`);

  res.json(txs.map((t) => ({
    id: String(t.id),
    amount: parseFloat(t.amount as string),
    currency: t.currency,
    status: t.status,
    plan: t.description ?? "unknown",
    description: t.description,
    createdAt: t.createdAt?.toISOString(),
  })));
});

router.get("/billing/usage", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const [plan, devices, msgToday, contacts] = await Promise.all([
    getUserPlan(uid),
    countUserDevices(uid),
    countTodayMessages(uid),
    countUserContacts(uid),
  ]);

  function usageStat(used: number, limit: number) {
    const unlimited = limit === -1;
    const percentage = unlimited ? 0 : Math.min(100, Math.round((used / Math.max(limit, 1)) * 100));
    return { used, limit, unlimited, percentage };
  }

  res.json({
    ...plan,
    usage: {
      devices: usageStat(devices, plan.limitDevices),
      messagesPerDay: usageStat(msgToday, plan.limitMessagesPerDay),
      contacts: usageStat(contacts, plan.limitContacts),
    },
  });
});

router.post("/billing/subscribe", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { plan } = req.body;

  const allPlans = (await getPlansFromDb()) ?? PLANS_FALLBACK;
  const planData = allPlans.find((p) => p.id === plan);
  if (!planData) {
    res.status(400).json({ message: "Invalid plan", code: "INVALID_PLAN" });
    return;
  }

  // Free plan — activate immediately
  if (planData.price === 0) {
    await activatePlan(uid, planData);
    res.json({ success: true, plan: planData.id, requiresPayment: false });
    return;
  }

  // ── Cek paket aktif ──────────────────────────────────────────────────────
  const [existingSub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, uid));
  const now = new Date();
  const hasActivePaidPlan =
    existingSub &&
    existingSub.status === "active" &&
    existingSub.planId !== "free" &&
    existingSub.currentPeriodEnd &&
    existingSub.currentPeriodEnd > now;

  if (hasActivePaidPlan && existingSub.planId !== plan) {
    // Mencoba beli paket LAIN saat masih aktif → tolak
    res.status(400).json({
      message: `Anda masih memiliki paket ${existingSub.planName} aktif hingga ${existingSub.currentPeriodEnd?.toLocaleDateString("id-ID")}. Tidak bisa membeli paket berbeda sebelum paket berakhir.`,
      code: "PLAN_ALREADY_ACTIVE",
      currentPlan: existingSub.planId,
      currentPlanName: existingSub.planName,
      expiresAt: existingSub.currentPeriodEnd?.toISOString(),
    });
    return;
  }
  // Jika plan sama → perpanjang (akumulasi waktu, lanjut ke checkout)

  // Paid plan — create checkout invoice
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  const orderId = `WAG-${Date.now()}-${uid}`;
  const amountIDR = (planData as any).priceIdr > 0 ? (planData as any).priceIdr : planData.price * 15000;

  const baseUrl = process.env.APP_URL ?? "http://localhost:8080";
  let paymentUrl: string;
  let qrUrl: string | undefined;
  let externalRef: string | undefined;

  try {
    const checkout = await createCheckout({
      orderId,
      userId: uid,
      plan: planData.id,
      amount: amountIDR,
      customerName: user?.name ?? "User",
      customerEmail: user?.email ?? "user@example.com",
      description: `Paket ${planData.name} WA Gateway — 1 bulan`,
      callbackUrl: `${baseUrl}/api/billing/webhook`,
      returnUrl: `${baseUrl.replace(":8080", "")}/billing?order=${orderId}`,
    });
    paymentUrl = checkout.paymentUrl;
    qrUrl = checkout.qrUrl;
    externalRef = checkout.externalRef;
  } catch (err: any) {
    res.status(502).json({ message: `Gateway error: ${err.message}`, code: "GATEWAY_ERROR" });
    return;
  }

  const expiredAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();

  const order: PendingOrder = {
    orderId,
    gateway: gatewayConfig.activeGateway,
    plan: planData.id,
    amount: amountIDR,
    userId: uid,
    paymentUrl,
    qrUrl,
    status: "pending",
    expiredAt,
    createdAt: new Date().toISOString(),
    externalRef,
  };
  pendingOrders.set(orderId, order);

  // Record pending transaction (amount stored in full IDR)
  await db.insert(transactionsTable).values({
    userId: uid,
    amount: String(amountIDR),
    currency: "IDR",
    status: "pending",
    description: `${planData.id}|${orderId}`,
  });

  res.json({
    success: true,
    requiresPayment: true,
    orderId,
    paymentUrl,
    qrUrl,
    amount: amountIDR,
    amountFormatted: `Rp ${amountIDR.toLocaleString("id-ID")}`,
    expiredAt,
    gateway: gatewayConfig.activeGateway,
    plan: planData.id,
  });
});

// ── Balance & Auto-Renew ──────────────────────────────────────────────────────

router.get("/billing/balance", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const [user] = await db.select({
    balance: usersTable.balance,
    autoRenew: usersTable.autoRenew,
  }).from(usersTable).where(eq(usersTable.id, uid));
  res.json({ balance: parseFloat(user?.balance as string ?? "0"), autoRenew: user?.autoRenew ?? false });
});

router.put("/billing/auto-renew", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { autoRenew } = req.body;
  await db.update(usersTable).set({ autoRenew: Boolean(autoRenew) }).where(eq(usersTable.id, uid));
  res.json({ success: true, autoRenew: Boolean(autoRenew) });
});

router.post("/billing/cancel", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, uid));
  if (!sub || sub.planId === "free") {
    res.status(400).json({ message: "Tidak ada langganan aktif yang bisa dibatalkan" });
    return;
  }
  await db.update(subscriptionsTable)
    .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
    .where(eq(subscriptionsTable.userId, uid));
  res.json({ success: true, message: "Langganan akan berakhir di akhir periode ini", cancelAtPeriodEnd: true });
});

router.post("/billing/resume", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, uid));
  if (!sub) {
    res.status(400).json({ message: "Tidak ada langganan yang ditemukan" });
    return;
  }
  await db.update(subscriptionsTable)
    .set({ cancelAtPeriodEnd: false, updatedAt: new Date() })
    .where(eq(subscriptionsTable.userId, uid));
  res.json({ success: true, message: "Pembatalan langganan dibatalkan", cancelAtPeriodEnd: false });
});

router.get("/billing/wallet-transactions", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rows = await db.select().from(walletTransactionsTable)
    .where(eq(walletTransactionsTable.userId, uid))
    .orderBy(sql`${walletTransactionsTable.createdAt} DESC`);
  res.json(rows.map((r) => ({
    id: String(r.id),
    amount: parseFloat(r.amount as string),
    type: r.type,
    status: r.status,
    description: r.description,
    planId: r.planId,
    createdAt: r.createdAt?.toISOString(),
  })));
});

// ── Top-Up Saldo ──────────────────────────────────────────────────────────────

router.post("/billing/topup", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { amount } = req.body;

  const amountNum = Number(amount);
  if (!amountNum || amountNum < 10000) {
    res.status(400).json({ message: "Jumlah top-up minimal Rp 10.000", code: "INVALID_AMOUNT" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, uid));
  const orderId = `TOPUP-${Date.now()}-${uid}`;
  const baseUrl = process.env.APP_URL ?? "http://localhost:8080";

  let paymentUrl: string;
  let qrUrl: string | undefined;
  let externalRef: string | undefined;

  try {
    const checkout = await createCheckout({
      orderId,
      userId: uid,
      plan: "topup",
      amount: amountNum,
      customerName: user?.name ?? "User",
      customerEmail: user?.email ?? "user@example.com",
      description: `Top-up saldo WA Gateway — Rp ${amountNum.toLocaleString("id-ID")}`,
      callbackUrl: `${baseUrl}/api/billing/webhook`,
      returnUrl: `${baseUrl.replace(":8080", "")}/billing`,
    });
    paymentUrl = checkout.paymentUrl;
    qrUrl = checkout.qrUrl;
    externalRef = checkout.externalRef;
  } catch (err: any) {
    res.status(502).json({ message: `Gateway error: ${err.message}`, code: "GATEWAY_ERROR" });
    return;
  }

  const expiredAt = new Date(Date.now() + 24 * 3600 * 1000).toISOString();
  const order: PendingOrder = {
    orderId,
    gateway: gatewayConfig.activeGateway,
    plan: "topup",
    amount: amountNum,
    userId: uid,
    paymentUrl,
    qrUrl,
    status: "pending",
    expiredAt,
    createdAt: new Date().toISOString(),
    externalRef,
    type: "topup",
  };
  pendingOrders.set(orderId, order);

  await db.insert(walletTransactionsTable).values({
    userId: uid,
    amount: String(amountNum),
    type: "topup",
    status: "pending",
    orderId,
    description: `Top-up saldo Rp ${amountNum.toLocaleString("id-ID")}`,
  });

  res.json({
    success: true,
    requiresPayment: true,
    orderId,
    paymentUrl,
    qrUrl,
    amount: amountNum,
    amountFormatted: `Rp ${amountNum.toLocaleString("id-ID")}`,
    expiredAt,
    gateway: gatewayConfig.activeGateway,
    type: "topup",
  });
});

// ── Payment status check ─────────────────────────────────────────────────────

router.get("/billing/payment-status/:orderId", async (req, res): Promise<void> => {
  const orderId = req.params.orderId as string;
  const order = pendingOrders.get(orderId);

  if (!order) {
    res.status(404).json({ message: "Order tidak ditemukan" });
    return;
  }

  // Check if expired
  if (order.status === "pending" && new Date(order.expiredAt) < new Date()) {
    order.status = "expired";
    pendingOrders.set(orderId, order);
  }

  res.json({ orderId, status: order.status, plan: order.plan, amount: order.amount, gateway: order.gateway, expiredAt: order.expiredAt });
});

// ── Simulate payment (demo only) ─────────────────────────────────────────────

router.post("/billing/simulate-pay/:orderId", async (req, res): Promise<void> => {
  const orderId = req.params.orderId as string;
  const order = pendingOrders.get(orderId);

  if (!order) {
    res.status(404).json({ message: "Order tidak ditemukan" });
    return;
  }

  if (order.status !== "pending") {
    res.status(400).json({ message: `Order sudah berstatus: ${order.status}` });
    return;
  }

  order.status = "paid";
  pendingOrders.set(orderId, order);

  if (order.type === "topup") {
    // Top-up saldo
    await db.update(usersTable)
      .set({ balance: sql`${usersTable.balance} + ${String(order.amount)}` })
      .where(eq(usersTable.id, order.userId));
    await db.update(walletTransactionsTable)
      .set({ status: "paid" })
      .where(eq(walletTransactionsTable.orderId, orderId));

    const [updatedUser] = await db.select({ balance: usersTable.balance }).from(usersTable).where(eq(usersTable.id, order.userId));
    const newBalance = parseFloat(String(updatedUser?.balance ?? "0"));
    await sendBotNotification(order.userId,
      `✅ *Top Up Berhasil!*\n\n` +
      `💰 Saldo *${fmtRpBilling(order.amount)}* sudah masuk ke wallet kamu.\n` +
      `🏦 Saldo sekarang: *${fmtRpBilling(newBalance)}*\n\n` +
      `Ketik *cek* untuk lihat saldo terbaru.\nKetik *menu* untuk kembali.`
    );
  } else {
    // Aktivasi paket
    const allPlansSimulate = (await getPlansFromDb()) ?? PLANS_FALLBACK;
    const planData = allPlansSimulate.find((p) => p.id === order.plan);
    if (planData) {
      await activatePlan(order.userId, planData);
      await db.update(transactionsTable)
        .set({ status: "paid" })
        .where(sql`${transactionsTable.description} LIKE ${"%" + orderId + "%"}`);

      await sendBotNotification(order.userId,
        `✅ *Pembayaran Berhasil!*\n\n` +
        `📦 Paket *${planData.name}* berhasil diaktifkan!\n` +
        `📅 Aktif selama 1 bulan ke depan.\n\n` +
        `Ketik *cek* untuk lihat status langganan.\nKetik *menu* untuk kembali.`
      );
    }
  }

  res.json({ success: true, message: "Pembayaran disimulasikan berhasil", type: order.type ?? "plan" });
});

// ── Payment webhook (from gateway callback) ─────────────────────────────────

router.post("/billing/webhook", async (req, res): Promise<void> => {
  const body = (req.body ?? {}) as Record<string, unknown>;
  const safePayload = sanitizePaymentWebhookPayload(body);
  logger.info(`[Billing] Webhook received: ${JSON.stringify(safePayload)}`);

  // Try to find orderId from various gateway formats
  const orderId = readWebhookString(body.external_id ?? body.order_id ?? body.merchant_ref ?? body.ref_id ?? body.orderId);
  const status = String(body.status ?? body.transaction_status ?? body.status_code ?? body.payment_status ?? "").trim();
  const eventStatus = status || null;
  const isPaid = isPaidStatus(status);
  const payloadProject = readWebhookString(body.project);
  const payloadAmount = readWebhookAmount(body);
  const payloadIsSandbox = typeof body.is_sandbox === "boolean" ? body.is_sandbox : null;

  if (!orderId) { 
    logger.warn("[Billing] Webhook received without orderId");
    await recordPaymentWebhookLog({
      gateway: gatewayConfig.activeGateway,
      orderId: null,
      eventStatus,
      processingStatus: "ignored",
      httpStatus: 200,
      amount: payloadAmount,
      project: payloadProject,
      message: "Webhook ignored: missing order ID",
      payload: safePayload,
    });
    res.sendStatus(200); 
    return; 
  }

  let order = pendingOrders.get(orderId);

  const resolveLogGateway = () =>
    order?.gateway && order.gateway !== "unknown"
      ? order.gateway
      : gatewayConfig.activeGateway;

  const writeWebhookLog = (
    processingStatus: PaymentWebhookProcessingStatus,
    message: string,
    httpStatus = 200,
  ) => recordPaymentWebhookLog({
    gateway: resolveLogGateway(),
    orderId,
    userId: order?.userId ?? null,
    eventStatus,
    processingStatus,
    httpStatus,
    amount: payloadAmount,
    project: payloadProject,
    message,
    payload: safePayload,
  });
  
  if (!order) {
    logger.info(`[Billing] Order ${orderId} not in memory, searching DB...`);
    
    // 1. Search in transactionsTable (for plan subscriptions)
    const [dbTx] = await db.select().from(transactionsTable)
      .where(sql`${transactionsTable.description} LIKE ${"%" + orderId + "%"}`)
      .limit(1);

    if (dbTx) {
      const parts = (dbTx.description ?? "").split("|");
      order = {
        orderId,
        gateway: "unknown",
        plan: parts[0] ?? "basic", // parts[0] is planId
        amount: Number(dbTx.amount),
        userId: dbTx.userId,
        paymentUrl: "",
        status: dbTx.status as any,
        expiredAt: new Date(Date.now() + 86400000).toISOString(),
        createdAt: dbTx.createdAt?.toISOString() ?? new Date().toISOString(),
        type: "plan"
      };
      logger.info(`[Billing] Order ${orderId} recovered from transactionsTable`);
    } else {
      // 2. Search in walletTransactionsTable (for top-ups)
      const [walletTx] = await db.select().from(walletTransactionsTable)
        .where(eq(walletTransactionsTable.orderId, orderId))
        .limit(1);
      
      if (walletTx) {
        order = {
          orderId,
          gateway: "unknown",
          plan: "topup",
          amount: Number(walletTx.amount),
          userId: walletTx.userId,
          paymentUrl: "",
          status: walletTx.status as any,
          expiredAt: new Date(Date.now() + 86400000).toISOString(),
          createdAt: walletTx.createdAt?.toISOString() ?? new Date().toISOString(),
          type: "topup"
        };
        logger.info(`[Billing] Order ${orderId} recovered from walletTransactionsTable`);
      }
    }
  }

  const shouldValidatePakasir =
    order?.gateway === "pakasir" ||
    gatewayConfig.activeGateway === "pakasir" ||
    payloadProject !== null;

  if (shouldValidatePakasir) {
    const expectedProject = gatewayConfig.pakasir.merchantId.trim();

    if (!payloadProject) {
      logger.warn({ orderId }, "[Billing] Pakasir webhook ignored: missing project");
      await writeWebhookLog("ignored", "Pakasir webhook ignored: missing project");
      res.sendStatus(200);
      return;
    }

    if (expectedProject && payloadProject !== expectedProject) {
      logger.warn(
        { orderId, payloadProject, expectedProject },
        "[Billing] Pakasir webhook ignored: project mismatch",
      );
      await writeWebhookLog("ignored", `Pakasir webhook ignored: project mismatch (${payloadProject})`);
      res.sendStatus(200);
      return;
    }

    if (!payloadAmount) {
      logger.warn({ orderId, payloadProject }, "[Billing] Pakasir webhook ignored: missing amount");
      await writeWebhookLog("ignored", "Pakasir webhook ignored: missing amount");
      res.sendStatus(200);
      return;
    }

    if (order && payloadAmount !== order.amount) {
      logger.warn(
        { orderId, payloadAmount, expectedAmount: order.amount },
        "[Billing] Pakasir webhook ignored: amount mismatch",
      );
      await writeWebhookLog("ignored", `Pakasir webhook ignored: amount mismatch (${payloadAmount} != ${order.amount})`);
      res.sendStatus(200);
      return;
    }

    if (payloadIsSandbox !== null) {
      const expectedSandbox = gatewayConfig.pakasir.mode === "sandbox";
      if (payloadIsSandbox !== expectedSandbox) {
        logger.warn(
          { orderId, payloadIsSandbox, expectedSandbox },
          "[Billing] Pakasir webhook ignored: mode mismatch",
        );
        await writeWebhookLog("ignored", `Pakasir webhook ignored: mode mismatch (${payloadIsSandbox ? "sandbox" : "production"})`);
        res.sendStatus(200);
        return;
      }
    }
  }

  if (!order || order.status !== "pending") { 
    logger.warn(`[Billing] Order ${orderId} not found or not pending (Status: ${order?.status})`);
    await writeWebhookLog("ignored", order ? `Order ignored: status is ${order.status}` : "Order ignored: not found");
    res.sendStatus(200); 
    return; 
  }

  if (shouldValidatePakasir && isPaid) {
    const verification = await verifyPakasirTransaction(order);
    if (!verification.ok) {
      logger.warn(
        { orderId, retryable: verification.retryable, reason: verification.reason },
        "[Billing] Pakasir webhook ignored: transactiondetail verification failed",
      );

      if (verification.retryable) {
        await writeWebhookLog("failed", verification.reason, 503);
        res.status(503).json({ success: false, message: "Pakasir verification temporarily failed" });
        return;
      }

      await writeWebhookLog("ignored", verification.reason);
      res.sendStatus(200);
      return;
    }
  }

  if (isPaid) {
    order.status = "paid";
    pendingOrders.set(orderId, order);
    logger.info(`[Billing] Order ${orderId} marked as PAID`);

    if (order.type === "topup") {
      await db.update(usersTable)
        .set({ balance: sql`${usersTable.balance} + ${String(order.amount)}` })
        .where(eq(usersTable.id, order.userId));
      await db.update(walletTransactionsTable)
        .set({ status: "paid" })
        .where(eq(walletTransactionsTable.orderId, orderId));

      const [updatedUserWh] = await db.select({ balance: usersTable.balance }).from(usersTable).where(eq(usersTable.id, order.userId));
      const newBalanceWh = parseFloat(String(updatedUserWh?.balance ?? "0"));
      await sendBotNotification(order.userId,
        `✅ *Top Up Berhasil!*\n\n` +
        `💰 Saldo *${fmtRpBilling(order.amount)}* sudah masuk ke wallet kamu.\n` +
        `🏦 Saldo sekarang: *${fmtRpBilling(newBalanceWh)}*\n\n` +
        `Ketik *cek* untuk lihat saldo terbaru.\nKetik *menu* untuk kembali.`
      );
      await writeWebhookLog("paid", "Topup credited to wallet");
    } else {
      const allPlansWh = (await getPlansFromDb()) ?? PLANS_FALLBACK;
      // Try to find by slug/id
      let planData = allPlansWh.find((p) => p.id === order!.plan);
      
      if (!planData) {
        // Backup: find by name if the ID/Slug didn't match (happens if reconstructed from DB Name part)
        const parts = (order.plan ?? "").split("|"); // If it was reconstructed
        planData = allPlansWh.find((p) => p.name === parts[0] || p.id === parts[1]);
      }

      if (planData) {
        await activatePlan(order.userId, planData);
        await db.update(transactionsTable)
          .set({ status: "paid" })
          .where(sql`${transactionsTable.description} LIKE ${"%" + orderId + "%"}`);

        await sendBotNotification(order.userId,
          `✅ *Pembayaran Berhasil!*\n\n` +
          `📦 Paket *${planData.name}* berhasil diaktifkan!\n` +
          `📅 Aktif selama 1 bulan ke depan.\n\n` +
          `Ketik *cek* untuk lihat status langganan.\nKetik *menu* untuk kembali.`
        );
        await writeWebhookLog("paid", `Plan activated: ${planData.name}`);
      } else {
        logger.error(`[Billing] Plan data not found for plan: ${order.plan}`);
        await writeWebhookLog("failed", `Plan data not found: ${order.plan}`);
      }
    }
  } else {
    await writeWebhookLog("received", status ? `Webhook status is ${status}; waiting for paid status` : "Webhook status is empty; waiting for paid status");
  }

  res.sendStatus(200);
});

// ── Voucher: validate ────────────────────────────────────────────────────────

router.get("/billing/voucher/validate", async (req, res): Promise<void> => {
  const code = String(req.query.code ?? "").toUpperCase().trim();
  if (!code) { res.status(400).json({ ok: false, message: "Kode voucher tidak boleh kosong" }); return; }

  const [voucher] = await db.select().from(vouchersTable).where(eq(vouchersTable.code, code));
  if (!voucher || !voucher.isActive) {
    res.status(404).json({ ok: false, message: "Kode voucher tidak valid atau sudah tidak aktif" });
    return;
  }
  if (voucher.expiresAt && voucher.expiresAt < new Date()) {
    res.status(410).json({ ok: false, message: "Kode voucher sudah kedaluwarsa" });
    return;
  }
  if (voucher.maxUses !== -1 && voucher.usedCount >= voucher.maxUses) {
    res.status(410).json({ ok: false, message: "Kode voucher sudah habis digunakan" });
    return;
  }

  res.json({
    ok: true,
    code: voucher.code,
    type: voucher.type,
    planSlug: voucher.planSlug,
    planName: voucher.planName,
    durationDays: voucher.durationDays,
    description: voucher.description,
    remainingUses: voucher.maxUses === -1 ? null : voucher.maxUses - voucher.usedCount,
  });
});

// ── Voucher: redeem ──────────────────────────────────────────────────────────

router.post("/billing/voucher/redeem", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const code = String(req.body.code ?? "").toUpperCase().trim();
  if (!code) { res.status(400).json({ ok: false, message: "Kode voucher tidak boleh kosong" }); return; }

  const [voucher] = await db.select().from(vouchersTable).where(eq(vouchersTable.code, code));
  if (!voucher || !voucher.isActive) {
    res.status(404).json({ ok: false, message: "Kode voucher tidak valid atau sudah tidak aktif" });
    return;
  }
  if (voucher.expiresAt && voucher.expiresAt < new Date()) {
    res.status(410).json({ ok: false, message: "Kode voucher sudah kedaluwarsa" });
    return;
  }
  if (voucher.maxUses !== -1 && voucher.usedCount >= voucher.maxUses) {
    res.status(410).json({ ok: false, message: "Kode voucher sudah habis digunakan" });
    return;
  }

  // Check if user already used this voucher
  const [alreadyUsed] = await db.select().from(voucherUsagesTable)
    .where(and(eq(voucherUsagesTable.voucherId, voucher.id), eq(voucherUsagesTable.userId, uid)));
  if (alreadyUsed) {
    res.status(409).json({ ok: false, message: "Anda sudah pernah menggunakan voucher ini" });
    return;
  }

  // Activate trial / plan for durationDays
  const now = new Date();
  const periodStart = now;
  const status = voucher.type === "trial" ? "trial" : "active";

  const existing = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, uid));
  const currentSub = existing[0] ?? null;
  const isOnPaidActivePlan = currentSub?.status === "active" && currentSub?.planId !== "free" && currentSub?.currentPeriodEnd && currentSub.currentPeriodEnd > now;

  if (isOnPaidActivePlan && voucher.type === "trial") {
    res.status(409).json({ ok: false, message: "Anda sudah memiliki langganan aktif yang tidak memerlukan trial" });
    return;
  }

  // Accumulate: extend from current period end if it hasn't expired yet
  let baseDate = now;
  if (currentSub?.currentPeriodEnd && currentSub.currentPeriodEnd > now) {
    baseDate = currentSub.currentPeriodEnd;
  }

  const periodEnd = new Date(baseDate);
  periodEnd.setDate(periodEnd.getDate() + voucher.durationDays);

  if (existing.length > 0) {
    await db.update(subscriptionsTable)
      .set({ planId: voucher.planSlug, planName: voucher.planName, status, currentPeriodStart: periodStart, currentPeriodEnd: periodEnd })
      .where(eq(subscriptionsTable.userId, uid));
  } else {
    await db.insert(subscriptionsTable).values({
      userId: uid,
      planId: voucher.planSlug,
      planName: voucher.planName,
      status,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    });
  }

  await db.update(usersTable).set({ plan: voucher.planSlug }).where(eq(usersTable.id, uid));

  // Record usage
  await db.insert(voucherUsagesTable).values({ voucherId: voucher.id, userId: uid });
  await db.update(vouchersTable).set({ usedCount: voucher.usedCount + 1, updatedAt: new Date() }).where(eq(vouchersTable.id, voucher.id));

  // Record transaction
  await db.insert(transactionsTable).values({
    userId: uid,
    amount: "0",
    currency: "IDR",
    status: "paid",
    description: `Voucher: ${voucher.code} — ${voucher.planName} ${voucher.durationDays} hari`,
  });

  res.json({
    ok: true,
    message: `Voucher berhasil! Paket ${voucher.planName} aktif selama ${voucher.durationDays} hari`,
    planSlug: voucher.planSlug,
    planName: voucher.planName,
    durationDays: voucher.durationDays,
    periodEnd: periodEnd.toISOString(),
  });
});

// ── Helper: activate subscription ───────────────────────────────────────────

export async function activatePlan(userId: number, planData: { id: string; name: string; [key: string]: unknown }) {
  const now = new Date();
  const existing = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId));

  // Accumulate: if user has an active subscription that hasn't expired yet,
  // start the new month from the current period end (not from today).
  let baseDate = now;
  if (existing.length > 0) {
    const cur = existing[0];
    if (cur.status === "active" && cur.currentPeriodEnd && cur.currentPeriodEnd > now) {
      baseDate = cur.currentPeriodEnd;
    }
  }

  const periodStart = now;
  const periodEnd = new Date(baseDate);
  periodEnd.setMonth(periodEnd.getMonth() + 1);

  if (existing.length > 0) {
    await db.update(subscriptionsTable)
      .set({ planId: planData.id, planName: planData.name, status: "active", currentPeriodStart: periodStart, currentPeriodEnd: periodEnd })
      .where(eq(subscriptionsTable.userId, userId));
  } else {
    await db.insert(subscriptionsTable).values({
      userId,
      planId: planData.id,
      planName: planData.name,
      status: "active",
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    });
  }

  await db.update(usersTable).set({ plan: planData.id }).where(eq(usersTable.id, userId));

  // Send subscription confirmation email
  const [u] = await db.select({ email: usersTable.email, name: usersTable.name }).from(usersTable).where(eq(usersTable.id, userId));
  if (u) sendSubscriptionEmail(u.email, u.name, planData.name, periodEnd).catch(() => {});
}

export default router;
