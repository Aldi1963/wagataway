/**
 * Admin WA Center Bot Processor
 *
 * Handles incoming WhatsApp messages to the admin's designated "WA Center" device.
 * Users can check subscription status, browse plans, subscribe/pay, renew, open tickets, etc.
 */

import {
  db,
  adminWaBotSettingsTable,
  adminWaBotSessionsTable,
  adminWaBotTicketsTable,
  adminWaBotConvLogsTable,
  adminWaBotBroadcastsTable,
  usersTable,
  subscriptionsTable,
  transactionsTable,
  plansTable,
  walletTransactionsTable,
  vouchersTable,
  voucherUsagesTable,
} from "@workspace/db";
import { eq, desc, ilike, and, lte, gte, isNotNull, sql } from "drizzle-orm";
import { getDeviceSocket } from "./wa-sender";
import { createCheckout, pendingOrders, gatewayConfig } from "../routes/payment-gateway";
import { activatePlan } from "../routes/billing";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ListRow { rowId: string; title: string; description?: string }
interface ListSection { title: string; rows: ListRow[] }

interface BotContext {
  settings: typeof adminWaBotSettingsTable.$inferSelect;
  session: typeof adminWaBotSessionsTable.$inferSelect;
  phone: string;
  text: string;
  send: (text: string) => Promise<void>;
  sendList: (title: string, text: string, buttonText: string, sections: ListSection[]) => Promise<void>;
  sendImage: (url: string, caption: string) => Promise<void>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function normPhone(phone: string): string {
  return phone.replace(/\D/g, "").replace(/^0/, "62");
}

function fmtDate(d: Date | null | undefined): string {
  if (!d) return "—";
  return d.toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}

function fmtRp(n: number | string | null | undefined): string {
  const num = typeof n === "string" ? parseFloat(n) : (n ?? 0);
  return "Rp " + num.toLocaleString("id-ID");
}

function expand(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

function expandSettings(template: string, settings: typeof adminWaBotSettingsTable.$inferSelect): string {
  return expand(template, { appName: settings.appName });
}

function genTicketCode(): string {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = Math.random().toString(36).slice(2, 5).toUpperCase();
  return `TKT-${ts}-${rand}`;
}

function gwLabel(): string {
  const labels: Record<string, string> = {
    pakasir:  "Pakasir",
    midtrans: "Midtrans",
    xendit:   "Xendit",
    tokopay:  "Tokopay",
    tripay:   "Tripay",
    none:     "Demo",
  };
  return labels[gatewayConfig.activeGateway] ?? gatewayConfig.activeGateway;
}

async function getSettings(): Promise<typeof adminWaBotSettingsTable.$inferSelect | null> {
  const [row] = await db.select().from(adminWaBotSettingsTable).limit(1);
  return row ?? null;
}

async function getOrCreateSession(
  phone: string,
  settings: typeof adminWaBotSettingsTable.$inferSelect,
): Promise<typeof adminWaBotSessionsTable.$inferSelect> {
  const now = new Date();
  const [existing] = await db
    .select()
    .from(adminWaBotSessionsTable)
    .where(eq(adminWaBotSessionsTable.phone, phone));

  if (existing) {
    const lastMs = existing.lastActivity.getTime();
    const timeoutMs = (settings.sessionTimeoutMinutes ?? 60) * 60 * 1000;
    if (Date.now() - lastMs > timeoutMs) {
      const [reset] = await db
        .update(adminWaBotSessionsTable)
        .set({ userId: null, userEmail: null, userName: null, userPlan: null, step: "await_email", pendingPlanSlug: null, lastActivity: now })
        .where(eq(adminWaBotSessionsTable.id, existing.id))
        .returning();
      return reset;
    }
    const [upd] = await db
      .update(adminWaBotSessionsTable)
      .set({ lastActivity: now })
      .where(eq(adminWaBotSessionsTable.id, existing.id))
      .returning();
    return upd;
  }

  const [created] = await db.insert(adminWaBotSessionsTable).values({ phone, step: "await_email", lastActivity: now }).returning();
  return created;
}

async function updateSession(id: number, data: Partial<typeof adminWaBotSessionsTable.$inferInsert>): Promise<void> {
  await db.update(adminWaBotSessionsTable).set(data).where(eq(adminWaBotSessionsTable.id, id));
}

async function logConv(
  phone: string,
  direction: "in" | "out",
  message: string,
  userId?: number | null,
  userName?: string | null,
): Promise<void> {
  try {
    await db.insert(adminWaBotConvLogsTable).values({ phone, direction, message, userId: userId ?? null, userName: userName ?? null });
  } catch {}
}

// ── Command handlers ──────────────────────────────────────────────────────────

async function handleCekAkun(ctx: BotContext): Promise<void> {
  const { session, send } = ctx;
  if (!session.userId) {
    await send("⚠️ Kamu belum terhubung ke akun. Kirimkan *email* akun kamu terlebih dahulu.");
    return;
  }

  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, session.userId));
  const [user] = await db
    .select({ balance: usersTable.balance, autoRenew: usersTable.autoRenew })
    .from(usersTable)
    .where(eq(usersTable.id, session.userId));

  const now = new Date();
  const isActive = sub?.status === "active" && sub.currentPeriodEnd && sub.currentPeriodEnd > now;
  const isTrial = sub?.status === "trial" && sub.currentPeriodEnd && sub.currentPeriodEnd > now;
  const planName = sub?.planName ?? "Free";
  const expiry = sub?.currentPeriodEnd ? fmtDate(sub.currentPeriodEnd) : "—";
  const balance = fmtRp(user?.balance ?? 0);
  const autoRenew = user?.autoRenew ? "✅ Aktif" : "❌ Nonaktif";
  const statusLabel = isActive ? "✅ Aktif" : isTrial ? "🎁 Trial" : "⚠️ Tidak Aktif";

  await send(
    `👤 *Info Akun — ${session.userName}*\n\n` +
    `📧 Email: ${session.userEmail}\n` +
    `📦 Paket: *${planName}*\n` +
    `🔖 Status: ${statusLabel}\n` +
    `📅 Aktif hingga: ${expiry}\n` +
    `💰 Saldo wallet: ${balance}\n` +
    `🔄 Auto-renew: ${autoRenew}\n\n` +
    (!(isActive || isTrial) ? `Ketik *perpanjang* atau *paket* untuk berlangganan.\n\n` : `Ketik *perpanjang* untuk memperpanjang paket.\n\n`) +
    `Ketik *menu* untuk kembali ke menu.`
  );
}

async function handlePaket(ctx: BotContext): Promise<void> {
  const { send } = ctx;
  const plans = await db.select().from(plansTable).orderBy(plansTable.sortOrder, plansTable.id);

  if (plans.length === 0) {
    await send("ℹ️ Belum ada paket tersedia saat ini.");
    return;
  }

  const lines = plans.map((p, i) => {
    const priceIdr = (p as any).priceIdr ?? p.price;
    const priceStr = priceIdr > 0 ? fmtRp(priceIdr) + "/bulan" : "GRATIS";
    return `${i + 1}. *${p.name}* — ${priceStr}\n   ${p.description ?? ""}`;
  });
  await send(
    `📦 *Daftar Paket Tersedia*\n\n` + lines.join("\n\n") +
    `\n\n💡 Ketik: *langganan [nama paket]*\nContoh: *langganan Basic*\n\nKetik *menu* untuk kembali.`
  );
}

async function handlePerpanjang(ctx: BotContext): Promise<void> {
  const { session, send, settings } = ctx;
  if (!session.userId) {
    await send("⚠️ Kamu belum terhubung ke akun. Kirimkan *email* akun kamu terlebih dahulu.");
    return;
  }

  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, session.userId));
  const [user] = await db.select({ balance: usersTable.balance }).from(usersTable).where(eq(usersTable.id, session.userId));

  if (!sub || (sub.status !== "active" && sub.status !== "trial")) {
    await send(
      `ℹ️ Kamu belum memiliki paket aktif.\n\nKetik *paket* untuk melihat daftar paket dan berlangganan.\n\nKetik *menu* untuk kembali.`
    );
    return;
  }

  const planName = sub.planName ?? "—";
  const expiry = sub.currentPeriodEnd ? fmtDate(sub.currentPeriodEnd) : "—";
  const walletNum = parseFloat((user?.balance as string) ?? "0");
  const balance = fmtRp(walletNum);

  const plan = await db.select().from(plansTable).where(
    ilike(plansTable.name, sub.planName ?? "")
  ).limit(1).then(r => r[0]);

  const priceIdr = plan ? ((plan as any).priceIdr ?? plan.price) : 0;
  const priceNum = Number(priceIdr);

  // Sufficient wallet → debit & renew directly
  if (walletNum >= priceNum) {
    await db.update(usersTable)
      .set({ balance: sql`${usersTable.balance} - ${String(priceNum)}` })
      .where(eq(usersTable.id, session.userId!));
    const orderId = `RENEW-WALLET-${Date.now()}-${session.userId}`;
    const renewPlanId = plan?.slug ?? sub.planId ?? "basic";
    await db.insert(walletTransactionsTable).values({
      userId: session.userId!,
      amount: String(priceNum),
      type: "manual_renew",
      status: "paid",
      orderId,
      planId: renewPlanId,
      description: `Perpanjang ${planName}`,
    });
    await db.insert(transactionsTable).values({
      userId: session.userId!,
      amount: String(priceNum),
      currency: "IDR",
      status: "paid",
      planName,
      description: `${renewPlanId}|${orderId}`,
    });
    await activatePlan(session.userId!, { id: renewPlanId, name: planName });
    await updateSession(session.id, { pendingPlanSlug: null });
    const newBalance = walletNum - priceNum;
    await send(
      `✅ *Paket ${planName} berhasil diperpanjang!*\n\n` +
      `💰 Dibayar dari wallet: *${fmtRp(priceNum)}*\n` +
      `🏦 Saldo tersisa: *${fmtRp(newBalance)}*\n\n` +
      `Paket diperpanjang 1 bulan.\nKetik *cek* untuk melihat status baru.\nKetik *menu* untuk kembali.`
    );
    return;
  }

  // Insufficient balance → invoice
  const kekurangan = priceNum - walletNum;
  const orderId = `WAG-${Date.now()}-${session.userId}`;
  const baseUrl = process.env.APP_URL ?? "http://localhost:8080";
  const renewPlanId2 = plan?.slug ?? sub.planId ?? "basic";
  try {
    const [userRow2] = await db.select({ name: usersTable.name, email: usersTable.email })
      .from(usersTable).where(eq(usersTable.id, session.userId!));
    const checkout = await createCheckout({
      orderId,
      userId: session.userId!,
      plan: renewPlanId2,
      amount: priceNum,
      customerName: userRow2?.name ?? session.userName ?? "User",
      customerEmail: userRow2?.email ?? session.userEmail ?? "user@example.com",
      description: `Perpanjang ${planName} WA Gateway — 1 bulan`,
      callbackUrl: `${baseUrl}/api/billing/webhook`,
      returnUrl: `${baseUrl.replace(/:8080$/, "")}/billing?order=${orderId}`,
    });
    pendingOrders.set(orderId, {
      orderId,
      gateway: gatewayConfig.activeGateway,
      plan: renewPlanId2,
      amount: priceNum,
      userId: session.userId!,
      paymentUrl: checkout.paymentUrl,
      qrUrl: checkout.qrUrl,
      status: "pending",
      expiredAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      externalRef: checkout.externalRef,
    });
    await db.insert(transactionsTable).values({
      userId: session.userId!,
      amount: String(priceNum),
      currency: "IDR",
      status: "pending",
      planName,
      description: `${renewPlanId2}|${orderId}`,
    });
    await updateSession(session.id, { pendingPlanSlug: orderId });

    const invoiceTextPerpanjang =
      `💳 *Invoice Perpanjang ${planName}*\n\n` +
      `📅 Paket berlaku hingga: *${expiry}*\n` +
      `💰 Harga perpanjang: *${fmtRp(priceNum)}/bulan*\n` +
      `🏦 Saldo wallet: *${balance}*${walletNum > 0 ? ` (kurang ${fmtRp(kekurangan)})` : ""}\n` +
      `📋 ID Invoice: *${orderId}*\n` +
      `⏳ Berlaku: 24 jam\n\n` +
      (checkout.qrUrl
        ? `📲 *Scan QRIS di bawah ini untuk membayar.*\n`
        : `🔗 *Bayar via ${gwLabel()}:*\n${checkout.paymentUrl}\n\n`) +
      `Setelah bayar, paket otomatis diperpanjang.\n` +
      `Ketik *cek bayar* untuk cek status.\n\nKetik *menu* untuk kembali.`;

    await send(invoiceTextPerpanjang);

    if (checkout.qrUrl) {
      try {
        await ctx.sendImage(
          checkout.qrUrl,
          `🔄 QRIS Perpanjang ${planName}\nID: ${orderId}\nScan & bayar, paket otomatis diperpanjang.`
        );
      } catch {
        await send(`🔗 *Bayar via ${gwLabel()}:*\n${checkout.paymentUrl}`);
      }
    }
  } catch (err: any) {
    console.error("[WA Bot] Renew invoice error:", err?.message);
    await send(
      `❌ Gagal membuat invoice. Silakan coba lagi.\n\n` +
      `Atau top up saldo dulu: *topup ${priceNum}*\n\nKetik *menu* untuk kembali.`
    );
  }
}

async function handleRiwayat(ctx: BotContext): Promise<void> {
  const { session, send } = ctx;
  if (!session.userId) {
    await send("⚠️ Kamu belum terhubung ke akun. Kirimkan *email* akun kamu terlebih dahulu.");
    return;
  }

  const txs = await db
    .select().from(transactionsTable)
    .where(eq(transactionsTable.userId, session.userId))
    .orderBy(desc(transactionsTable.createdAt))
    .limit(5);

  if (txs.length === 0) {
    await send("📜 Belum ada riwayat transaksi.\n\nKetik *menu* untuk kembali.");
    return;
  }

  const lines = txs.map((t) => {
    const statusEmoji = t.status === "paid" ? "✅" : t.status === "pending" ? "⏳" : "❌";
    return `${statusEmoji} ${t.planName ?? t.description ?? "—"} — ${fmtRp(t.amount)}\n   📅 ${fmtDate(t.createdAt)}`;
  });

  await send(`📜 *Riwayat Transaksi (5 terakhir)*\n\n` + lines.join("\n\n") + `\n\nKetik *menu* untuk kembali.`);
}

function parseAmount(raw: string): number | null {
  const s = raw.toLowerCase().replace(/[rp\s,.]/g, "");
  if (!s) return null;
  let mult = 1;
  let num = s;
  if (s.endsWith("jt") || s.endsWith("juta")) { mult = 1_000_000; num = s.replace(/(juta|jt)$/, ""); }
  else if (s.endsWith("rb") || s.endsWith("ribu")) { mult = 1_000; num = s.replace(/(ribu|rb)$/, ""); }
  else if (s.endsWith("k")) { mult = 1_000; num = s.replace(/k$/, ""); }
  const v = parseFloat(num) * mult;
  return isNaN(v) || v <= 0 ? null : v;
}

async function handleTopup(ctx: BotContext, amountStr?: string): Promise<void> {
  const { session, send } = ctx;
  if (!session.userId) {
    await send("⚠️ Kamu belum terhubung ke akun. Kirimkan *email* akun kamu terlebih dahulu.");
    return;
  }

  const [user] = await db
    .select({ balance: usersTable.balance, name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, session.userId));
  const walletBalance = parseFloat((user?.balance as string) ?? "0");
  const balanceStr = fmtRp(walletBalance);

  // No amount given — show nominal options
  const amount = amountStr ? parseAmount(amountStr) : null;
  if (!amount || amount < 10_000) {
    await send(
      `💰 *Top Up Saldo Wallet*\n\n` +
      `Saldo kamu: *${balanceStr}*\n\n` +
      `Ketik nominal top up:\n` +
      `• *4 50000* atau *topup 50000* → ${fmtRp(50_000)}\n` +
      `• *4 100000* → ${fmtRp(100_000)}\n` +
      `• *4 200000* → ${fmtRp(200_000)}\n` +
      `• *4 500000* → ${fmtRp(500_000)}\n` +
      `• *4 1000000* → ${fmtRp(1_000_000)}\n\n` +
      `Atau: *topup [nominal]* (min Rp 10.000)\n` +
      `Contoh: *topup 150000*\n\nKetik *menu* untuk kembali.`
    );
    if (amountStr) await send(`⚠️ Nominal minimal Rp 10.000.`);
    return;
  }

  // Create invoice
  const orderId = `TOPUP-${Date.now()}-${session.userId}`;
  const baseUrl = process.env.APP_URL ?? "http://localhost:8080";
  try {
    const checkout = await createCheckout({
      orderId,
      userId: session.userId,
      plan: "topup",
      amount,
      customerName: user?.name ?? session.userName ?? "User",
      customerEmail: user?.email ?? session.userEmail ?? "user@example.com",
      description: `Top-up saldo WA Gateway — ${fmtRp(amount)}`,
      callbackUrl: `${baseUrl}/api/billing/webhook`,
      returnUrl: `${baseUrl.replace(/:8080$/, "")}/billing`,
    });

    pendingOrders.set(orderId, {
      orderId,
      gateway: gatewayConfig.activeGateway,
      plan: "topup",
      amount,
      userId: session.userId,
      paymentUrl: checkout.paymentUrl,
      qrUrl: checkout.qrUrl,
      status: "pending",
      expiredAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      externalRef: checkout.externalRef,
      type: "topup",
    });

    await db.insert(walletTransactionsTable).values({
      userId: session.userId,
      amount: String(amount),
      type: "topup",
      status: "pending",
      orderId,
      description: `Top-up saldo ${fmtRp(amount)}`,
    });

    const invoiceText =
      `💳 *Invoice Top Up ${fmtRp(amount)}*\n\n` +
      `📋 ID Invoice: *${orderId}*\n` +
      `💰 Nominal: *${fmtRp(amount)}*\n` +
      `⏳ Berlaku: 24 jam\n\n` +
      (checkout.qrUrl
        ? `📲 *Scan QRIS di bawah ini untuk membayar.*\n`
        : `🔗 *Bayar via ${gwLabel()}:*\n${checkout.paymentUrl}\n\n`) +
      `Setelah bayar, saldo otomatis bertambah.\n` +
      `Ketik *cek bayar* untuk cek status pembayaran.\n\nKetik *menu* untuk kembali.`;

    await send(invoiceText);

    if (checkout.qrUrl) {
      try {
        await ctx.sendImage(
          checkout.qrUrl,
          `🏦 QRIS Top Up ${fmtRp(amount)}\nID: ${orderId}\nScan & bayar, saldo otomatis bertambah.`
        );
      } catch {
        await send(`🔗 *Bayar via ${gwLabel()}:*\n${checkout.paymentUrl}`);
      }
    }

    await updateSession(session.id, { pendingPlanSlug: orderId });
  } catch (err: any) {
    console.error("[WA Bot] Topup invoice error:", err?.message);
    await send(
      `❌ Gagal membuat invoice top up. Silakan coba lagi.\n\n` +
      `Atau top up langsung di dashboard: /billing\n\nKetik *menu* untuk kembali.`
    );
  }
}

async function handleLangganan(ctx: BotContext, planQuery: string): Promise<void> {
  const { session, send, settings } = ctx;
  if (!session.userId) {
    await send("⚠️ Kamu belum terhubung ke akun. Kirimkan *email* akun kamu terlebih dahulu.");
    return;
  }

  const plans = await db.select().from(plansTable).orderBy(plansTable.sortOrder, plansTable.id);
  const matched = plans.find(
    (p) => p.name.toLowerCase().includes(planQuery.toLowerCase()) || (p.slug ?? "").toLowerCase().includes(planQuery.toLowerCase())
  );

  if (!matched) {
    const names = plans.map((p) => `*${p.name}*`).join(", ");
    await send(`❌ Paket "${planQuery}" tidak ditemukan.\n\nPaket tersedia: ${names}\n\nKetik *paket* untuk detail harga.\nKetik *menu* untuk kembali.`);
    return;
  }

  const priceIdr = Number((matched as any).priceIdr ?? matched.price ?? 0);
  const planId = matched.slug ?? String(matched.id);

  // Free plan — activate directly
  if (priceIdr === 0) {
    await activatePlan(session.userId, { id: planId, name: matched.name });
    await updateSession(session.id, { userPlan: planId });
    await send(`✅ *Paket ${matched.name} berhasil diaktifkan!*\n\nPaket gratis aktif sekarang.\nKetik *cek* untuk melihat status.\nKetik *menu* untuk kembali.`);
    return;
  }

  // Check if already has different active paid plan
  const [existingSub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, session.userId!));
  const now = new Date();
  const hasActivePaid = existingSub && existingSub.status === "active" && existingSub.planId !== "free"
    && existingSub.currentPeriodEnd && existingSub.currentPeriodEnd > now;

  if (hasActivePaid && existingSub.planId !== planId) {
    await send(
      `⚠️ Kamu masih memiliki paket *${existingSub.planName}* aktif hingga ${fmtDate(existingSub.currentPeriodEnd)}.\n\n` +
      `Tidak bisa membeli paket lain sebelum masa paket berakhir.\n\n` +
      `Ketik *perpanjang* untuk memperpanjang paket saat ini.\nKetik *menu* untuk kembali.`
    );
    return;
  }

  // Check wallet balance
  const [userRow] = await db
    .select({ balance: usersTable.balance, name: usersTable.name, email: usersTable.email })
    .from(usersTable).where(eq(usersTable.id, session.userId!));
  const walletBalance = parseFloat((userRow?.balance as string) ?? "0");

  // Sufficient wallet balance → debit & activate directly
  if (walletBalance >= priceIdr) {
    await db.update(usersTable)
      .set({ balance: sql`${usersTable.balance} - ${String(priceIdr)}` })
      .where(eq(usersTable.id, session.userId!));
    const orderId = `SUB-WALLET-${Date.now()}-${session.userId}`;
    await db.insert(walletTransactionsTable).values({
      userId: session.userId!,
      amount: String(priceIdr),
      type: "manual_renew",
      status: "paid",
      orderId,
      planId,
      description: `Berlangganan ${matched.name}`,
    });
    await db.insert(transactionsTable).values({
      userId: session.userId!,
      amount: String(priceIdr),
      currency: "IDR",
      status: "paid",
      planName: matched.name,
      description: `${planId}|${orderId}`,
    });
    await activatePlan(session.userId!, { id: planId, name: matched.name });
    await updateSession(session.id, { userPlan: planId, pendingPlanSlug: null });
    const newBalance = walletBalance - priceIdr;
    await send(
      `✅ *Berhasil berlangganan ${matched.name}!*\n\n` +
      `💰 Dibayar dari wallet: *${fmtRp(priceIdr)}*\n` +
      `🏦 Saldo tersisa: *${fmtRp(newBalance)}*\n\n` +
      `Paket aktif 1 bulan ke depan.\n` +
      `Ketik *cek* untuk melihat status.\nKetik *menu* untuk kembali.`
    );
    return;
  }

  // Insufficient balance → create payment invoice
  const kekurangan = priceIdr - walletBalance;
  const orderId = `WAG-${Date.now()}-${session.userId}`;
  const baseUrl = process.env.APP_URL ?? "http://localhost:8080";
  try {
    const checkout = await createCheckout({
      orderId,
      userId: session.userId!,
      plan: planId,
      amount: priceIdr,
      customerName: userRow?.name ?? session.userName ?? "User",
      customerEmail: userRow?.email ?? session.userEmail ?? "user@example.com",
      description: `Paket ${matched.name} WA Gateway — 1 bulan`,
      callbackUrl: `${baseUrl}/api/billing/webhook`,
      returnUrl: `${baseUrl.replace(/:8080$/, "")}/billing?order=${orderId}`,
    });
    pendingOrders.set(orderId, {
      orderId,
      gateway: gatewayConfig.activeGateway,
      plan: planId,
      amount: priceIdr,
      userId: session.userId!,
      paymentUrl: checkout.paymentUrl,
      qrUrl: checkout.qrUrl,
      status: "pending",
      expiredAt: new Date(Date.now() + 24 * 3600 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      externalRef: checkout.externalRef,
    });
    await db.insert(transactionsTable).values({
      userId: session.userId!,
      amount: String(priceIdr),
      currency: "IDR",
      status: "pending",
      planName: matched.name,
      description: `${planId}|${orderId}`,
    });
    await updateSession(session.id, { pendingPlanSlug: orderId });

    const invoiceTextLangganan =
      `💳 *Invoice Berlangganan ${matched.name}*\n\n` +
      `💰 Harga: *${fmtRp(priceIdr)}/bulan*\n` +
      `🏦 Saldo wallet: *${fmtRp(walletBalance)}*${walletBalance > 0 ? ` (kurang ${fmtRp(kekurangan)})` : ""}\n` +
      `📋 ID Invoice: *${orderId}*\n` +
      `⏳ Berlaku: 24 jam\n\n` +
      (checkout.qrUrl
        ? `📲 *Scan QRIS di bawah ini untuk membayar.*\n`
        : `🔗 *Bayar via ${gwLabel()}:*\n${checkout.paymentUrl}\n\n`) +
      `Setelah bayar, paket otomatis aktif.\n` +
      `Ketik *cek bayar* untuk cek status pembayaran.\n\nKetik *menu* untuk kembali.`;

    await send(invoiceTextLangganan);

    if (checkout.qrUrl) {
      try {
        await ctx.sendImage(
          checkout.qrUrl,
          `📦 QRIS Berlangganan ${matched.name}\nID: ${orderId}\nScan & bayar, paket otomatis aktif.`
        );
      } catch {
        await send(`🔗 *Bayar via ${gwLabel()}:*\n${checkout.paymentUrl}`);
      }
    }
  } catch (err: any) {
    console.error("[WA Bot] Subscribe invoice error:", err?.message);
    await send(
      `❌ Gagal membuat invoice. Silakan coba lagi.\n\n` +
      `Atau top up saldo dulu: *topup ${priceIdr}*\n\nKetik *menu* untuk kembali.`
    );
  }
}

async function handleTiket(ctx: BotContext, masalah: string): Promise<void> {
  const { session, send } = ctx;
  if (!session.userId) {
    await send("⚠️ Kamu belum terhubung ke akun. Kirimkan *email* akun kamu terlebih dahulu.");
    return;
  }

  if (!masalah || masalah.trim().length < 5) {
    await send(
      `❓ *Cara Buat Tiket Support*\n\nKetik: *tiket [deskripsi masalah kamu]*\n\nContoh:\n_tiket Saya tidak bisa konek device WhatsApp_\n_tiket Pembayaran berhasil tapi paket belum aktif_\n\nKetik *menu* untuk kembali.`
    );
    return;
  }

  const code = genTicketCode();
  await db.insert(adminWaBotTicketsTable).values({
    ticketCode: code,
    phone: session.phone,
    userId: session.userId,
    userName: session.userName,
    userEmail: session.userEmail,
    message: masalah.trim(),
    status: "open",
  });

  await send(
    `🎫 *Tiket Support Dibuat!*\n\n` +
    `📋 Nomor tiket: *${code}*\n` +
    `📝 Masalah: ${masalah.trim()}\n` +
    `👤 Akun: ${session.userEmail}\n\n` +
    `Tim support kami akan segera menghubungi kamu melalui WhatsApp ini.\n\nSimpan nomor tiket kamu: *${code}*\n\nKetik *menu* untuk kembali.`
  );
}

async function handleCekBayar(ctx: BotContext, rawId: string): Promise<void> {
  const { session, send } = ctx;
  // Check pending orders in memory first
  const orderId = rawId.trim().toUpperCase();
  const orderLower = rawId.trim();
  const order = pendingOrders.get(orderId) ?? pendingOrders.get(orderLower) ?? pendingOrders.get(rawId.trim());

  if (order) {
    const isExpired = order.status === "pending" && new Date(order.expiredAt) < new Date();
    if (isExpired) { order.status = "expired"; pendingOrders.set(order.orderId, order); }
    const statusMap: Record<string, string> = { pending: "⏳ Menunggu Pembayaran", paid: "✅ Lunas", expired: "❌ Kadaluwarsa", failed: "❌ Gagal" };
    const typeLabel = order.type === "topup" ? "Top Up Saldo" : `Paket ${order.plan}`;
    let msg =
      `📋 *Status Invoice*\n\n` +
      `ID: *${order.orderId}*\n` +
      `Jenis: ${typeLabel}\n` +
      `Nominal: ${fmtRp(order.amount)}\n` +
      `Status: *${statusMap[order.status] ?? order.status}*\n`;
    if (order.status === "pending" && !isExpired) {
      msg += `\n🔗 *Link Bayar (masih aktif):*\n${order.paymentUrl}\n`;
      msg += `Berlaku hingga: ${new Date(order.expiredAt).toLocaleDateString("id-ID")}`;
    } else if (order.status === "paid") {
      msg += `\n✅ Pembayaran dikonfirmasi. Ketik *cek* untuk melihat status akun.`;
    } else {
      msg += `\nInvoice sudah tidak berlaku.\n`;
      msg += order.type === "topup" ? `Buat baru: *topup ${order.amount}*` : `Buat baru: *perpanjang*`;
    }
    await send(msg + `\n\nKetik *menu* untuk kembali.`);
    return;
  }

  // Check in DB (for paid historical orders)
  const [session_] = session.userId
    ? await db.select().from(transactionsTable)
        .where(and(
          eq(transactionsTable.userId, session.userId!),
          sql`${transactionsTable.description} ILIKE ${"%" + rawId.trim() + "%"}`
        )).limit(1)
    : [undefined];

  if (session_) {
    const statusLabel = session_.status === "paid" ? "✅ Lunas" : session_.status === "pending" ? "⏳ Menunggu" : "❌ Kadaluwarsa/Gagal";
    await send(
      `📋 *Status Invoice*\n\nID: *${rawId.trim()}*\nNominal: ${fmtRp(session_.amount)}\nStatus: *${statusLabel}*\n\n` +
      (session_.status === "paid" ? `Ketik *cek* untuk melihat status akun.` : `Invoice tidak ditemukan dalam memori aktif. Mungkin sudah kadaluwarsa.`) +
      `\n\nKetik *menu* untuk kembali.`
    );
    return;
  }

  // No order found — show last pending order if any
  if (session.pendingPlanSlug) {
    const lastOrder = pendingOrders.get(session.pendingPlanSlug);
    if (lastOrder) {
      const isExp = lastOrder.status === "pending" && new Date(lastOrder.expiredAt) < new Date();
      await send(
        `ℹ️ Invoice terakhir kamu:\n\n` +
        `ID: *${lastOrder.orderId}*\nNominal: ${fmtRp(lastOrder.amount)}\n` +
        `Status: *${isExp ? "❌ Kadaluwarsa" : lastOrder.status === "paid" ? "✅ Lunas" : "⏳ Menunggu"}*\n` +
        (!isExp && lastOrder.status === "pending" ? `\n🔗 *Link Bayar:*\n${lastOrder.paymentUrl}\n` : "") +
        `\nKetik *menu* untuk kembali.`
      );
      return;
    }
  }

  await send(`❌ Invoice *${rawId.trim()}* tidak ditemukan.\n\nPastikan ID invoice benar.\nKetik *riwayat* untuk melihat transaksi.\nKetik *menu* untuk kembali.`);
}

async function handleVoucher(ctx: BotContext, code: string): Promise<void> {
  const { session, send } = ctx;
  if (!session.userId) {
    await send("⚠️ Kamu belum terhubung ke akun. Kirimkan *email* akun kamu terlebih dahulu.");
    return;
  }

  code = code.toUpperCase().trim();
  if (!code) {
    await send(`🎟️ *Cara Pakai Voucher*\n\nKetik: *voucher [kode]*\nContoh: *voucher PROMO2025*\n\nKetik *menu* untuk kembali.`);
    return;
  }

  const [voucher] = await db.select().from(vouchersTable).where(eq(vouchersTable.code, code));
  if (!voucher || !voucher.isActive) {
    await send(`❌ Voucher *${code}* tidak valid atau sudah tidak aktif.\n\nKetik *menu* untuk kembali.`);
    return;
  }
  if (voucher.expiresAt && voucher.expiresAt < new Date()) {
    await send(`❌ Voucher *${code}* sudah kedaluwarsa.\n\nKetik *menu* untuk kembali.`);
    return;
  }
  if (voucher.maxUses !== -1 && voucher.usedCount >= voucher.maxUses) {
    await send(`❌ Voucher *${code}* sudah habis digunakan.\n\nKetik *menu* untuk kembali.`);
    return;
  }
  const [alreadyUsed] = await db.select().from(voucherUsagesTable)
    .where(and(eq(voucherUsagesTable.voucherId, voucher.id), eq(voucherUsagesTable.userId, session.userId!)));
  if (alreadyUsed) {
    await send(`❌ Kamu sudah menggunakan voucher *${code}* sebelumnya.\n\nKetik *menu* untuk kembali.`);
    return;
  }

  // Apply voucher — only plan-type supported via bot
  if (!voucher.planSlug) {
    await send(`❌ Jenis voucher ini tidak bisa digunakan lewat WA Bot.\nGunakan melalui dashboard billing.\n\nKetik *menu* untuk kembali.`);
    return;
  }

  const [plan] = await db.select().from(plansTable).where(eq(plansTable.slug, voucher.planSlug));
  if (!plan) {
    await send(`❌ Paket untuk voucher ini tidak ditemukan.\n\nKetik *menu* untuk kembali.`);
    return;
  }

  // Record usage
  await db.insert(voucherUsagesTable).values({ voucherId: voucher.id, userId: session.userId! });
  await db.update(vouchersTable)
    .set({ usedCount: sql`${vouchersTable.usedCount} + 1`, updatedAt: new Date() })
    .where(eq(vouchersTable.id, voucher.id));

  // Activate plan
  await activatePlan(session.userId!, { id: plan.slug ?? String(plan.id), name: plan.name });
  await updateSession(session.id, { userPlan: plan.slug ?? plan.name });

  await send(
    `🎉 *Voucher Berhasil Digunakan!*\n\n` +
    `🎟️ Kode: *${code}*\n` +
    `📦 Paket: *${plan.name}*\n` +
    (voucher.durationDays ? `📅 Durasi: ${voucher.durationDays} hari\n` : `📅 Aktif 1 bulan\n`) +
    `\nKetik *cek* untuk melihat status akun.\nKetik *menu* untuk kembali.`
  );
}

async function handleAwaitEmail(ctx: BotContext): Promise<void> {
  const { session, text, send, settings } = ctx;
  const email = text.trim().toLowerCase();
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRe.test(email)) {
    await send(`❌ Format email tidak valid.\n\nSilakan kirim ulang email akun kamu.\nContoh: _nama@email.com_`);
    return;
  }

  const [user] = await db
    .select({ id: usersTable.id, name: usersTable.name, email: usersTable.email, plan: usersTable.plan })
    .from(usersTable)
    .where(ilike(usersTable.email, email));

  if (!user) {
    await send(
      `❌ Email *${email}* tidak terdaftar di sistem kami.\n\nPastikan email sesuai dengan akun ${settings.appName} kamu.\n\n` +
      `Belum punya akun? Daftar di:\n👉 ${(process.env.APP_URL ?? "https://wagateway.app").replace(/:8080$/, "")}/auth/register`
    );
    return;
  }

  await updateSession(session.id, { userId: user.id, userEmail: user.email, userName: user.name, userPlan: user.plan, step: "idle" });

  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, user.id));
  const now = new Date();
  const isActive = sub?.status === "active" && sub.currentPeriodEnd && sub.currentPeriodEnd > now;
  const isTrial = sub?.status === "trial" && sub.currentPeriodEnd && sub.currentPeriodEnd > now;
  const planName = sub?.planName ?? "Free";

  await send(
    `✅ *Berhasil terhubung!*\n\nHalo *${user.name}*! 👋\n\n` +
    `📦 Paket aktif: *${planName}*\n` +
    ((isActive || isTrial) && sub?.currentPeriodEnd ? `📅 Berlaku hingga: ${fmtDate(sub.currentPeriodEnd)}\n` : `⚠️ Langganan tidak aktif\n`) +
    `\n` +
    buildMenuText(settings, "")
  );
}

function buildMenuText(settings: typeof adminWaBotSettingsTable.$inferSelect, greeting: string): string {
  const appName = settings.appName ?? "WA Gateway";
  return (
    greeting +
    `📋 *Menu ${appName}*\n\n` +
    `1️⃣ *cek* — Status akun & langganan\n` +
    `2️⃣ *paket* — Lihat & pilih paket\n` +
    `3️⃣ *perpanjang* — Perpanjang paket (saldo/invoice)\n` +
    `4️⃣ *topup* — Top up saldo wallet\n` +
    `5️⃣ *riwayat* — Riwayat transaksi\n` +
    `6️⃣ *cek bayar* — Cek status invoice\n` +
    `7️⃣ *voucher* — Gunakan kode voucher\n` +
    `8️⃣ *langganan* — Beli/pilih paket baru\n` +
    `9️⃣ *tiket* — Buat tiket support\n\n` +
    `💡 _Ketik angka *1–9* atau nama perintah di atas._`
  );
}

async function handleMenu(ctx: BotContext): Promise<void> {
  const { session, send, settings } = ctx;
  const greeting = session.userName ? `Halo *${session.userName}*! 👋\n\n` : "";
  const menuText = buildMenuText(settings, greeting);

  await send(menuText);
}

// ── Main processor ────────────────────────────────────────────────────────────

export async function processAdminBotMessage(
  deviceId: number,
  phone: string,
  text: string,
  sendReply: (text: string) => Promise<void>,
  sendList: (title: string, body: string, buttonText: string, sections: ListSection[]) => Promise<void>,
  sendImageFn?: (url: string, caption: string) => Promise<void>,
): Promise<boolean> {
  const settings = await getSettings();
  if (!settings || !settings.isEnabled || settings.deviceId !== deviceId) return false;

  const session = await getOrCreateSession(phone, settings);

  const defaultSendImage = async (url: string, caption: string) => {
    await sendReply(`🖼️ ${caption}\n🔗 ${url}`);
  };

  const ctx: BotContext = {
    settings,
    session,
    phone,
    text,
    send: sendReply,
    sendList,
    sendImage: sendImageFn ?? defaultSendImage,
  };
  const lower = text.trim().toLowerCase();

  // Log inbound message
  await logConv(phone, "in", text, session.userId, session.userName);

  const wrappedSend = async (msg: string) => {
    await sendReply(msg);
    await logConv(phone, "out", msg, session.userId, session.userName);
  };
  const wrappedList = async (title: string, body: string, btnText: string, sections: ListSection[]) => {
    await sendList(title, body, btnText, sections);
    await logConv(phone, "out", `[List: ${title}]`, session.userId, session.userName);
  };
  const wrappedImage = async (url: string, caption: string) => {
    await (sendImageFn ?? defaultSendImage)(url, caption);
    await logConv(phone, "out", `[Image: ${caption.slice(0, 60)}]`, session.userId, session.userName);
  };
  ctx.send = wrappedSend;
  ctx.sendList = wrappedList;
  ctx.sendImage = wrappedImage;

  // ── New or timed-out session ──────────────────────────────────────────────
  if (session.step === "await_email") {
    // If user explicitly asks for menu/help, show menu preview + login prompt
    const isMenuRequest = /^(menu|help|bantuan|\?|mulai|start)$/.test(lower);
    if (isMenuRequest) {
      const appName = settings.appName;
      const preview =
        `📋 *Menu ${appName}*\n\n` +
        `1️⃣ *cek* — Status akun & langganan\n` +
        `2️⃣ *paket* — Lihat & pilih paket\n` +
        `3️⃣ *perpanjang* — Perpanjang paket (saldo/invoice)\n` +
        `4️⃣ *topup* — Top up saldo wallet\n` +
        `5️⃣ *riwayat* — Riwayat transaksi\n` +
        `6️⃣ *cek bayar* — Cek status invoice\n` +
        `7️⃣ *voucher* — Gunakan kode voucher\n` +
        `8️⃣ *langganan* — Beli/pilih paket baru\n` +
        `9️⃣ *tiket* — Buat tiket support\n\n` +
        `💡 _Ketik angka *1–9* atau nama perintah._\n\n` +
        `🔐 Untuk menggunakan menu di atas, silakan *login* terlebih dahulu.\n` +
        `Kirimkan *email* akun kamu sekarang.\n\nContoh: nama@email.com`;
      await wrappedSend(preview);
      return true;
    }
    const isGreeting = /^(halo|hai|hi|hello|selamat|hei|hey|hy)/.test(lower);
    if (isGreeting) {
      const msg = expandSettings(settings.welcomeMessage, settings);
      await wrappedSend(msg);
      return true;
    }
    await handleAwaitEmail(ctx);
    return true;
  }

  // ── Linked session: handle commands ──────────────────────────────────────
  if (lower === "menu" || lower === "help" || lower === "bantuan" || lower === "?" || lower === "mulai" || lower === "start") {
    await handleMenu(ctx);
    return true;
  }

  // ── Shortcut angka 1–9 ────────────────────────────────────────────────────
  // Format: "3" atau "3 <arg>" misal "4 100000", "8 basic", "9 error login"
  const numMatch = lower.match(/^([1-9])(?:\s+(.+))?$/);
  if (numMatch) {
    const num = numMatch[1];
    const arg = numMatch[2]?.trim() ?? "";
    switch (num) {
      case "1": await handleCekAkun(ctx); return true;
      case "2": await handlePaket(ctx); return true;
      case "3": await handlePerpanjang(ctx); return true;
      case "4": await handleTopup(ctx, arg || undefined); return true;
      case "5": await handleRiwayat(ctx); return true;
      case "6": await handleCekBayar(ctx, arg || (session.pendingPlanSlug ?? "")); return true;
      case "7": await handleVoucher(ctx, arg); return true;
      case "8":
        if (arg) { await handleLangganan(ctx, arg); }
        else { await handlePaket(ctx); }
        return true;
      case "9": await handleTiket(ctx, arg); return true;
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  if (lower === "cek" || lower === "status" || lower === "akun" || lower === "info") {
    await handleCekAkun(ctx);
    return true;
  }
  if (lower === "paket" || lower === "harga" || lower === "daftar paket" || lower === "plans") {
    await handlePaket(ctx);
    return true;
  }
  if (lower === "perpanjang" || lower === "renew" || lower === "extend") {
    await handlePerpanjang(ctx);
    return true;
  }
  if (lower === "riwayat" || lower === "history" || lower === "transaksi") {
    await handleRiwayat(ctx);
    return true;
  }
  if (lower === "topup" || lower === "top up" || lower === "isi saldo" || lower === "saldo") {
    await handleTopup(ctx, undefined);
    return true;
  }
  if (lower.startsWith("topup ") || lower.startsWith("top up ")) {
    const amountStr = text.trim().replace(/^top\s*up\s+/i, "").replace(/^topup\s+/i, "");
    await handleTopup(ctx, amountStr);
    return true;
  }
  if (lower === "cek bayar" || lower === "cek pembayaran" || lower === "status bayar") {
    await handleCekBayar(ctx, session.pendingPlanSlug ?? "");
    return true;
  }
  if (lower.startsWith("cek bayar ") || lower.startsWith("cek pembayaran ")) {
    const invoiceId = text.trim().replace(/^cek\s+(bayar|pembayaran)\s+/i, "");
    await handleCekBayar(ctx, invoiceId);
    return true;
  }
  if (lower === "voucher" || lower === "kode voucher" || lower === "redeem") {
    await handleVoucher(ctx, "");
    return true;
  }
  if (lower.startsWith("voucher ") || lower.startsWith("kode ") || lower.startsWith("redeem ")) {
    const code = text.trim().replace(/^(voucher|kode|redeem)\s+/i, "");
    await handleVoucher(ctx, code);
    return true;
  }
  if (lower.startsWith("langganan ") || lower.startsWith("beli ") || lower.startsWith("subscribe ")) {
    const planQuery = text.trim().replace(/^(langganan|beli|subscribe)\s+/i, "");
    await handleLangganan(ctx, planQuery);
    return true;
  }
  if (lower.startsWith("tiket") || lower.startsWith("ticket") || lower.startsWith("lapor")) {
    const masalah = text.trim().replace(/^(tiket|ticket|lapor)\s*/i, "");
    await handleTiket(ctx, masalah);
    return true;
  }
  if (lower === "logout" || lower === "keluar" || lower === "ganti akun") {
    await updateSession(session.id, { userId: null, userEmail: null, userName: null, userPlan: null, step: "await_email" });
    const msg = `👋 Akun berhasil di-_unlink_.\n\n` + expandSettings(settings.welcomeMessage, settings);
    await wrappedSend(msg);
    return true;
  }

  // ── Greeting from linked user ─────────────────────────────────────────────
  const isGreeting = /^(halo|hai|hi|hello|selamat|hei|hey|hy)/.test(lower);
  if (isGreeting) {
    await handleMenu(ctx);
    return true;
  }

  // ── Unknown command ───────────────────────────────────────────────────────
  await wrappedSend(`❓ Perintah tidak dikenal.\n\n` + buildMenuText(settings, ""));
  return true;
}

// ── Check if a device is the admin WA Center device ──────────────────────────

export async function isAdminBotDevice(deviceId: number): Promise<boolean> {
  const [row] = await db
    .select({ deviceId: adminWaBotSettingsTable.deviceId, isEnabled: adminWaBotSettingsTable.isEnabled })
    .from(adminWaBotSettingsTable)
    .limit(1);
  return !!(row?.isEnabled && row.deviceId === deviceId);
}

// ── Onboarding: send WA message to new user ───────────────────────────────────

export async function sendOnboardingMessage(userName: string, userEmail: string): Promise<void> {
  try {
    const settings = await getSettings();
    if (!settings || !settings.isEnabled || !settings.onboardingEnabled || !settings.deviceId) return;

    // Find WA session linked to this email
    const [session] = await db
      .select()
      .from(adminWaBotSessionsTable)
      .where(ilike(adminWaBotSessionsTable.userEmail, userEmail));
    if (!session) return; // User hasn't chatted yet, can't send

    const msg = expand(settings.onboardingMessage, { appName: settings.appName, userName, userEmail });
    await sendMessageToPhone(settings.deviceId, session.phone, msg);
  } catch (err) {
    console.error("[WA Bot] Onboarding error:", err);
  }
}

// ── Reminder cron: check expiring subscriptions ───────────────────────────────

export function startReminderCron(): void {
  const CHECK_INTERVAL_MS = 60 * 60 * 1000; // every 1 hour
  setInterval(async () => {
    try {
      await runReminderCheck();
    } catch (err) {
      console.error("[WA Bot] Reminder cron error:", err);
    }
  }, CHECK_INTERVAL_MS);
  // Run once on startup after a short delay
  setTimeout(() => runReminderCheck().catch(() => {}), 10_000);
}

async function runReminderCheck(): Promise<void> {
  const settings = await getSettings();
  if (!settings || !settings.isEnabled || !settings.reminderEnabled || !settings.deviceId) return;

  const daysList = settings.reminderDaysBefore
    .split(",")
    .map((d) => parseInt(d.trim(), 10))
    .filter((d) => !isNaN(d) && d > 0);

  for (const days of daysList) {
    const windowStart = new Date();
    windowStart.setDate(windowStart.getDate() + days);
    windowStart.setHours(0, 0, 0, 0);
    const windowEnd = new Date(windowStart);
    windowEnd.setHours(23, 59, 59, 999);

    const expiringSubs = await db
      .select({
        userId: subscriptionsTable.userId,
        planName: subscriptionsTable.planName,
        currentPeriodEnd: subscriptionsTable.currentPeriodEnd,
      })
      .from(subscriptionsTable)
      .where(
        and(
          eq(subscriptionsTable.status, "active"),
          gte(subscriptionsTable.currentPeriodEnd, windowStart),
          lte(subscriptionsTable.currentPeriodEnd, windowEnd),
        )
      );

    for (const sub of expiringSubs) {
      if (!sub.userId) continue;
      const [user] = await db.select({ name: usersTable.name, email: usersTable.email }).from(usersTable).where(eq(usersTable.id, sub.userId));
      if (!user) continue;

      // Find linked WA session
      const [session] = await db
        .select({ phone: adminWaBotSessionsTable.phone })
        .from(adminWaBotSessionsTable)
        .where(and(eq(adminWaBotSessionsTable.userId, sub.userId), isNotNull(adminWaBotSessionsTable.userId)));
      if (!session) continue;

      const msg = expand(settings.reminderMessage, {
        appName: settings.appName,
        userName: user.name,
        planName: sub.planName ?? "—",
        expiry: fmtDate(sub.currentPeriodEnd),
        daysLeft: days.toString(),
      });

      await sendMessageToPhone(settings.deviceId, session.phone, msg);
      await logConv(session.phone, "out", msg, sub.userId);
    }
  }
}

// ── Broadcast: send message to all linked sessions ───────────────────────────

export async function sendBroadcast(broadcastId: number): Promise<void> {
  const [broadcast] = await db.select().from(adminWaBotBroadcastsTable).where(eq(adminWaBotBroadcastsTable.id, broadcastId));
  if (!broadcast) return;

  const settings = await getSettings();
  if (!settings?.deviceId) {
    await db.update(adminWaBotBroadcastsTable).set({ status: "failed" }).where(eq(adminWaBotBroadcastsTable.id, broadcastId));
    return;
  }

  const linkedSessions = await db
    .select({ phone: adminWaBotSessionsTable.phone, userId: adminWaBotSessionsTable.userId, userName: adminWaBotSessionsTable.userName })
    .from(adminWaBotSessionsTable)
    .where(isNotNull(adminWaBotSessionsTable.userId));

  await db.update(adminWaBotBroadcastsTable).set({ status: "sending", targetCount: linkedSessions.length, sentAt: new Date() }).where(eq(adminWaBotBroadcastsTable.id, broadcastId));

  let sentCount = 0;
  let failCount = 0;

  for (const session of linkedSessions) {
    try {
      await sendMessageToPhone(settings.deviceId, session.phone, broadcast.message);
      await logConv(session.phone, "out", `[Broadcast] ${broadcast.message}`, session.userId, session.userName);
      sentCount++;
      await new Promise((r) => setTimeout(r, 500)); // rate limit
    } catch {
      failCount++;
    }
  }

  await db.update(adminWaBotBroadcastsTable)
    .set({ status: "sent", sentCount, failCount })
    .where(eq(adminWaBotBroadcastsTable.id, broadcastId));
}

// ── Internal: send WA message to phone via active device socket ───────────────

async function sendMessageToPhone(deviceId: number, phone: string, text: string): Promise<void> {
  const jid = phone.replace(/\D/g, "") + "@s.whatsapp.net";
  const sock = getDeviceSocket(deviceId);
  if (!sock) throw new Error(`No active socket for device ${deviceId}`);
  await (sock as any).sendMessage(jid, { text });
}
