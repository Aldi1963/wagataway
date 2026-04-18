/**
 * Public API Layer — endpoint dengan api_key parameter
 * Format: POST/GET /api/send-message?api_key=...&sender=...&number=...
 * Sesuai dengan dokumentasi di ApiDocs.tsx
 */

import { Router, type Request, type Response, type NextFunction } from "express";
import { db, apiKeysTable, devicesTable, messagesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getSession } from "../lib/wa-manager";
import { getUserPlan, countTodayMessages } from "../lib/plan-limits";
import { sendWithAntiBanned } from "../lib/anti-banned";
import { proto, generateMessageIDV2 } from "@whiskeysockets/baileys";
import { sendOfficialMessage, formatOfficialInteractive } from "../lib/official-api";
import { validateSafeUrl } from "../lib/security";
import crypto from "crypto";

const router = Router();

/* ── Helpers ──────────────────────────────────────────────────────────────── */

function ok(res: Response, data: object | null = null, message = "Success") {
  return res.json({ status: true, message, ...(data ? { data } : {}) });
}

function fail(res: Response, message: string, code = 400) {
  return res.status(code).json({ status: false, message });
}

/** Merge query + body (GET & POST both supported) */
function params(req: Request): Record<string, any> {
  return { ...req.query, ...req.body };
}

/**
 * Extract api_key from multiple sources (priority order):
 * 1. ?api_key= query param or JSON body (legacy / docs format)
 * 2. X-API-Key header
 * 3. Authorization: Bearer <wag_key> header (only if key starts with "wag_")
 */
function extractApiKey(req: Request): string | null {
  const p = params(req);
  if (p.api_key) return p.api_key as string;
  if (req.headers["x-api-key"]) return req.headers["x-api-key"] as string;
  const authHeader = req.headers["authorization"] ?? "";
  if (authHeader.startsWith("Bearer ")) {
    const candidate = authHeader.slice(7);
    if (candidate.startsWith("wag_")) return candidate;
  }
  return null;
}

/** Validate api_key and return { userId } */
async function resolveAuth(req: Request, res: Response): Promise<{ userId: number } | null> {
  const apiKey = extractApiKey(req);

  if (!apiKey) {
    fail(res, "Parameter api_key diperlukan", 401);
    return null;
  }

  const [row] = await db
    .select({ userId: apiKeysTable.userId, id: apiKeysTable.id })
    .from(apiKeysTable)
    .where(eq(apiKeysTable.key, apiKey));

  if (!row) {
    fail(res, "api_key tidak valid atau sudah dihapus", 401);
    return null;
  }

  // Update lastUsed
  db.update(apiKeysTable)
    .set({ lastUsed: new Date() })
    .where(eq(apiKeysTable.id, row.id))
    .catch(() => {});

  return { userId: row.userId };
}

/** Find device by sender phone for a user */
async function resolveDevice(userId: number, sender: string, res: Response) {
  if (!sender) {
    fail(res, "Parameter sender diperlukan (nomor perangkat pengirim)", 400);
    return null;
  }

  // Normalize: strip all non-digits so "+6285702489766" == "6285702489766"
  const clean = sender.replace(/\D/g, "");
  const [device] = await db
    .select()
    .from(devicesTable)
    .where(and(
      eq(devicesTable.userId, userId),
      sql`REPLACE(${devicesTable.phone}, '+', '') = ${clean}`
    ));

  if (!device) {
    fail(res, `Perangkat dengan nomor ${sender} tidak ditemukan`, 404);
    return null;
  }

  return device;
}

/** Check daily quota */
async function checkQuota(userId: number, res: Response): Promise<boolean> {
  const [plan, today] = await Promise.all([getUserPlan(userId), countTodayMessages(userId)]);
  if (plan.limitMessagesPerDay !== -1 && today >= plan.limitMessagesPerDay) {
    fail(res, `Kuota pesan harian habis (${today}/${plan.limitMessagesPerDay}). Upgrade plan Anda.`, 429);
    return false;
  }
  return true;
}

/** Record sent message to DB */
async function recordMessage(userId: number, deviceId: number, phone: string, message: string, mediaUrl?: string, messageType?: string, jobId?: number) {
  const [msg] = await db.insert(messagesTable).values({
    userId,
    deviceId: deviceId!,
    phone: phone,
    message,
    mediaUrl: mediaUrl ?? null,
    messageType: mediaUrl ? (messageType ?? "image") : "text",
    status: "sent",
    bulkJobId: jobId,
  })
    .returning();
  return msg;
}

/* ── Auth middleware: attach userId to req ──────────────────────────────── */
async function apiKeyAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  (req as any).apiUserId = auth.userId;
  next();
}

/* ═══════════════════════════════════════════════════════════════════════════
   PESAN — Send Message
   ══════════════════════════════════════════════════════════════════════════ */

/** POST/GET /send-message */
async function sendMessageHandler(req: Request, res: Response): Promise<void> {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender, number, message } = params(req);

  if (!number || !message) { fail(res, "Parameter number dan message diperlukan"); return; }
  if (!await checkQuota(auth.userId, res)) return;

  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;

  const phone = String(number).replace(/\D/g, "");

  // ── Official API Branch ──────────────────────────────────────────────────
  if (device.provider === "official") {
    try {
      const response: any = await sendOfficialMessage({
        accessToken: device.officialAccessToken!,
        phoneId: device.officialPhoneId!,
        to: phone,
        message: { type: "text", text: { body: String(message) } }
      });
      const msg = await recordMessage(auth.userId, device.id, phone, String(message));
      await db.update(devicesTable).set({ messagesSent: sql`${devicesTable.messagesSent} + 1` }).where(eq(devicesTable.id, device.id));
      ok(res, { id: msg ? String(msg.id) : "0", number: phone, status: "sent", externalId: response.messages?.[0]?.id }, "Message sent via Official API");
      return;
    } catch (e: any) {
      fail(res, `Official API Error: ${e.message}`, 500);
      return;
    }
  }

  const session = getSession(device.id);

  if (session?.socket && session.status === "connected") {
    const jid = `${phone}@s.whatsapp.net`;
    try {
      if (device.antiBannedEnabled) {
        await sendWithAntiBanned({
          socket: session.socket, jid, message: String(message),
          minDelay: 0, maxDelay: 0,
          typingSimulation: device.typingSimulation,
          typingDuration: device.typingDuration,
          applyDelay: false,
        });
      } else {
        await session.socket.sendMessage(jid, { text: String(message) });
      }
    } catch (e: any) {
      fail(res, `Gagal mengirim pesan: ${e.message}`, 500); return;
    }
  }

  const msg = await recordMessage(auth.userId, device.id, phone, String(message));
  ok(res, { id: String(msg.id), number: phone, status: "sent", createdAt: msg.createdAt?.toISOString() }, "Message sent successfully");
}

router.post("/send-message", sendMessageHandler);
router.get("/send-message", sendMessageHandler);

/* ─────────────────────────────────────────────────────────────────────────
   Send Media
   ───────────────────────────────────────────────────────────────────────── */

async function sendMediaHandler(req: Request, res: Response): Promise<void> {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender, number, url, caption = "", type = "image" } = params(req);

  if (!number || !url) { fail(res, "Parameter number dan url diperlukan"); return; }
  
  // ── SSRF Protection ──────────────────────────────────────────────────────
  if (!(await validateSafeUrl(String(url)))) {
    fail(res, "URL tidak aman atau tidak valid", 400);
    return;
  }

  if (!await checkQuota(auth.userId, res)) return;

  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;

  const phone = String(number).replace(/\D/g, "");

  // ── Official API Branch ──────────────────────────────────────────────────
  if (device.provider === "official") {
    try {
      const mediaType = (String(type) || "image").toLowerCase() as any;
      const response = await sendOfficialMessage({
        accessToken: device.officialAccessToken!,
        phoneId: device.officialPhoneId!,
        to: phone,
        message: { [mediaType]: { link: String(url), caption: String(caption) }, type: mediaType }
      });
      const msg = await recordMessage(auth.userId, device.id, phone, caption ? String(caption) : "[media]", String(url));
      await db.update(devicesTable).set({ messagesSent: sql`${devicesTable.messagesSent} + 1` }).where(eq(devicesTable.id, device.id));
      ok(res, { id: String(msg.id), number: phone, status: "sent", externalId: response.messages?.[0]?.id }, "Media sent via Official API");
      return;
    } catch (e: any) {
      fail(res, `Official API Error: ${e.message}`, 500);
      return;
    }
  }

  const session = getSession(device.id);

  if (session?.socket && session.status === "connected") {
    const jid = `${phone}@s.whatsapp.net`;
    try {
      const mediaMap: Record<string, any> = {
        image:    { image: { url: String(url) }, caption: String(caption) },
        video:    { video: { url: String(url) }, caption: String(caption) },
        document: { document: { url: String(url) }, caption: String(caption), mimetype: "application/octet-stream" },
        audio:    { audio: { url: String(url) }, mimetype: "audio/mpeg", ptt: false },
      };
      const msg = mediaMap[String(type)] ?? mediaMap.image;
      await session.socket.sendMessage(jid, msg);
    } catch (e: any) {
      fail(res, `Gagal mengirim media: ${e.message}`, 500); return;
    }
  }

  const msg = await recordMessage(auth.userId, device.id, phone, caption ? String(caption) : "[media]", String(url));
  ok(res, { id: String(msg.id), number: phone, type, status: "sent", createdAt: msg.createdAt?.toISOString() }, "Media sent successfully");
}

router.post("/send-media", sendMediaHandler);
router.get("/send-media", sendMediaHandler);

/* ─────────────────────────────────────────────────────────────────────────
   Send Poll
   ───────────────────────────────────────────────────────────────────────── */

router.post("/send-poll", async (req: Request, res: Response): Promise<void> => {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender, number, question, options, multiple_answers = false } = params(req);

  if (!number || !question || !options) { fail(res, "Parameter number, question, dan options diperlukan"); return; }
  if (!await checkQuota(auth.userId, res)) return;

  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;

  const phone = String(number).replace(/\D/g, "");
  const opts: string[] = Array.isArray(options) ? options : JSON.parse(String(options));
  const session = getSession(device.id);

  if (session?.socket && session.status === "connected") {
    try {
      await session.socket.sendMessage(`${phone}@s.whatsapp.net`, {
        poll: { name: String(question), values: opts, selectableCount: multiple_answers ? opts.length : 1 },
      });
    } catch (e: any) {
      fail(res, `Gagal mengirim poll: ${e.message}`, 500); return;
    }
  }

  const msg = await recordMessage(auth.userId, device.id, phone, `[POLL] ${question}`);
  ok(res, { id: String(msg.id), number: phone, status: "sent" }, "Poll sent successfully");
});

/* ─────────────────────────────────────────────────────────────────────────
   Send Button
   ───────────────────────────────────────────────────────────────────────── */

router.post("/send-button", async (req: Request, res: Response): Promise<void> => {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender, number, message, footer = "", buttons } = params(req);

  if (!number || !message || !buttons) { fail(res, "Parameter number, message, dan buttons diperlukan"); return; }
  if (!await checkQuota(auth.userId, res)) return;

  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;

  const phone = String(number).replace(/\D/g, "");
  const btns: any[] = Array.isArray(buttons) ? buttons : JSON.parse(String(buttons));

  // ── Official API Branch ──────────────────────────────────────────────────
  if (device.provider === "official") {
    try {
      const payload = formatOfficialInteractive({
        type: "button",
        body: String(message),
        footer: String(footer),
        buttons: btns.map((b: any, i: number) => ({
          type: "reply",
          title: b.text || b.title,
          id: b.id || `btn_${i + 1}`
        }))
      });
      const response = await sendOfficialMessage({
        accessToken: device.officialAccessToken!,
        phoneId: device.officialPhoneId!,
        to: phone,
        message: payload
      });
      const msg = await recordMessage(auth.userId, device.id, phone, String(message));
      await db.update(devicesTable).set({ messagesSent: sql`${devicesTable.messagesSent} + 1` }).where(eq(devicesTable.id, device.id));
      ok(res, { id: String(msg.id), number: phone, status: "sent", externalId: response.messages?.[0]?.id }, "Button message sent via Official API");
      return;
    } catch (e: any) {
      fail(res, `Official API Error: ${e.message}`, 500);
      return;
    }
  }

  const session = getSession(device.id);

  if (session?.socket && session.status === "connected") {
    try {
      const nativeBtns = btns
        .filter((b: any) => b?.text)
        .map((b: any, i: number) =>
          proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
            name: "quick_reply",
            buttonParamsJson: JSON.stringify({ display_text: b.text, id: `btn_${i + 1}` }),
          })
        );
      const relayMsg = proto.Message.create({
        interactiveMessage: proto.Message.InteractiveMessage.create({
          header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
          body: proto.Message.InteractiveMessage.Body.create({ text: String(message) }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: String(footer) }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            messageVersion: 1,
            buttons: nativeBtns,
          }),
        }),
      });
      await (session.socket as any).relayMessage(`${phone}@s.whatsapp.net`, relayMsg, { messageId: generateMessageIDV2() });
    } catch (e: any) {
      fail(res, `Gagal mengirim pesan tombol: ${e.message}`, 500); return;
    }
  }

  const msg = await recordMessage(auth.userId, device.id, phone, String(message));
  ok(res, { id: String(msg.id), number: phone, status: "sent" }, "Button message sent successfully");
});

/* ─────────────────────────────────────────────────────────────────────────
   Send List
   ───────────────────────────────────────────────────────────────────────── */

router.post("/send-list", async (req: Request, res: Response): Promise<void> => {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender, number, message, footer = "", button_text = "Lihat Menu", sections } = params(req);

  if (!number || !message || !sections) { fail(res, "Parameter number, message, dan sections diperlukan"); return; }
  if (!await checkQuota(auth.userId, res)) return;

  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;

  const phone = String(number).replace(/\D/g, "");
  const secs: any[] = Array.isArray(sections) ? sections : JSON.parse(String(sections));
  const session = getSession(device.id);

  if (session?.socket && session.status === "connected") {
    try {
      const selectBtn = proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: String(button_text),
          sections: secs.map((s: any) => ({
            title: s.title ?? "",
            highlight_label: "",
            rows: (s.rows ?? []).map((r: any) => ({
              header: "",
              title: r.title ?? String(r),
              description: r.description ?? "",
              id: r.id ?? r.title ?? String(r),
            })),
          })),
        }),
      });
      const relayMsg = proto.Message.create({
        interactiveMessage: proto.Message.InteractiveMessage.create({
          header: proto.Message.InteractiveMessage.Header.create({ hasMediaAttachment: false }),
          body: proto.Message.InteractiveMessage.Body.create({ text: String(message) }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: String(footer) }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            messageVersion: 1,
            buttons: [selectBtn],
          }),
        }),
      });
      await (session.socket as any).relayMessage(`${phone}@s.whatsapp.net`, relayMsg, { messageId: generateMessageIDV2() });
    } catch (e: any) {
      fail(res, `Gagal mengirim list: ${e.message}`, 500); return;
    }
  }

  const msg = await recordMessage(auth.userId, device.id, phone, String(message));
  ok(res, { id: String(msg.id), number: phone, status: "sent" }, "List message sent successfully");
});

/* ─────────────────────────────────────────────────────────────────────────
   Send Sticker
   ───────────────────────────────────────────────────────────────────────── */

async function sendStickerHandler(req: Request, res: Response): Promise<void> {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender, number, url } = params(req);

  if (!number || !url) { fail(res, "Parameter number dan url diperlukan"); return; }
  if (!await checkQuota(auth.userId, res)) return;

  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;

  const phone = String(number).replace(/\D/g, "");
  const session = getSession(device.id);

  if (session?.socket && session.status === "connected") {
    try {
      await session.socket.sendMessage(`${phone}@s.whatsapp.net`, {
        sticker: { url: String(url) },
      });
    } catch (e: any) {
      fail(res, `Gagal mengirim stiker: ${e.message}`, 500); return;
    }
  }

  const msg = await recordMessage(auth.userId, device.id, phone, "[sticker]", String(url));
  ok(res, { id: String(msg.id), number: phone, status: "sent" }, "Sticker sent successfully");
}

router.post("/send-sticker", sendStickerHandler);
router.get("/send-sticker", sendStickerHandler);

/* ─────────────────────────────────────────────────────────────────────────
   Send Location
   ───────────────────────────────────────────────────────────────────────── */

async function sendLocationHandler(req: Request, res: Response): Promise<void> {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender, number, latitude, longitude, name = "", address = "" } = params(req);

  if (!number || !latitude || !longitude) { fail(res, "Parameter number, latitude, dan longitude diperlukan"); return; }
  if (!await checkQuota(auth.userId, res)) return;

  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;

  const phone = String(number).replace(/\D/g, "");
  const session = getSession(device.id);

  if (session?.socket && session.status === "connected") {
    try {
      await session.socket.sendMessage(`${phone}@s.whatsapp.net`, {
        location: {
          degreesLatitude: parseFloat(String(latitude)),
          degreesLongitude: parseFloat(String(longitude)),
          name: String(name),
          address: String(address),
        },
      });
    } catch (e: any) {
      fail(res, `Gagal mengirim lokasi: ${e.message}`, 500); return;
    }
  }

  const msg = await recordMessage(auth.userId, device.id, phone, `[Location] ${name || latitude + "," + longitude}`);
  ok(res, { id: String(msg.id), number: phone, status: "sent" }, "Location sent successfully");
}

router.post("/send-location", sendLocationHandler);
router.get("/send-location", sendLocationHandler);

/* ─────────────────────────────────────────────────────────────────────────
   Send Vcard
   ───────────────────────────────────────────────────────────────────────── */

async function sendVcardHandler(req: Request, res: Response): Promise<void> {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender, number, contact_name, contact_number, contact_email = "", contact_org = "" } = params(req);

  if (!number || !contact_name || !contact_number) { fail(res, "Parameter number, contact_name, dan contact_number diperlukan"); return; }
  if (!await checkQuota(auth.userId, res)) return;

  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;

  const phone = String(number).replace(/\D/g, "");
  const session = getSession(device.id);

  if (session?.socket && session.status === "connected") {
    try {
      const vcard = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `FN:${contact_name}`,
        `TEL;type=CELL;type=VOICE;waid=${contact_number}:+${contact_number}`,
        contact_email ? `EMAIL:${contact_email}` : "",
        contact_org ? `ORG:${contact_org}` : "",
        "END:VCARD",
      ].filter(Boolean).join("\n");

      await session.socket.sendMessage(`${phone}@s.whatsapp.net`, {
        contacts: { displayName: String(contact_name), contacts: [{ vcard }] },
      });
    } catch (e: any) {
      fail(res, `Gagal mengirim vcard: ${e.message}`, 500); return;
    }
  }

  const msg = await recordMessage(auth.userId, device.id, phone, `[Vcard] ${contact_name}`);
  ok(res, { id: String(msg.id), number: phone, status: "sent" }, "VCard sent successfully");
}

router.post("/send-vcard", sendVcardHandler);
router.get("/send-vcard", sendVcardHandler);

/* ─────────────────────────────────────────────────────────────────────────
   Check Number
   ───────────────────────────────────────────────────────────────────────── */

async function checkNumberHandler(req: Request, res: Response): Promise<void> {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender, number } = params(req);

  if (!number) { fail(res, "Parameter number diperlukan"); return; }

  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;

  const phone = String(number).replace(/\D/g, "");
  const session = getSession(device.id);

  let registered = false;
  let wa_id: string | null = null;

  if (session?.socket && session.status === "connected") {
    try {
      const [result] = await session.socket.onWhatsApp(`${phone}@s.whatsapp.net`);
      if (result) {
        registered = result.exists;
        wa_id = result.jid;
      }
    } catch {
      registered = false;
    }
  }

  ok(res, { number: phone, registered, wa_id }, registered ? "Number is registered on WhatsApp" : "Number is not registered on WhatsApp");
}

router.post("/check-number", checkNumberHandler);
router.get("/check-number", checkNumberHandler);

router.post("/check-numbers", async (req: Request, res: Response): Promise<void> => {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender, phones } = params(req);
  if (!phones || !Array.isArray(phones)) { fail(res, "Parameter phones[] diperlukan"); return; }
  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;
  const session = getSession(device.id);
  if (!session?.socket || session.status !== "connected") { fail(res, "Perangkat tidak terhubung", 503); return; }
  try {
    const { checkNumbers } = await import("../lib/wa-manager");
    const results = await checkNumbers(device.id, phones);
    ok(res, { data: results, total: results.length });
  } catch (e: any) { fail(res, e.message, 500); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   GRUP — Groups
   ══════════════════════════════════════════════════════════════════════════ */

router.get("/groups", async (req: Request, res: Response): Promise<void> => {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender } = params(req);
  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;
  try {
    const { getGroups } = await import("../lib/wa-manager");
    const groups = await getGroups(device.id);
    ok(res, { data: groups, total: groups.length });
  } catch (e: any) { fail(res, e.message, 503); }
});

router.post("/send-group", async (req: Request, res: Response): Promise<void> => {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender, groupId, message } = params(req);
  if (!groupId || !message) { fail(res, "Parameter groupId dan message diperlukan"); return; }
  if (!await checkQuota(auth.userId, res)) return;
  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;
  const session = getSession(device.id);
  if (!session?.socket || session.status !== "connected") { fail(res, "Perangkat tidak terhubung", 503); return; }
  try {
    const { sendToGroup } = await import("../lib/wa-manager");
    const externalId = await sendToGroup(device.id, groupId, { text: String(message) });
    const msg = await recordMessage(auth.userId, device.id, groupId.replace("@g.us", ""), String(message));
    ok(res, { id: String(msg.id), groupId, status: "sent", externalId });
  } catch (e: any) { fail(res, e.message, 500); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   COMMERCE — Products & Categories
   ══════════════════════════════════════════════════════════════════════════ */

router.get("/commerce/products", async (req: Request, res: Response): Promise<void> => {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender } = params(req);
  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;
  const { botProductsTable } = await import("@workspace/db");
  const products = await db.select().from(botProductsTable).where(eq(botProductsTable.deviceId, device.id));
  ok(res, { data: products, total: products.length });
});

router.get("/commerce/categories", async (req: Request, res: Response): Promise<void> => {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender } = params(req);
  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;
  const { botCategoriesTable } = await import("@workspace/db");
  const categories = await db.select().from(botCategoriesTable).where(eq(botCategoriesTable.deviceId, device.id));
  ok(res, { data: categories, total: categories.length });
});

/* ═══════════════════════════════════════════════════════════════════════════
   PERANGKAT — Device
   ══════════════════════════════════════════════════════════════════════════ */

/** GET /device/info */
async function deviceInfoHandler(req: Request, res: Response): Promise<void> {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender } = params(req);

  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;

  const session = getSession(device.id);

  ok(res, {
    id: String(device.id),
    phone: device.phone,
    name: device.name,
    status: device.provider === "official" ? device.status : (session?.status ?? device.status),
    battery: device.battery,
    auto_reconnect: device.autoReconnect,
    messages_sent: device.messagesSent,
    created_at: device.createdAt?.toISOString(),
  });
}

router.get("/device/info", deviceInfoHandler);
router.post("/device/info", deviceInfoHandler);

/** GET /device/qr */
async function deviceQrHandler(req: Request, res: Response): Promise<void> {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender } = params(req);

  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;

  const session = getSession(device.id);

  if (!session?.qrDataUrl) {
    ok(res, { status: session?.status ?? "disconnected", qr_code: null }, "QR code not yet available. Device may be connecting or already connected.");
    return;
  }

  ok(res, {
    qr_code: session.qrDataUrl,
    expires_at: new Date(Date.now() + 60000).toISOString(),
  });
}

router.get("/device/qr", deviceQrHandler);

/** POST/GET /device/disconnect */
async function deviceDisconnectHandler(req: Request, res: Response): Promise<void> {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { sender } = params(req);

  const device = await resolveDevice(auth.userId, sender, res);
  if (!device) return;

  try {
    const { disconnectSession } = await import("../lib/wa-manager");
    await disconnectSession(device.id);
  } catch (e: any) {
    fail(res, `Gagal memutus koneksi: ${e.message}`, 500); return;
  }

  ok(res, { phone: device.phone, status: "disconnected" }, "Device disconnected successfully");
}

router.post("/device/disconnect", deviceDisconnectHandler);
router.get("/device/disconnect", deviceDisconnectHandler);

/** POST /device/create */
router.post("/device/create", async (req: Request, res: Response): Promise<void> => {
  const auth = await resolveAuth(req, res);
  if (!auth) return;
  const { name, phone = "", webhook_url = "", auto_reconnect = true } = params(req);

  if (!name) { fail(res, "Parameter name diperlukan"); return; }

  const [device] = await db
    .insert(devicesTable)
    .values({
      userId: auth.userId,
      name: String(name),
      phone: String(phone).replace(/\D/g, ""),
      status: "disconnected",
      autoReconnect: Boolean(auto_reconnect),
      webhookUrl: webhook_url ? String(webhook_url) : null,
      messagesSent: 0,
      battery: 100,
    })
    .returning();

  ok(res, {
    id: String(device.id),
    name: device.name,
    phone: device.phone,
    status: device.status,
    auto_reconnect: device.autoReconnect,
    created_at: device.createdAt?.toISOString(),
  }, "Device created");
});

/* ═══════════════════════════════════════════════════════════════════════════
   AKUN — User
   ══════════════════════════════════════════════════════════════════════════ */

/** GET /user/info */
async function userInfoHandler(req: Request, res: Response): Promise<void> {
  const auth = await resolveAuth(req, res);
  if (!auth) return;

  const { usersTable } = await import("@workspace/db");
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId));

  if (!user) { fail(res, "Pengguna tidak ditemukan", 404); return; }

  const plan = await getUserPlan(auth.userId);
  const today = await countTodayMessages(auth.userId);

  ok(res, {
    id: user.id,
    name: user.name,
    email: user.email,
    plan: plan.planName?.toLowerCase() ?? "free",
    quota: {
      used: today,
      limit: plan.limitMessagesPerDay === -1 ? null : plan.limitMessagesPerDay,
      unlimited: plan.limitMessagesPerDay === -1,
    },
    created_at: user.createdAt?.toISOString(),
  });
}

router.get("/user/info", userInfoHandler);

/** POST /user/create (admin) */
router.post("/user/create", async (req: Request, res: Response): Promise<void> => {
  const auth = await resolveAuth(req, res);
  if (!auth) return;

  const { usersTable } = await import("@workspace/db");
  const [caller] = await db.select().from(usersTable).where(eq(usersTable.id, auth.userId));

  if (!caller || caller.role !== "admin") {
    fail(res, "Hanya admin yang dapat membuat akun pengguna", 403); return;
  }

  const { name, email, password } = params(req);
  if (!name || !email || !password) { fail(res, "Parameter name, email, dan password diperlukan"); return; }

  const bcrypt = await import("bcrypt");
  const hashedPassword = await bcrypt.hash(String(password), 10);

  try {
    const [user] = await db
      .insert(usersTable)
      .values({ name: String(name), email: String(email), password: hashedPassword, role: "user" })
      .returning({ id: usersTable.id, email: usersTable.email, name: usersTable.name });

    ok(res, { id: user.id, email: user.email, name: user.name }, "User created");
  } catch (e: any) {
    if (e.message?.includes("unique")) {
      fail(res, "Email sudah terdaftar", 409);
    } else {
      fail(res, `Gagal membuat pengguna: ${e.message}`, 500);
    }
  }
});

/* ═══════════════════════════════════════════════════════════════════════════
   INFO — List semua endpoint ini
   ══════════════════════════════════════════════════════════════════════════ */

router.get("/", (_req, res) => {
  res.json({
    status: true,
    message: "WA Gateway Public API",
    version: "1.0",
    base_url: "/api",
    auth: "Sertakan api_key di setiap request (query string atau JSON body)",
    endpoints: [
      { method: "POST|GET", path: "/send-message",    desc: "Kirim pesan teks" },
      { method: "POST|GET", path: "/send-media",      desc: "Kirim media (image/video/document/audio)" },
      { method: "POST",     path: "/send-poll",       desc: "Kirim polling" },
      { method: "POST",     path: "/send-button",     desc: "Kirim pesan tombol" },
      { method: "POST",     path: "/send-list",       desc: "Kirim pesan list" },
      { method: "POST|GET", path: "/send-sticker",    desc: "Kirim stiker" },
      { method: "POST|GET", path: "/send-location",   desc: "Kirim lokasi GPS" },
      { method: "POST|GET", path: "/send-vcard",      desc: "Kirim kartu kontak (vCard)" },
      { method: "POST|GET", path: "/check-number",    desc: "Cek nomor WhatsApp" },
      { method: "GET",      path: "/device/info",     desc: "Info perangkat" },
      { method: "GET",      path: "/device/qr",       desc: "QR Code perangkat" },
      { method: "POST|GET", path: "/device/disconnect", desc: "Putus koneksi perangkat" },
      { method: "POST",     path: "/device/create",   desc: "Buat perangkat baru" },
      { method: "POST",     path: "/check-numbers",   desc: "Cek massal nomor WhatsApp" },
      { method: "GET",      path: "/groups",          desc: "List grup WhatsApp" },
      { method: "POST",     path: "/send-group",      desc: "Kirim pesan ke grup" },
      { method: "GET",      path: "/commerce/products", desc: "List produk bot" },
      { method: "GET",      path: "/commerce/categories", desc: "List kategori bot" },
      { method: "GET",      path: "/user/info",       desc: "Info akun pengguna" },
      { method: "POST",     path: "/user/create",     desc: "Buat pengguna (admin)" },
    ],
  });
});

export default router;
