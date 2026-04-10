import { Router, type IRouter } from "express";
import { db, csBotsTable, csBotFaqsTable, devicesTable, usersTable, csBotKnowledgeTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getUserFromToken } from "./auth";
import { generateAiReply, checkAiAccess } from "../lib/cs-bot-ai";
import { isConvBotPaused, pauseConvBot } from "./chat";
import { handleOrderFlow } from "../lib/bot-order-flow";

export interface BotReply {
  text: string;
  mediaUrl?: string | null;
  mediaCaption?: string | null;
  handoff?: boolean;
}

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

// ── helpers ───────────────────────────────────────────────────────────────────

function matchesKeywords(msg: string, keywords: string, matchType: string): boolean {
  const lower = msg.toLowerCase().trim();
  const kws = keywords.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  if (matchType === "exact") return kws.some((k) => lower === k);
  if (matchType === "startsWith") return kws.some((k) => lower.startsWith(k));
  return kws.some((k) => lower.includes(k));
}

function isWithinBusinessHours(
  businessHoursStart: string,
  businessHoursEnd: string,
  businessDays: string,
  timezone: string = "Asia/Jakarta",
): boolean {
  const tz = timezone && timezone.trim() !== "" ? timezone.trim() : "Asia/Jakarta";
  const now = new Date();

  // Konversi ke waktu lokal timezone yang benar
  const local = new Date(now.toLocaleString("en-US", { timeZone: tz }));
  const dayOfWeek = local.getDay(); // 0=Minggu, 1=Senin, ... 6=Sabtu
  const nowMinutes = local.getHours() * 60 + local.getMinutes();

  const days = businessDays.split(",").map(Number).filter((n) => !isNaN(n));
  if (!days.includes(dayOfWeek)) return false;

  const toMin = (t: string): number => {
    const [h, m] = t.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };

  const startMinutes = toMin(businessHoursStart);
  const rawEnd = toMin(businessHoursEnd);
  // "00:00" sebagai end time = akhir hari penuh (midnight = 1440)
  const endMinutes = rawEnd === 0 ? 1440 : rawEnd;

  if (startMinutes <= endMinutes) {
    // Normal range: 08:00 – 17:00 atau 08:00 – 00:00 (seharian)
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  } else {
    // Melewati midnight: 22:00 – 06:00
    return nowMinutes >= startMinutes || nowMinutes < endMinutes;
  }
}

// ── AI modes ──────────────────────────────────────────────────────────────────
// ai_mode values:
//   "faq_only"    — no AI, classic keyword matching only
//   "ai_fallback" — FAQ first, then AI if no match
//   "full_ai"     — skip FAQ, always use AI (with FAQ as context)

export async function processBotMessage(
  deviceId: number,
  userId: number,
  senderPhone: string,
  incomingMsg: string,
  contactName?: string,
): Promise<BotReply | null> {
  const [bot] = await db.select().from(csBotsTable).where(
    and(eq(csBotsTable.deviceId, deviceId), eq(csBotsTable.userId, userId))
  );
  if (!bot || !bot.isEnabled) return null;

  const lang = (bot.language ?? "id") as "id" | "en";

  // ── Order flow — check first (before FAQ/AI matching) ────────────────────
  try {
    const cleanPhone = senderPhone.replace(/[@:].*$/, "");
    const orderReply = await handleOrderFlow(userId, deviceId, cleanPhone, incomingMsg);
    if (orderReply !== null) return { text: orderReply };
  } catch (err) {
    console.error("[cs-bot] Order flow error:", err);
  }

  // If an agent has taken over this conversation, pause the bot
  const jid = senderPhone.includes("@") ? senderPhone : `${senderPhone}@s.whatsapp.net`;
  const paused = await isConvBotPaused(userId, deviceId, jid);
  if (paused) return null;

  if (bot.businessHoursEnabled) {
    const online = isWithinBusinessHours(bot.businessHoursStart, bot.businessHoursEnd, bot.businessDays);
    if (!online) return { text: bot.offlineMessage };
  }

  const lower = incomingMsg.toLowerCase().trim();
  const trimmed = incomingMsg.trim();

  // Greetings
  if (["hi","halo","hello","hai","mulai","start"].includes(lower)) {
    return { text: bot.greetingMessage + (bot.showMenu ? "\n\n" + bot.menuMessage : "") };
  }

  // Menu shortcut
  if (lower === "menu" || lower === "0") {
    return { text: bot.menuMessage };
  }

  // ── Human handoff ─────────────────────────────────────────────────────────
  const handoffKws = bot.humanHandoffKeyword.split(",").map((k) => k.trim().toLowerCase()).filter(Boolean);
  const isHandoffMsg = handoffKws.some((k) => lower.includes(k));

  if (isHandoffMsg) {
    // Auto-pause bot and set conversation to pending for human agent
    try {
      await pauseConvBot(userId, deviceId, jid, contactName);
    } catch (err) {
      console.error("[cs-bot] pauseConvBot error:", err);
    }
    return { text: bot.humanHandoffMessage, handoff: true };
  }

  // ── Menu number handling ──────────────────────────────────────────────────
  if (/^\d+$/.test(trimmed)) {
    const selectedNum = parseInt(trimmed, 10);
    const menuLines = bot.menuMessage.split("\n");
    let selectedLabel = "";
    for (const line of menuLines) {
      const match = line.match(/^(\d+)[.)]\s*(.+)/);
      if (match && parseInt(match[1]!, 10) === selectedNum) {
        selectedLabel = match[2]!.toLowerCase();
        break;
      }
    }

    if (selectedLabel) {
      const isHandoff = handoffKws.some((k) => selectedLabel.includes(k)) ||
        ["agen", "cs", "operator", "manusia", "human", "admin"].some((k) => selectedLabel.includes(k));
      if (isHandoff) {
        try { await pauseConvBot(userId, deviceId, jid, contactName); } catch {}
        return { text: bot.humanHandoffMessage, handoff: true };
      }
    }
  }

  // Load FAQs
  const faqs = await db.select().from(csBotFaqsTable).where(
    and(eq(csBotFaqsTable.deviceId, deviceId), eq(csBotFaqsTable.isActive, true))
  ).orderBy(csBotFaqsTable.sortOrder, csBotFaqsTable.id);

  // Load Knowledge base
  const kbRows = await db.select().from(csBotKnowledgeTable).where(
    and(eq(csBotKnowledgeTable.botId, bot.id), eq(csBotKnowledgeTable.isActive, true))
  );
  const kbContent = kbRows.map((k) => `### ${k.title}\n${k.content}`).join("\n\n");

  const aiMode = bot.aiMode ?? "faq_only";
  const botProvider = (bot.aiProvider as any) ?? "platform";
  const botApiKey = bot.aiApiKey ?? "";

  // Language-aware system prompt
  const langInstruction = lang === "en"
    ? "Always respond in English."
    : "Gunakan bahasa Indonesia yang baik dan sopan.";
  const systemPromptWithLang = `${bot.aiSystemPrompt}\n${langInstruction}`;

  const aiCtx = {
    botName: bot.botName,
    systemPrompt: systemPromptWithLang,
    businessContext: (bot.aiBusinessContext ?? "") + (kbContent ? "\n\nKnowledge Base:\n" + kbContent : ""),
    websiteContent: bot.websiteContent ?? "",
    model: bot.aiModel,
    maxTokens: bot.aiMaxTokens,
    faqs: faqs.map((f) => ({ question: f.question, answer: f.answer, category: f.category })),
    provider: botProvider,
    providerApiKey: botApiKey,
  };

  const hasBotOwnKey = botProvider !== "platform" && botApiKey.trim().length > 0;
  const aiAccess = bot.aiEnabled
    ? (hasBotOwnKey ? { allowed: true } : await checkAiAccess(userId))
    : { allowed: false };

  // ── Mode: full_ai ─────────────────────────────────────────────────────────
  if (aiMode === "full_ai" && aiAccess.allowed) {
    const aiReply = await generateAiReply(incomingMsg, aiCtx, userId);
    if (aiReply) return { text: aiReply };
  }

  // ── FAQ keyword matching ──────────────────────────────────────────────────
  for (const faq of faqs) {
    if (matchesKeywords(incomingMsg, faq.keywords, faq.matchType)) {
      await db.update(csBotFaqsTable)
        .set({ triggerCount: sql`${csBotFaqsTable.triggerCount} + 1` })
        .where(eq(csBotFaqsTable.id, faq.id));
      return {
        text: faq.answer,
        mediaUrl: faq.mediaUrl ?? null,
        mediaCaption: faq.mediaCaption ?? null,
      };
    }
  }

  // ── Mode: ai_fallback ─────────────────────────────────────────────────────
  if (aiMode === "ai_fallback" && aiAccess.allowed) {
    const aiReply = await generateAiReply(incomingMsg, aiCtx, userId);
    return { text: aiReply ?? bot.fallbackMessage };
  }

  return { text: bot.fallbackMessage };
}

// ── GET /cs-bot/ai-access — MUST be before /:deviceId to avoid route conflict ─
router.get("/cs-bot/ai-access", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const info = await checkAiAccess(uid);
  res.json(info);
});

// ── GET /cs-bot/my-ai-key — returns masked key info ──────────────────────────
router.get("/cs-bot/my-ai-key", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const info = await checkAiAccess(uid);
  res.json({ hasKey: info.hasOwnKey, keyPrefix: info.keyPrefix });
});

// ── PUT /cs-bot/my-ai-key — save user's own OpenAI key ───────────────────────
router.put("/cs-bot/my-ai-key", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { apiKey } = req.body as { apiKey?: string };
  if (!apiKey || typeof apiKey !== "string" || !apiKey.startsWith("sk-")) {
    res.status(400).json({ message: "API key tidak valid. Harus diawali dengan 'sk-'" });
    return;
  }
  await db.update(usersTable).set({ openaiApiKey: apiKey.trim() }).where(eq(usersTable.id, uid));
  res.json({ ok: true, keyPrefix: apiKey.slice(0, 7) + "···" + apiKey.slice(-4) });
});

// ── DELETE /cs-bot/my-ai-key — remove user's own OpenAI key ──────────────────
router.delete("/cs-bot/my-ai-key", async (req, res): Promise<void> => {
  const uid = getUser(req);
  await db.update(usersTable).set({ openaiApiKey: null }).where(eq(usersTable.id, uid));
  res.json({ ok: true });
});

// ── GET /cs-bot — list all bot configs for user devices ──────────────────────
router.get("/cs-bot", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const devices = await db.select().from(devicesTable).where(eq(devicesTable.userId, uid));
  const bots = await db.select().from(csBotsTable).where(eq(csBotsTable.userId, uid));
  const botMap = new Map(bots.map((b) => [b.deviceId, b]));

  const result = devices.map((d) => ({
    device: { id: d.id, name: d.name, phone: d.phone, status: d.status },
    bot: botMap.get(d.id) ?? null,
  }));
  res.json(result);
});

// ── GET /cs-bot/:deviceId ─────────────────────────────────────────────────────
router.get("/cs-bot/:deviceId", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const deviceId = Number(req.params.deviceId);
  if (isNaN(deviceId)) {
    res.status(400).json({ message: "deviceId tidak valid" });
    return;
  }
  const [bot] = await db.select().from(csBotsTable).where(
    and(eq(csBotsTable.deviceId, deviceId), eq(csBotsTable.userId, uid))
  );
  res.json(bot ?? null);
});

// ── PUT /cs-bot/:deviceId ─────────────────────────────────────────────────────
router.put("/cs-bot/:deviceId", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const deviceId = Number(req.params.deviceId);
  if (isNaN(deviceId)) {
    res.status(400).json({ message: "deviceId tidak valid" });
    return;
  }
  const [existing] = await db.select().from(csBotsTable).where(
    and(eq(csBotsTable.deviceId, deviceId), eq(csBotsTable.userId, uid))
  );

  const allowed = [
    "isEnabled", "botName", "greetingMessage", "fallbackMessage", "offlineMessage",
    "menuMessage", "businessHoursEnabled", "businessHoursStart", "businessHoursEnd",
    "businessDays", "humanHandoffKeyword", "humanHandoffMessage", "sessionTimeoutMinutes", "showMenu",
    // AI fields
    "aiEnabled", "aiMode", "aiModel", "aiSystemPrompt", "aiBusinessContext", "aiMaxTokens",
    // AI provider override
    "aiProvider", "aiApiKey",
    // Website knowledge base
    "websiteUrl",
  ];
  const data: any = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];

  let bot;
  if (existing) {
    [bot] = await db.update(csBotsTable).set(data).where(eq(csBotsTable.id, existing.id)).returning();
  } else {
    [bot] = await db.insert(csBotsTable).values({ userId: uid, deviceId, ...data }).returning();
  }
  res.json(bot);
});

// ── Knowledge Base Endpoints ──────────────────────────────────────────────────

router.get("/cs-bot/:deviceId/knowledge", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const deviceId = Number(req.params.deviceId);
  const [bot] = await db.select().from(csBotsTable).where(and(eq(csBotsTable.deviceId, deviceId), eq(csBotsTable.userId, uid)));
  if (!bot) { res.status(404).json({ message: "Bot tidak ditemukan" }); return; }
  const knowledge = await db.select().from(csBotKnowledgeTable).where(eq(csBotKnowledgeTable.botId, bot.id)).orderBy(sql`${csBotKnowledgeTable.createdAt} DESC`);
  res.json(knowledge);
});

router.post("/cs-bot/:deviceId/knowledge", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const deviceId = Number(req.params.deviceId);
  const { title, content, sourceType } = req.body;
  if (!title || !content) { res.status(400).json({ message: "Judul dan konten wajib diisi" }); return; }
  const [bot] = await db.select().from(csBotsTable).where(and(eq(csBotsTable.deviceId, deviceId), eq(csBotsTable.userId, uid)));
  if (!bot) { res.status(404).json({ message: "Bot tidak ditemukan" }); return; }
  const [item] = await db.insert(csBotKnowledgeTable).values({
    userId: uid, botId: bot.id, title, content, sourceType: sourceType ?? "manual", charCount: content.length,
  }).returning();
  res.status(201).json(item);
});

router.put("/cs-bot/:deviceId/knowledge/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = Number(req.params.id);
  const { title, content, isActive } = req.body;
  const data: any = {};
  if (title !== undefined) data.title = title;
  if (content !== undefined) { data.content = content; data.charCount = content.length; }
  if (isActive !== undefined) data.isActive = isActive;
  const [item] = await db.update(csBotKnowledgeTable).set(data).where(and(eq(csBotKnowledgeTable.id, id), eq(csBotKnowledgeTable.userId, uid))).returning();
  if (!item) { res.status(404).json({ message: "Tidak ditemukan" }); return; }
  res.json(item);
});

router.delete("/cs-bot/:deviceId/knowledge/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = Number(req.params.id);
  await db.delete(csBotKnowledgeTable).where(and(eq(csBotKnowledgeTable.id, id), eq(csBotKnowledgeTable.userId, uid)));
  res.json({ ok: true });
});

// ── GET /cs-bot/:deviceId/faqs ────────────────────────────────────────────────
router.get("/cs-bot/:deviceId/faqs", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const deviceId = Number(req.params.deviceId);
  const faqs = await db.select().from(csBotFaqsTable).where(
    and(eq(csBotFaqsTable.deviceId, deviceId), eq(csBotFaqsTable.userId, uid))
  ).orderBy(csBotFaqsTable.sortOrder, csBotFaqsTable.id);
  res.json(faqs);
});

// ── POST /cs-bot/:deviceId/faqs ───────────────────────────────────────────────
router.post("/cs-bot/:deviceId/faqs", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const deviceId = Number(req.params.deviceId);
  const { category, question, keywords, answer, matchType, sortOrder } = req.body;
  if (!question || !keywords || !answer) {
    res.status(400).json({ message: "Pertanyaan, kata kunci, dan jawaban wajib diisi" }); return;
  }
  const [faq] = await db.insert(csBotFaqsTable).values({
    userId: uid, deviceId,
    category: category ?? "Umum", question, keywords, answer,
    matchType: matchType ?? "contains", sortOrder: sortOrder ?? 0,
  }).returning();
  res.status(201).json(faq);
});

// ── PUT /cs-bot/:deviceId/faqs/:id ───────────────────────────────────────────
router.put("/cs-bot/:deviceId/faqs/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = Number(req.params.id);
  const { category, question, keywords, answer, matchType, sortOrder, isActive } = req.body;
  const [faq] = await db.update(csBotFaqsTable)
    .set({ category, question, keywords, answer, matchType, sortOrder, isActive })
    .where(and(eq(csBotFaqsTable.id, id), eq(csBotFaqsTable.userId, uid)))
    .returning();
  if (!faq) { res.status(404).json({ message: "Tidak ditemukan" }); return; }
  res.json(faq);
});

// ── DELETE /cs-bot/:deviceId/faqs/:id ────────────────────────────────────────
router.delete("/cs-bot/:deviceId/faqs/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = Number(req.params.id);
  await db.delete(csBotFaqsTable).where(and(eq(csBotFaqsTable.id, id), eq(csBotFaqsTable.userId, uid)));
  res.json({ ok: true });
});

// ── POST /cs-bot/:deviceId/scrape-website — fetch & cache website content ─────
router.post("/cs-bot/:deviceId/scrape-website", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const deviceId = Number(req.params.deviceId);

  const [bot] = await db.select().from(csBotsTable).where(
    and(eq(csBotsTable.deviceId, deviceId), eq(csBotsTable.userId, uid))
  );
  if (!bot) { res.status(404).json({ message: "Bot tidak ditemukan" }); return; }

  const url = (req.body.url ?? bot.websiteUrl ?? "").trim();
  if (!url) { res.status(400).json({ message: "URL website wajib diisi" }); return; }

  // Validate URL
  let parsedUrl: URL;
  try { parsedUrl = new URL(url); } catch {
    res.status(400).json({ message: "URL tidak valid" }); return;
  }
  if (!["http:", "https:"].includes(parsedUrl.protocol)) {
    res.status(400).json({ message: "Hanya HTTP/HTTPS yang diperbolehkan" }); return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const response = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "WA-Gateway-Bot/1.0 (Knowledge Base Scraper)" },
    });
    clearTimeout(timer);

    if (!response.ok) {
      res.status(400).json({ message: `Gagal mengambil halaman: HTTP ${response.status}` }); return;
    }

    const html = await response.text();

    // Strip HTML tags, scripts, styles — extract readable text
    const text = html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/\s{2,}/g, " ")
      .trim()
      .slice(0, 8000); // cap at 8000 chars to keep context reasonable

    // Save URL + content to DB
    await db.update(csBotsTable)
      .set({ websiteUrl: url, websiteContent: text, websiteContentUpdatedAt: new Date() })
      .where(eq(csBotsTable.id, bot.id));

    res.json({
      ok: true,
      charCount: text.length,
      preview: text.slice(0, 300),
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    if (err.name === "AbortError") {
      res.status(408).json({ message: "Timeout: website tidak merespons dalam 10 detik" });
    } else {
      res.status(500).json({ message: `Gagal mengambil konten: ${err.message}` });
    }
  }
});

// ── POST /cs-bot/:deviceId/test ───────────────────────────────────────────────
router.post("/cs-bot/:deviceId/test", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const deviceId = Number(req.params.deviceId);
  const { message } = req.body;
  if (!message) { res.status(400).json({ message: "Pesan wajib diisi" }); return; }
  const reply = await processBotMessage(deviceId, uid, "test", message);
  res.json({ reply: reply ?? "(Bot tidak aktif atau tidak ada jawaban yang cocok)" });
});

// ── POST /cs-bot/receive — simulate receiving a message ───────────────────────
router.post("/cs-bot/receive", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { deviceId, phone, message } = req.body;
  if (!deviceId || !phone || !message) {
    res.status(400).json({ message: "deviceId, phone, dan message wajib diisi" }); return;
  }
  const reply = await processBotMessage(Number(deviceId), uid, phone, message);
  res.json({ reply, handled: !!reply });
});

export default router;
