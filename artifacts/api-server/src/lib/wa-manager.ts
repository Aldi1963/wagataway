import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  Browsers,
  WASocket,
  downloadMediaMessage,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import { EventEmitter } from "events";
import path from "path";
import fs from "fs";
import { db, devicesTable, autoRepliesTable, chatInboxTable, webhooksTable, usersTable, messagesTable } from "@workspace/db";
import { eq, and, or, isNull, sql, inArray } from "drizzle-orm";
import { getChatEmitter } from "../routes/chat";
import { sendDeviceAlertEmail } from "./email";
import { sendTelegramNotification, fmtDeviceDisconnect } from "./telegram-notify";
import pino from "pino";
import QRCode from "qrcode";
import { processBotMessage, type BotReply } from "../routes/cs-bot";
import { processAdminBotMessage, isAdminBotDevice, startReminderCron } from "./admin-bot-processor";
import { registerDeviceSender, unregisterDeviceSender, registerDeviceListSender, registerDeviceCheckNumber } from "./wa-sender";
import { transcribeAudio } from "./audio-processor";


const SESSIONS_DIR = path.resolve(process.cwd(), process.env.SESSIONS_DIR || "wa-sessions");
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// ── Auto-online timers (per device) ─────────────────────────────────────────
const autoOnlineTimers = new Map<number, ReturnType<typeof setInterval>>();

function startAutoOnline(deviceId: number, sock: WASocket): void {
  stopAutoOnline(deviceId);
  // Send "available" presence every 30 seconds
  const timer = setInterval(async () => {
    try {
      await sock.sendPresenceUpdate("available");
    } catch { /* session may have closed */ }
  }, 30_000);
  autoOnlineTimers.set(deviceId, timer);
  // Send immediately on start
  sock.sendPresenceUpdate("available").catch(() => {});
}

function stopAutoOnline(deviceId: number): void {
  const t = autoOnlineTimers.get(deviceId);
  if (t) { clearInterval(t); autoOnlineTimers.delete(deviceId); }
}

function extractText(msg: any): string | null {
  const m = msg.message;
  if (!m) return null;
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.documentMessage?.caption ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    null
  );
}

function matchKeyword(text: string, keyword: string, matchType: string): boolean {
  const lower = text.toLowerCase().trim();
  const kws = keyword.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (matchType === "exact") return kws.some((k) => lower === k);
  if (matchType === "startsWith") return kws.some((k) => lower.startsWith(k));
  return kws.some((k) => lower.includes(k));
}

/** Cek apakah waktu sekarang masuk dalam jadwal aktif rule */
function isScheduleActive(scheduleFrom: string | null, scheduleTo: string | null, timezone: string): boolean {
  if (!scheduleFrom || !scheduleTo) return true;
  try {
    const now = new Date();
    const tz = timezone || "Asia/Jakarta";
    const timeStr = now.toLocaleTimeString("en-GB", { timeZone: tz, hour: "2-digit", minute: "2-digit" });
    const [hh, mm] = timeStr.split(":").map(Number);
    const nowMin = hh * 60 + mm;
    const [fh, fm] = scheduleFrom.split(":").map(Number);
    const [th, tm] = scheduleTo.split(":").map(Number);
    const fromMin = fh * 60 + fm;
    const toMin = th * 60 + tm;
    if (fromMin <= toMin) return nowMin >= fromMin && nowMin <= toMin;
    return nowMin >= fromMin || nowMin <= toMin;
  } catch { return true; }
}

/** Fire all active webhooks for a user/device that listen to the given event */
async function fireWebhooks(
  userId: number,
  deviceId: number,
  event: string,
  payload: Record<string, any>
): Promise<void> {
  try {
    const hooks = await db
      .select()
      .from(webhooksTable)
      .where(
        and(
          eq(webhooksTable.userId, userId),
          eq(webhooksTable.isActive, true)
        )
      );

    for (const hook of hooks) {
      // Check if this hook listens to the event and matches the device (or all devices)
      const events: string[] = (hook.events as string[]) ?? [];
      if (!events.includes(event) && !events.includes("*")) continue;
      if (hook.deviceId !== null && hook.deviceId !== deviceId) continue;

      const body = JSON.stringify({
        event,
        timestamp: new Date().toISOString(),
        deviceId,
        data: payload,
      });

      // Fire with retry: attempt up to 3 times with exponential backoff (2s, 6s, 18s)
      (async () => {
        const delays = [0, 2000, 6000, 18000];
        const headers = {
          "Content-Type": "application/json",
          ...(hook.secret ? { "X-WA-Gateway-Secret": hook.secret } : {}),
        };
        for (let attempt = 0; attempt < delays.length; attempt++) {
          if (delays[attempt] > 0) await new Promise((r) => setTimeout(r, delays[attempt]));
          try {
            const res = await fetch(hook.url, { method: "POST", headers, body, signal: AbortSignal.timeout(10000) });
            if (res.ok || (res.status >= 200 && res.status < 300)) {
              await db.update(webhooksTable)
                .set({ lastTriggered: new Date(), triggerCount: sql`${webhooksTable.triggerCount} + 1` })
                .where(eq(webhooksTable.id, hook.id)).catch(() => {});
              return; // success — stop retrying
            }
            console.warn(`[Webhook] Attempt ${attempt + 1} to ${hook.url} got HTTP ${res.status}`);
          } catch (err: any) {
            if (attempt < delays.length - 1) {
              console.warn(`[Webhook] Attempt ${attempt + 1} failed for ${hook.url}: ${err.message} — retrying...`);
            } else {
              console.error(`[Webhook] All ${delays.length} attempts failed for ${hook.url}: ${err.message}`);
            }
          }
        }
      })();
    }
  } catch (err) {
    console.error("[Webhook] fireWebhooks error:", err);
  }
}

const silentLogger = pino({ level: "silent" });

interface SessionState {
  socket: WASocket | null;
  qr: string | null;
  qrExpiresAt: Date | null;
  pairingCode: string | null;
  pairingExpiresAt: Date | null;
  status: "disconnected" | "connecting" | "connected";
  events: EventEmitter;
  stopSignal: AbortController;
}

const sessions = new Map<number, SessionState>();

function getSessionDir(deviceId: number): string {
  // Ensure deviceId is a positive integer to prevent path traversal
  const safeId = Math.floor(deviceId);
  if (!Number.isFinite(safeId) || safeId <= 0) {
    throw new Error(`Invalid deviceId: ${deviceId}`);
  }
  const sessionPath = path.join(SESSIONS_DIR, String(safeId));
  // Verify the resolved path is still inside SESSIONS_DIR
  if (!sessionPath.startsWith(SESSIONS_DIR + path.sep) && sessionPath !== SESSIONS_DIR) {
    throw new Error(`Path traversal detected for deviceId: ${deviceId}`);
  }
  return sessionPath;
}

async function updateDeviceStatus(deviceId: number, updates: Record<string, any>) {
  try {
    const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined));
    if (Object.keys(clean).length === 0) return;
    await db.update(devicesTable).set(clean).where(eq(devicesTable.id, deviceId));
  } catch (e) {
    console.error(`[WA] Failed to update device ${deviceId}:`, e);
  }
}

export async function startSession(deviceId: number): Promise<SessionState> {
  const existing = sessions.get(deviceId);
  if (existing && existing.status !== "disconnected") {
    return existing;
  }

  if (existing) {
    existing.stopSignal.abort();
    existing.socket?.end(undefined);
    sessions.delete(deviceId);
  }

  const stopSignal = new AbortController();
  const events = new EventEmitter();
  events.setMaxListeners(30);

  const state: SessionState = {
    socket: null, qr: null, qrExpiresAt: null,
    pairingCode: null, pairingExpiresAt: null,
    status: "connecting", events, stopSignal,
  };
  sessions.set(deviceId, state);

  const sessionDir = getSessionDir(deviceId);
  const { state: authState, saveCreds } = await useMultiFileAuthState(sessionDir);
  const { version } = await fetchLatestBaileysVersion();

  const sock = makeWASocket({
    version,
    logger: silentLogger as any,
    printQRInTerminal: false,
    auth: {
      creds: authState.creds,
      keys: makeCacheableSignalKeyStore(authState.keys, silentLogger as any),
    },
    browser: Browsers.ubuntu("Chrome"),
    generateHighQualityLinkPreview: false,
    syncFullHistory: false,
  });

  state.socket = sock;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      state.qr = qr;
      state.qrExpiresAt = new Date(Date.now() + 60000);
      state.status = "connecting";
      try {
        let qrDataUrl: string;
        try {
          // Try PNG first
          qrDataUrl = await QRCode.toDataURL(qr, { width: 400, margin: 2 });
        } catch {
          // Fallback to SVG (no canvas required)
          const svg = await QRCode.toString(qr, { type: "svg", width: 400, margin: 2 });
          qrDataUrl = `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
        }
        state.events.emit("qr", { qrDataUrl, expiresAt: state.qrExpiresAt });
      } catch (err) {
        // Last resort: send raw QR string so frontend can render it
        state.events.emit("qr", { qr, expiresAt: state.qrExpiresAt });
      }
      await updateDeviceStatus(deviceId, { status: "connecting" });
    }

    if (connection === "open") {
      state.qr = null;
      state.pairingCode = null;
      state.status = "connected";

      const phone = sock.user?.id?.split(":")[0] ?? null;
      state.events.emit("connected", { phone });
      await updateDeviceStatus(deviceId, {
        status: "connected",
        phone: phone ? `+${phone}` : null,
        lastSeen: new Date(),
      });

      // Register this device's sender for admin bot / reminder broadcasts
      registerDeviceSender(deviceId, async (jid, text) => {
        await sock.sendMessage(jid, { text });
      });
      registerDeviceListSender(deviceId, async (jid, title, body, buttonText, sections) => {
        await sock.sendMessage(jid, {
          listMessage: {
            title,
            text: body,
            buttonText,
            sections,
            listType: 1,
          },
        } as any);
      });
      registerDeviceCheckNumber(deviceId, async (phone) => {
        const cleaned = phone.replace(/\D/g, "").replace(/^0/, "62");
        const [result] = await sock.onWhatsApp(`${cleaned}@s.whatsapp.net`);
        return result || null;
      });

      // Fire device.connected webhook + email notification
      const [dev] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).catch(() => [null]);
      if (dev) {
        // ── Auto-Online: keep presence as "available" ───────────────────────
        if (dev.autoOnline) startAutoOnline(deviceId, sock);

        fireWebhooks(dev.userId, deviceId, "device.connected", { deviceId, phone: phone ?? null, status: "connected" });
        if (dev.notifyOnConnect) {
          db.select({ email: usersTable.email, name: usersTable.name })
            .from(usersTable).where(eq(usersTable.id, dev.userId))
            .then(([user]) => {
              if (user) sendDeviceAlertEmail(user.email, user.name, dev.name, "connected", dev.phone).catch(() => {});
            }).catch(() => {});
        }
      }
    }

    if (connection === "close") {
      const statusCode = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut && !stopSignal.signal.aborted;

      // ── Stop auto-online timer on disconnect ────────────────────────────
      stopAutoOnline(deviceId);
      unregisterDeviceSender(deviceId);

      state.status = "disconnected";
      state.qr = null;
      state.pairingCode = null;
      state.events.emit("disconnected", { statusCode });

      // Fire device.disconnected webhook + email notification
      const [dev] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId)).catch(() => [null]);
      if (dev) {
        fireWebhooks(dev.userId, deviceId, "device.disconnected", { deviceId, statusCode: statusCode ?? null, status: "disconnected" });
        if (dev.notifyOnDisconnect) {
          db.select({ email: usersTable.email, name: usersTable.name })
            .from(usersTable).where(eq(usersTable.id, dev.userId))
            .then(([user]) => {
              if (user) sendDeviceAlertEmail(user.email, user.name, dev.name, "disconnected", dev.phone).catch(() => {});
            }).catch(() => {});
        }
        // Telegram notification on device disconnect
        sendTelegramNotification(fmtDeviceDisconnect(dev.name, dev.phone ?? "-")).catch(() => {});
      }

      await updateDeviceStatus(deviceId, {
        status: "disconnected",
        phone: statusCode === DisconnectReason.loggedOut ? null : undefined,
      });

      if (statusCode === DisconnectReason.loggedOut) {
        const dir = getSessionDir(deviceId);
        if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
        sessions.delete(deviceId);
        return;
      }

      sessions.delete(deviceId);

      if (shouldReconnect) {
        const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
        if (device?.autoReconnect) {
          setTimeout(() => startSession(deviceId), 5000);
        }
      }
    }
  });

  sock.ev.on("messages.upsert", async ({ messages, type }) => {
    if (type !== "notify") return;
    for (const msg of messages) {
      if (msg.key.fromMe || !msg.message || !msg.key.remoteJid) continue;

      // Emit raw event for SSE/webhook forwarding
      state.events.emit("message", msg);

      const jid = msg.key.remoteJid;
      if (jid === "status@broadcast") continue;

      const isGroup = jid.endsWith("@g.us");

      // Get device owner
      const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
      if (!device) continue;

      // ── Auto Read: send read receipt immediately ────────────────────────
      if (device.autoRead) {
        sock.readMessages([msg.key]).catch(() => {});
      }

      const text = extractText(msg);
      const contactName = msg.pushName ?? null;

      // Detect media type & message sub-object
      const m = msg.message;
      let mediaType: string | null = null;
      if (m?.imageMessage) mediaType = "image";
      else if (m?.videoMessage) mediaType = "video";
      else if (m?.audioMessage) mediaType = "audio";
      else if (m?.documentMessage) mediaType = "document";
      else if (m?.stickerMessage) mediaType = "sticker";

      // ── participant: for group = sender JID, for 1:1 = null ─────────────
      const participantRaw = isGroup
        ? (msg.key.participant ?? null)
        : null;
      const participant = participantRaw ? participantRaw.split("@")[0] : null;

      // ── from: group JID number or sender phone ──────────────────────────
      const from = jid.split("@")[0];

      // ── Fetch sender profile picture URL (non-blocking) ─────────────────
      let ppUrl: string | null = null;
      try {
        const ppJid = isGroup ? (participantRaw ?? jid) : jid;
        ppUrl = await sock.profilePictureUrl(ppJid, "image").catch(() => null);
      } catch { /* ignore */ }

      // ── Download media as Buffer if present ──────────────────────────────
      let mediaPayload: Record<string, any> | null = null;
      if (mediaType && mediaType !== "sticker") {
        try {
          const buffer = await downloadMediaMessage(
            msg,
            "buffer",
            {},
            { logger: silentLogger as any, reuploadRequest: sock.updateMediaMessage }
          ) as Buffer;

          const msgInner = m?.imageMessage ?? m?.videoMessage ?? m?.audioMessage
            ?? m?.documentMessage ?? null;
          const mimetype: string = (msgInner as any)?.mimetype ?? `${mediaType}/octet-stream`;
          const caption: string | null = (msgInner as any)?.caption ?? text ?? null;
          const fileName: string =
            (msgInner as any)?.fileName
            ?? `${mediaType}_${Date.now()}.${mimetype.split("/")[1]?.split(";")[0] ?? "bin"}`;

          mediaPayload = {
            caption,
            fileName,
            stream: buffer.toJSON(),
            mimetype,
          };
        } catch (dlErr) {
          console.error("[WA] Media download failed:", (dlErr as Error).message);
        }
      }

      // ── Save incoming message to chat_inbox (individual chats only) ──────
      if (!isGroup) {
        try {
          let transcription: string | null = null;
          if (mediaType === "audio" && mediaPayload?.stream) {
            const buffer = Buffer.from(mediaPayload.stream.data);
            transcription = await transcribeAudio(buffer, device.userId, mediaPayload.mimetype);
            if (transcription) {
              logger.info({ transcription }, "[WA] Audio transcribed");
            }
          }

          const [saved] = await db.insert(chatInboxTable).values({
            userId: device.userId,
            deviceId,
            jid,
            contactName,
            fromMe: false,
            messageId: msg.key.id ?? null,
            text: text || null,
            mediaType,
            transcription,
            status: "received",
            isRead: false,
          }).returning();
          getChatEmitter(deviceId).emit("message", saved);
        } catch (err) {
          console.error("[WA] Failed to save incoming message:", err);
        }
      }

      // ── Fire registered webhooks (message.received) ──────────────────────
      fireWebhooks(device.userId, deviceId, "message.received", {
        device: device.name,
        message: text || null,
        from,
        name: contactName,
        participant,
        ppUrl,
        media: mediaPayload,
      });

      // Only process auto-reply / CS Bot for individual chats with text
      if (isGroup || !text?.trim()) continue;

      let botReply: BotReply | null = null;

      // ── 0. Admin WA Center Bot (highest priority) ────────────────────────
      try {
        const adminHandled = await processAdminBotMessage(
          deviceId,
          jid.split("@")[0],
          text,
          async (replyText) => {
            if (sock && state.status === "connected") {
              await sock.sendMessage(jid, { text: replyText });
            }
          },
          async (title, body, buttonText, sections) => {
            if (sock && state.status === "connected") {
              try {
                await sock.sendMessage(jid, {
                  listMessage: { title, description: body, buttonText, sections, listType: 1 },
                } as any);
              } catch {
                await sock.sendMessage(jid, { text: body });
              }
            }
          },
          async (url, caption) => {
            if (sock && state.status === "connected") {
              await sock.sendMessage(jid, { image: { url }, caption } as any);
            }
          }
        );
        if (adminHandled) continue;
      } catch (err) {
        console.error("[WA] Admin bot error:", err);
      }

      // ── 1. CS Bot (priority) ────────────────────────────────────────────
      try {
        botReply = await processBotMessage(deviceId, device.userId, jid.split("@")[0], text, contactName);
      } catch (err) {
        console.error("[WA] CS Bot error:", err);
      }

      // ── 2. Auto-reply fallback ──────────────────────────────────────────
      if (!botReply) {
        const rules = await db
          .select()
          .from(autoRepliesTable)
          .where(
            and(
              eq(autoRepliesTable.userId, device.userId),
              eq(autoRepliesTable.isActive, true),
              or(
                eq(autoRepliesTable.deviceId, deviceId),
                isNull(autoRepliesTable.deviceId)
              )
            )
          );

        for (const rule of rules) {
          if (!isScheduleActive(rule.scheduleFrom ?? null, rule.scheduleTo ?? null, rule.timezone ?? "Asia/Jakarta")) continue;
          if (matchKeyword(text, rule.keyword, rule.matchType)) {
            botReply = {
              text: rule.reply,
              mediaUrl: rule.mediaUrl ?? null,
              mediaCaption: rule.mediaCaption ?? null,
              messageType: (rule as any).messageType || "text",
              extra: (rule as any).extra || {},
            };
            await db
              .update(autoRepliesTable)
              .set({ triggerCount: sql`${autoRepliesTable.triggerCount} + 1` })
              .where(eq(autoRepliesTable.id, rule.id));
            break;
          }
        }
      }

      // ── 3. Send reply ───────────────────────────────────────────────────
      if (botReply && sock && state.status === "connected") {
        try {
          const replyType = botReply.messageType || "text";
          const extra = botReply.extra || {};

          if (replyType === "button") {
            const btns = (extra.buttons ?? [])
              .filter((b: any) => b?.displayText || b?.title)
              .map((b: any, i: number) => {
                const type = b.type ?? "quick_reply";
                if (type === "url") {
                  return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({ display_text: b.displayText || b.title, url: b.url, merchant_url: b.url }),
                  });
                }
                if (type === "call") {
                  return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
                    name: "cta_call",
                    buttonParamsJson: JSON.stringify({ display_text: b.displayText || b.title, phone_number: b.phoneNumber || b.phone }),
                  });
                }
                return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({ display_text: b.displayText || b.title, id: b.id || `btn_${i + 1}` }),
                });
              });

            const headerContent: any = { hasMediaAttachment: !!botReply.mediaUrl };
            if (botReply.mediaUrl) {
              headerContent.imageMessage = { url: botReply.mediaUrl };
            } else if (extra.headerText) {
              headerContent.title = extra.headerText;
            }

            const relayMsg = proto.Message.create({
              interactiveMessage: proto.Message.InteractiveMessage.create({
                header: proto.Message.InteractiveMessage.Header.create(headerContent),
                body: proto.Message.InteractiveMessage.Body.create({ text: botReply.text }),
                footer: proto.Message.InteractiveMessage.Footer.create({ text: extra.footer ?? "" }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                  messageVersion: 1,
                  buttons: btns,
                }),
              }),
            });
            await (sock as any).relayMessage(jid, relayMsg, { messageId: generateMessageIDV2() });
          } else if (replyType === "list") {
            const selectBtn = proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: extra.buttonText ?? "Pilih",
                sections: extra.sections ?? [],
              }),
            });

            const headerContent: any = { hasMediaAttachment: !!botReply.mediaUrl };
            if (botReply.mediaUrl) {
              headerContent.imageMessage = { url: botReply.mediaUrl };
            } else if (extra.headerText) {
              headerContent.title = extra.headerText;
            }

            const relayMsg = proto.Message.create({
              interactiveMessage: proto.Message.InteractiveMessage.create({
                header: proto.Message.InteractiveMessage.Header.create(headerContent),
                body: proto.Message.InteractiveMessage.Body.create({ text: botReply.text }),
                footer: proto.Message.InteractiveMessage.Footer.create({ text: extra.footer ?? "" }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                  messageVersion: 1,
                  buttons: [selectBtn],
                }),
              }),
            });
            await (sock as any).relayMessage(jid, relayMsg, { messageId: generateMessageIDV2() });
          } else {
            // Default: Send text message
            await sock.sendMessage(jid, { text: botReply.text });
            // Send media if present (for backward compatibility / simple media rules)
            if (botReply.mediaUrl && !botReply.messageType) {
              const url = botReply.mediaUrl;
              const caption = botReply.mediaCaption ?? "";
              const lower = url.toLowerCase();
              if (lower.match(/\.(jpg|jpeg|png|gif|webp)(\?|$)/)) {
                await sock.sendMessage(jid, { image: { url }, caption } as any);
              } else if (lower.match(/\.(mp4|mov|avi|mkv)(\?|$)/)) {
                await sock.sendMessage(jid, { video: { url }, caption } as any);
              } else {
                await sock.sendMessage(jid, { document: { url }, caption, fileName: url.split("/").pop() ?? "file" } as any);
              }
            }
          }
        } catch (err) {
          console.error("[WA] Failed to send auto-reply:", err);
        }
      }
    }
  });

  // ── messages.update: track delivery/read status ──────────────────────────
  sock.ev.on("messages.update", async (updates) => {
    for (const update of updates) {
      if (!update.key.id || !update.update?.status) continue;
      const status = update.update.status;
      // Baileys status: 1=ERROR,2=PENDING,3=SERVER_ACK,4=DELIVERY_ACK,5=READ,6=PLAYED
      if (status < 3) continue;

      const now = new Date();
      const dbUpdate: Record<string, any> = {};
      let webhookEvent: string | null = null;

      if (status === 4 && !dbUpdate.deliveredAt) {
        dbUpdate.deliveredAt = now;
        dbUpdate.status = "delivered";
        webhookEvent = "message.delivered";
      } else if (status >= 5) {
        dbUpdate.readAt = now;
        dbUpdate.status = "read";
        webhookEvent = "message.read";
      }

      if (!Object.keys(dbUpdate).length) continue;

      try {
        const [updated] = await db
          .update(messagesTable)
          .set(dbUpdate)
          .where(eq(messagesTable.externalId, update.key.id))
          .returning({ id: messagesTable.id, userId: messagesTable.userId, phone: messagesTable.phone });

        if (updated && webhookEvent) {
          const [device] = await db.select({ name: devicesTable.name })
            .from(devicesTable).where(eq(devicesTable.id, deviceId));
          fireWebhooks(updated.userId, deviceId, webhookEvent, {
            messageId: updated.id,
            externalId: update.key.id,
            phone: updated.phone,
            device: device?.name ?? "—",
            status: dbUpdate.status,
            at: now.toISOString(),
          });
        }
      } catch { /* ignore — externalId might not exist for older messages */ }
    }
  });

  stopSignal.signal.addEventListener("abort", () => {
    sock.end(undefined);
  });

  return state;
}

export async function requestPairingCode(deviceId: number, phone: string): Promise<string> {
  let state = sessions.get(deviceId);
  if (!state || state.status === "disconnected") {
    state = await startSession(deviceId);
    await new Promise((resolve) => setTimeout(resolve, 2000));
    state = sessions.get(deviceId)!;
  }

  if (!state.socket) throw new Error("Socket not initialized");

  const code = await state.socket.requestPairingCode(phone.replace(/\D/g, ""));
  const formatted = code.match(/.{1,4}/g)?.join("-") ?? code;
  state.pairingCode = formatted;
  state.pairingExpiresAt = new Date(Date.now() + 160000);
  state.events.emit("pairingCode", { code: formatted, expiresAt: state.pairingExpiresAt });
  return formatted;
}

export function getSession(deviceId: number): SessionState | undefined {
  return sessions.get(deviceId);
}

export async function disconnectSession(deviceId: number): Promise<void> {
  const state = sessions.get(deviceId);
  if (state) {
    state.stopSignal.abort();
    state.socket?.end(undefined);
    state.status = "disconnected";
    sessions.delete(deviceId);
  }
  const dir = getSessionDir(deviceId);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
  await updateDeviceStatus(deviceId, { status: "disconnected", phone: null, battery: null, lastSeen: null });
}

/** Ambil daftar grup WhatsApp dari perangkat yang terhubung */
export async function getGroups(deviceId: number): Promise<Array<{ id: string; name: string; participants: number; description?: string; createdAt?: number }>> {
  const state = sessions.get(deviceId);
  if (!state?.socket) throw new Error("Perangkat tidak terhubung");
  const groups = await state.socket.groupFetchAllParticipating();
  return Object.values(groups).map((g) => ({
    id: g.id,
    name: g.subject ?? g.id,
    participants: g.participants?.length ?? 0,
    description: (g as any).desc ?? undefined,
    createdAt: (g as any).creation ?? undefined,
  }));
}

/** Ambil detail anggota sebuah grup */
export async function getGroupMembers(deviceId: number, groupId: string): Promise<Array<{ phone: string; isAdmin: boolean }>> {
  const state = sessions.get(deviceId);
  if (!state?.socket) throw new Error("Perangkat tidak terhubung");
  const meta = await state.socket.groupMetadata(groupId);
  return (meta.participants ?? []).map((p) => ({
    phone: p.id.split("@")[0],
    isAdmin: p.admin === "admin" || p.admin === "superadmin",
  }));
}

/** Cek apakah nomor terdaftar di WhatsApp */
export async function checkNumbers(deviceId: number, phones: string[]): Promise<Array<{ phone: string; exists: boolean; jid?: string }>> {
  const state = sessions.get(deviceId);
  if (!state?.socket) throw new Error("Perangkat tidak terhubung");
  const cleaned = phones.map((p) => p.replace(/\D/g, "").replace(/^0/, "62"));
  const results = await state.socket.onWhatsApp(...cleaned);
  const existMap = new Map((results ?? []).map((r: any) => [r.jid.split("@")[0], r]));
  return cleaned.map((p, i) => {
    const found = existMap.get(p);
    return { phone: phones[i], exists: !!found, jid: found ? (found as any).jid : undefined };
  });
}

/** Kirim pesan ke grup WhatsApp */
export async function sendToGroup(deviceId: number, groupId: string, content: any): Promise<string | null> {
  const state = sessions.get(deviceId);
  if (!state?.socket || state.status !== "connected") throw new Error("Perangkat tidak terhubung");
  const jid = groupId.endsWith("@g.us") ? groupId : `${groupId}@g.us`;
  const sent = await state.socket.sendMessage(jid, content);
  return sent?.key?.id ?? null;
}

export async function restoreActiveSessions(): Promise<void> {
  // Start reminder cron for WA Center Bot
  startReminderCron();

  try {
    const devices = await db.select().from(devicesTable).where(eq(devicesTable.autoReconnect, true));
    for (const device of devices) {
      const sessionDir = getSessionDir(device.id);
      if (fs.existsSync(sessionDir) && fs.readdirSync(sessionDir).length > 0) {
        console.log(`[WA] Restoring session for device ${device.id} (${device.name})`);
        setTimeout(() => startSession(device.id), 1000 * device.id);
      }
    }
  } catch (e) {
    console.error("[WA] Failed to restore sessions:", e);
  }
}
