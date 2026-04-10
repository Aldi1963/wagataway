/**
 * Payment Gateway Module
 * Supports: Pakasir, Midtrans, Xendit, Tokopay, Tripay
 * Config persisted to DB (settingsTable key: "payment_gateway_config")
 */
import { Router, type IRouter } from "express";
import crypto from "crypto";
import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const router: IRouter = Router();

const DB_KEY = "payment_gateway_config";

// ── Gateway config ────────────────────────────────────────────────────────────

export interface GatewayConfig {
  activeGateway: "pakasir" | "midtrans" | "xendit" | "tokopay" | "tripay" | "none";
  pakasir:  { merchantId: string; apiKey: string; mode: "sandbox" | "production" };
  midtrans: { serverKey: string; clientKey: string; mode: "sandbox" | "production" };
  xendit:   { secretKey: string; mode: "sandbox" | "production" };
  tokopay:  { merchantId: string; secret: string; mode: "sandbox" | "production" };
  tripay:   { apiKey: string; privateKey: string; merchantCode: string; mode: "sandbox" | "production" };
}

export let gatewayConfig: GatewayConfig = {
  activeGateway: "none",
  pakasir:  { merchantId: "", apiKey: "",  mode: "sandbox" },
  midtrans: { serverKey: "", clientKey: "", mode: "sandbox" },
  xendit:   { secretKey: "", mode: "sandbox" },
  tokopay:  { merchantId: "", secret: "", mode: "sandbox" },
  tripay:   { apiKey: "", privateKey: "", merchantCode: "", mode: "sandbox" },
};

// ── Load config from DB on startup ───────────────────────────────────────────

export async function loadGatewayConfig(): Promise<void> {
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, DB_KEY));
    if (row?.value) {
      const parsed = JSON.parse(row.value) as Partial<GatewayConfig>;
      gatewayConfig = { ...gatewayConfig, ...parsed };
    }
  } catch {
    // DB not ready yet — use defaults
  }
}

async function persistGatewayConfig(): Promise<void> {
  const value = JSON.stringify(gatewayConfig);
  const existing = await db.select({ id: settingsTable.id }).from(settingsTable).where(eq(settingsTable.key, DB_KEY));
  if (existing.length > 0) {
    await db.update(settingsTable).set({ value }).where(eq(settingsTable.key, DB_KEY));
  } else {
    await db.insert(settingsTable).values({ key: DB_KEY, value });
  }
}

// ── In-memory pending orders ─────────────────────────────────────────────────

export interface PendingOrder {
  orderId: string;
  gateway: string;
  plan: string;
  amount: number;
  userId: number;
  paymentUrl: string;
  qrUrl?: string;
  status: "pending" | "paid" | "expired" | "failed";
  expiredAt: string;
  createdAt: string;
  externalRef?: string;
  type?: "plan" | "topup"; // default: "plan"
}

export const pendingOrders = new Map<string, PendingOrder>();

// ── Admin: GET payment gateway config ────────────────────────────────────────

router.get("/admin/payment-gateway", (_req, res): void => {
  const safe: any = {
    activeGateway: gatewayConfig.activeGateway,
    pakasir:  { ...gatewayConfig.pakasir,  apiKey: mask(gatewayConfig.pakasir.apiKey) },
    midtrans: { ...gatewayConfig.midtrans, serverKey: mask(gatewayConfig.midtrans.serverKey) },
    xendit:   { ...gatewayConfig.xendit,   secretKey: mask(gatewayConfig.xendit.secretKey) },
    tokopay:  { ...gatewayConfig.tokopay,  secret: mask(gatewayConfig.tokopay.secret) },
    tripay:   { ...gatewayConfig.tripay,   apiKey: mask(gatewayConfig.tripay.apiKey), privateKey: mask(gatewayConfig.tripay.privateKey) },
  };
  res.json(safe);
});

// ── Admin: PUT payment gateway config ────────────────────────────────────────

router.put("/admin/payment-gateway", async (req, res): Promise<void> => {
  const b = req.body as Partial<GatewayConfig>;

  if (b.activeGateway !== undefined) gatewayConfig.activeGateway = b.activeGateway;

  if (b.pakasir) {
    const p = b.pakasir;
    if (typeof p.merchantId === "string") gatewayConfig.pakasir.merchantId = p.merchantId;
    if (typeof p.apiKey === "string" && !p.apiKey.includes("*")) gatewayConfig.pakasir.apiKey = p.apiKey;
    if (p.mode) gatewayConfig.pakasir.mode = p.mode;
  }
  if (b.midtrans) {
    const m = b.midtrans;
    if (typeof m.serverKey === "string" && !m.serverKey.includes("*")) gatewayConfig.midtrans.serverKey = m.serverKey;
    if (typeof m.clientKey === "string") gatewayConfig.midtrans.clientKey = m.clientKey;
    if (m.mode) gatewayConfig.midtrans.mode = m.mode;
  }
  if (b.xendit) {
    const x = b.xendit;
    if (typeof x.secretKey === "string" && !x.secretKey.includes("*")) gatewayConfig.xendit.secretKey = x.secretKey;
    if (x.mode) gatewayConfig.xendit.mode = x.mode;
  }
  if (b.tokopay) {
    const t = b.tokopay;
    if (typeof t.merchantId === "string") gatewayConfig.tokopay.merchantId = t.merchantId;
    if (typeof t.secret === "string" && !t.secret.includes("*")) gatewayConfig.tokopay.secret = t.secret;
    if (t.mode) gatewayConfig.tokopay.mode = t.mode;
  }
  if (b.tripay) {
    const t = b.tripay;
    if (typeof t.apiKey === "string" && !t.apiKey.includes("*")) gatewayConfig.tripay.apiKey = t.apiKey;
    if (typeof t.privateKey === "string" && !t.privateKey.includes("*")) gatewayConfig.tripay.privateKey = t.privateKey;
    if (typeof t.merchantCode === "string") gatewayConfig.tripay.merchantCode = t.merchantCode;
    if (t.mode) gatewayConfig.tripay.mode = t.mode;
  }

  await persistGatewayConfig();
  res.json({ success: true, activeGateway: gatewayConfig.activeGateway });
});

// ── Admin: Test gateway connection ───────────────────────────────────────────

router.post("/admin/payment-gateway/test", async (req, res): Promise<void> => {
  const { gateway } = req.body as { gateway: string };
  const gw = gateway || gatewayConfig.activeGateway;

  if (gw === "none") {
    res.status(400).json({ success: false, message: "Tidak ada gateway yang dipilih" });
    return;
  }

  try {
    const result = await testGatewayConnection(gw as any);
    res.json(result);
  } catch (err: any) {
    res.json({ success: false, message: err.message ?? "Koneksi gagal" });
  }
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function mask(s: string): string {
  if (!s || s.length < 6) return s;
  return s.slice(0, 4) + "****" + s.slice(-4);
}

async function testGatewayConnection(gw: "pakasir" | "midtrans" | "xendit" | "tokopay" | "tripay") {
  switch (gw) {
    case "pakasir": {
      const cfg = gatewayConfig.pakasir;
      if (!cfg.apiKey || !cfg.merchantId) throw new Error("Pakasir: Slug Proyek / API Key belum diisi");
      const url = `https://app.pakasir.com/api/transactiondetail?project=${encodeURIComponent(cfg.merchantId)}&amount=1000&order_id=test-connection&api_key=${encodeURIComponent(cfg.apiKey)}`;
      const r = await fetch(url);
      const data = await r.json() as any;
      if (data !== undefined) return { success: true, message: "Koneksi Pakasir berhasil ✓", gateway: "pakasir" };
      throw new Error("Pakasir: Tidak ada respons dari server");
    }
    case "midtrans": {
      const cfg = gatewayConfig.midtrans;
      if (!cfg.serverKey) throw new Error("Midtrans: Server Key belum diisi");
      const base = cfg.mode === "production" ? "https://api.midtrans.com" : "https://api.sandbox.midtrans.com";
      const auth = Buffer.from(cfg.serverKey + ":").toString("base64");
      const r = await fetch(`${base}/v2/payment-methods`, { headers: { "Authorization": `Basic ${auth}` } });
      if (!r.ok) throw new Error(`Midtrans: HTTP ${r.status}`);
      return { success: true, message: "Koneksi Midtrans berhasil ✓", gateway: "midtrans" };
    }
    case "xendit": {
      const cfg = gatewayConfig.xendit;
      if (!cfg.secretKey) throw new Error("Xendit: Secret Key belum diisi");
      const auth = Buffer.from(cfg.secretKey + ":").toString("base64");
      const r = await fetch("https://api.xendit.co/balance", { headers: { "Authorization": `Basic ${auth}` } });
      if (!r.ok) throw new Error(`Xendit: HTTP ${r.status} — cek Secret Key`);
      return { success: true, message: "Koneksi Xendit berhasil ✓", gateway: "xendit" };
    }
    case "tokopay": {
      const cfg = gatewayConfig.tokopay;
      if (!cfg.merchantId || !cfg.secret) throw new Error("Tokopay: Merchant ID / Secret belum diisi");
      return { success: true, message: "Tokopay: kredensial terisi ✓", gateway: "tokopay" };
    }
    case "tripay": {
      const cfg = gatewayConfig.tripay;
      if (!cfg.apiKey) throw new Error("Tripay: API Key belum diisi");
      const base = cfg.mode === "production" ? "https://tripay.co.id/api" : "https://tripay.co.id/api-sandbox";
      const r = await fetch(`${base}/merchant/payment-channel`, { headers: { "Authorization": `Bearer ${cfg.apiKey}` } });
      if (!r.ok) throw new Error(`Tripay: HTTP ${r.status}`);
      return { success: true, message: "Koneksi Tripay berhasil ✓", gateway: "tripay" };
    }
  }
}

// ── Create checkout (called by billing.ts) ───────────────────────────────────

export async function createCheckout(params: {
  orderId: string;
  userId: number;
  plan: string;
  amount: number;
  customerName: string;
  customerEmail: string;
  description: string;
  callbackUrl: string;
  returnUrl: string;
}): Promise<{ paymentUrl: string; qrUrl?: string; externalRef?: string }> {
  const gw = gatewayConfig.activeGateway;

  if (gw === "none") {
    return { paymentUrl: `https://demo-payment.example.com/pay/${params.orderId}?amount=${params.amount}` };
  }

  switch (gw) {
    case "pakasir":   return createPakasirInvoice(params);
    case "midtrans":  return createMidtransInvoice(params);
    case "xendit":    return createXenditInvoice(params);
    case "tokopay":   return createTokopayInvoice(params);
    case "tripay":    return createTripayInvoice(params);
    default:
      return { paymentUrl: `https://demo-payment.example.com/pay/${params.orderId}` };
  }
}

// ── Pakasir ───────────────────────────────────────────────────────────────────

async function createPakasirInvoice(p: Parameters<typeof createCheckout>[0]) {
  const cfg = gatewayConfig.pakasir;

  const paymentUrl = `https://app.pakasir.com/pay/${encodeURIComponent(cfg.merchantId)}/${p.amount}`
    + `?order_id=${encodeURIComponent(p.orderId)}`
    + `&redirect=${encodeURIComponent(p.returnUrl)}`;

  let qrUrl: string | undefined;
  try {
    const body = { project: cfg.merchantId, order_id: p.orderId, amount: p.amount, api_key: cfg.apiKey };
    const r = await fetch("https://app.pakasir.com/api/transactioncreate/qris", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await r.json() as any;
    if (data?.payment?.payment_number) {
      qrUrl = `https://api.qrserver.com/v1/create-qr-code/?data=${encodeURIComponent(data.payment.payment_number)}&size=250x250&margin=10`;
    }
  } catch { }

  return { paymentUrl, qrUrl, externalRef: p.orderId };
}

// ── Midtrans ──────────────────────────────────────────────────────────────────

async function createMidtransInvoice(p: Parameters<typeof createCheckout>[0]) {
  const cfg = gatewayConfig.midtrans;
  const base = cfg.mode === "production"
    ? "https://app.midtrans.com/snap/v1/transactions"
    : "https://app.sandbox.midtrans.com/snap/v1/transactions";
  const auth = Buffer.from(cfg.serverKey + ":").toString("base64");

  const body = {
    transaction_details: { order_id: p.orderId, gross_amount: p.amount },
    customer_details: { first_name: p.customerName, email: p.customerEmail },
    callbacks: { finish: p.returnUrl, notification: p.callbackUrl },
    item_details: [{ id: p.plan, price: p.amount, quantity: 1, name: p.description }],
  };

  const r = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Basic ${auth}`, "Accept": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json() as any;
  if (!r.ok) throw new Error(data.error_messages?.join(", ") ?? `Midtrans error ${r.status}`);
  return { paymentUrl: data.redirect_url, externalRef: data.token };
}

// ── Xendit ────────────────────────────────────────────────────────────────────
// Docs: https://developers.xendit.co/api-reference/#create-invoice

async function createXenditInvoice(p: Parameters<typeof createCheckout>[0]) {
  const cfg = gatewayConfig.xendit;
  const auth = Buffer.from(cfg.secretKey + ":").toString("base64");

  const body = {
    external_id: p.orderId,
    amount: p.amount,
    payer_email: p.customerEmail,
    description: p.description,
    success_redirect_url: p.returnUrl,
    failure_redirect_url: p.returnUrl,
    currency: "IDR",
    customer: { given_names: p.customerName, email: p.customerEmail },
    items: [{ name: p.description, quantity: 1, price: p.amount }],
  };

  const r = await fetch("https://api.xendit.co/v2/invoices", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Basic ${auth}`,
    },
    body: JSON.stringify(body),
  });
  const data = await r.json() as any;
  if (!r.ok) throw new Error(data.message ?? `Xendit error ${r.status}`);
  return { paymentUrl: data.invoice_url, externalRef: data.id };
}

// ── Tokopay ───────────────────────────────────────────────────────────────────

async function createTokopayInvoice(p: Parameters<typeof createCheckout>[0]) {
  const cfg = gatewayConfig.tokopay;
  const base = "https://api.tokopay.id";

  const sign = crypto.createHmac("sha256", cfg.secret)
    .update(`${cfg.merchantId}${p.orderId}${p.amount}`)
    .digest("hex");

  const body = {
    ref_id: p.orderId,
    nominal: p.amount,
    metode: "QRIS",
    keterangan: p.description,
    signature: sign,
  };

  const r = await fetch(`${base}/order`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.merchantId}:${cfg.secret}` },
    body: JSON.stringify(body),
  });
  const data = await r.json() as any;
  if (!r.ok || data.status !== "success") throw new Error(data.message ?? `Tokopay error ${r.status}`);
  return { paymentUrl: data.data?.checkout_url ?? data.data?.payment_url, qrUrl: data.data?.qr_url, externalRef: data.data?.uuid };
}

// ── Tripay ────────────────────────────────────────────────────────────────────

async function createTripayInvoice(p: Parameters<typeof createCheckout>[0]) {
  const cfg = gatewayConfig.tripay;
  const base = cfg.mode === "production"
    ? "https://tripay.co.id/api/transaction/create"
    : "https://tripay.co.id/api-sandbox/transaction/create";

  const sign = crypto.createHmac("sha256", cfg.privateKey)
    .update(`${cfg.merchantCode}${p.orderId}${p.amount}`)
    .digest("hex");

  const body = {
    method: "QRIS",
    merchant_ref: p.orderId,
    amount: p.amount,
    customer_name: p.customerName,
    customer_email: p.customerEmail,
    order_items: [{ name: p.description, price: p.amount, quantity: 1 }],
    callback_url: p.callbackUrl,
    return_url: p.returnUrl,
    expired_time: Math.floor(Date.now() / 1000) + 24 * 3600,
    signature: sign,
  };

  const r = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Authorization": `Bearer ${cfg.apiKey}` },
    body: JSON.stringify(body),
  });
  const data = await r.json() as any;
  if (!data.success) throw new Error(data.message ?? `Tripay error ${r.status}`);
  return { paymentUrl: data.data?.checkout_url, qrUrl: data.data?.qr_url, externalRef: data.data?.reference };
}

export default router;
