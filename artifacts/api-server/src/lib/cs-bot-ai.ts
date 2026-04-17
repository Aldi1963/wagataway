import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { db, settingsTable, plansTable, usersTable, botProductsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// ── Platform config helpers ───────────────────────────────────────────────────

async function getAdminApiKey(): Promise<string | null> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "openai_api_key"));
  return row?.value || null;
}

async function getDefaultModel(): Promise<string> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "openai_default_model"));
  return row?.value || "gpt-4o-mini";
}

async function getAiBaseUrl(): Promise<string | undefined> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, "ai_base_url"));
  return row?.value || undefined;
}

export async function getUserAiKey(userId: number, provider?: AiProvider): Promise<string | null> {
  const [user] = await db
    .select({ openaiApiKey: usersTable.openaiApiKey, aiSettings: usersTable.aiSettings })
    .from(usersTable)
    .where(eq(usersTable.id, userId));
  if (!user) return null;

  const settings = typeof user.aiSettings === "string" ? JSON.parse(user.aiSettings) : user.aiSettings;
  const targetProvider = provider ?? settings?.provider ?? "openai";

  // Legacy fallback for OpenAI
  if (targetProvider === "openai" && user.openaiApiKey) return user.openaiApiKey;

  // Key from JSON settings
  return settings?.keys?.[targetProvider] || null;
}

export async function checkUserPlanAllowsAi(userId: number): Promise<boolean> {
  const [user] = await db.select({ plan: usersTable.plan }).from(usersTable).where(eq(usersTable.id, userId));
  if (!user?.plan) return false;
  const [plan] = await db.select({ aiCsBotEnabled: plansTable.aiCsBotEnabled })
    .from(plansTable)
    .where(eq(plansTable.slug, user.plan));
  return plan?.aiCsBotEnabled ?? false;
}

export interface AiAccessInfo {
  allowed: boolean;
  source: "own_key" | "plan" | "none";
  hasOwnKey: boolean;
  keyPrefix: string | null;
}

export async function checkAiAccess(userId: number): Promise<AiAccessInfo> {
  const [user] = await db.select({ aiSettings: usersTable.aiSettings, openaiApiKey: usersTable.openaiApiKey }).from(usersTable).where(eq(usersTable.id, userId));
  const settings = typeof user?.aiSettings === "string" ? JSON.parse(user.aiSettings) : user?.aiSettings;
  const provider = settings?.provider ?? "openai";
  
  let ownKey = settings?.keys?.[provider] || (provider === "openai" ? user?.openaiApiKey : null);
  
  if (ownKey) {
    return {
      allowed: true,
      source: "own_key",
      hasOwnKey: true,
      keyPrefix: ownKey.slice(0, 7) + "···" + ownKey.slice(-4),
    };
  }
  const planAllows = await checkUserPlanAllowsAi(userId);
  if (planAllows) {
    const adminKey = await getAdminApiKey();
    if (adminKey) {
      return { allowed: true, source: "plan", hasOwnKey: false, keyPrefix: "Platform Key (Admin)" };
    }
  }
  return { allowed: false, source: "none", hasOwnKey: false, keyPrefix: null };
}

export async function getEffectiveAiKey(userId: number, provider: AiProvider = "openai"): Promise<string | null> {
  // 1. Check User's own key
  const userKey = await getUserAiKey(userId, provider);
  if (userKey) return userKey;

  // 2. Check Plan Eligibility
  const planAllows = await checkUserPlanAllowsAi(userId);
  if (planAllows) {
    // Return Admin Key
    if (provider === "openai" || provider === "platform") {
      return await getAdminApiKey();
    }
  }

  return null;
}

// ── Provider config ────────────────────────────────────────────────────────────

export type AiProvider =
  | "platform"
  | "openai"
  | "anthropic"
  | "gemini"
  | "groq"
  | "openrouter"
  | "deepseek"
  | "mistral";

const PROVIDER_BASE_URLS: Partial<Record<AiProvider, string>> = {
  openai: undefined, // uses default
  groq: "https://api.groq.com/openai/v1",
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/",
  openrouter: "https://openrouter.ai/api/v1",
  deepseek: "https://api.deepseek.com/v1",
  mistral: "https://api.mistral.ai/v1",
};

// ── Context ───────────────────────────────────────────────────────────────────

export interface AiBotContext {
  botName: string;
  systemPrompt: string;
  businessContext: string;
  websiteContent: string;
  model: string;
  maxTokens: number;
  faqs: Array<{ question: string; answer: string; category: string }>;
  // Provider override per-bot
  provider?: AiProvider;
  providerApiKey?: string;
  deviceId?: number;
  catalog?: string;
}

// ── Build system prompt ───────────────────────────────────────────────────────

function buildSystemPrompt(ctx: AiBotContext): string {
  const faqBlock =
    ctx.faqs.length > 0
      ? `\n\nDatabase FAQ & Jawaban:\n${ctx.faqs
          .map((f) => `Pertanyaan: ${f.question}\nJawaban: ${f.answer}`)
          .join("\n\n")}`
      : "";

  const businessBlock = ctx.businessContext
    ? `\n\nKonteks Bisnis:\n${ctx.businessContext}`
    : "";

  const websiteBlock = ctx.websiteContent?.trim()
    ? `\n\nInformasi Tambahan dari Website:\n${ctx.websiteContent.slice(0, 3000)}`
    : "";

  const catalogBlock = ctx.catalog
    ? `\n\nKatalog Produk Aktif:\n${ctx.catalog}\n\nInstruksi Produk: Jika pelanggan bertanya tentang harga atau ketersediaan produk, berikan informasi dari katalog di atas secara akurat. Jika ada kode produk, sebutkan kodenya.`
    : "";

  return (
    `Kamu adalah ${ctx.botName}. ${ctx.systemPrompt}\n\n` +
    `Ikuti panduan tambahan berikut:\n` +
    `1. Gunakan bahasa Indonesia yang santai tapi tetap sopan (semi-formal).\n` +
    `2. Jawablah secara singkat dan padat (maksimal 3 kalimat).\n` +
    `3. Gunakan emoji sesekali agar terkesan ramah (seperti 😊, 🙏, ✨).\n` +
    `4. Utamakan menjawab berdasarkan informasi Bisnis, FAQ, dan Katalog yang disediakan di bawah.\n` +
    `5. Jika informasi tidak ditemukan atau pertanyaan terlalu teknis/rumit, sampaikan bahwa kamu akan menghubungkan mereka dengan agen manusia kami. JANGAN memberikan informasi palsu.` +
    `${businessBlock}${websiteBlock}${faqBlock}${catalogBlock}\n\n` +
    `Ingat, nama kamu adalah ${ctx.botName}. Tetaplah pada persona ini.`
  );
}

// ── Anthropic handler ─────────────────────────────────────────────────────────

async function callAnthropic(
  apiKey: string,
  model: string,
  maxTokens: number,
  systemPrompt: string,
  userMessage: string,
): Promise<string | null> {
  const client = new Anthropic({ apiKey });
  const resp = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
  });
  const block = resp.content[0];
  return block?.type === "text" ? block.text.trim() : null;
}

// ── OpenAI-compatible handler ─────────────────────────────────────────────────

async function callOpenAICompat(
  apiKey: string,
  model: string,
  maxTokens: number,
  systemPrompt: string,
  userMessage: string,
  baseURL?: string,
  extraHeaders?: Record<string, string>,
): Promise<string | null> {
  const client = new OpenAI({ apiKey, ...(baseURL ? { baseURL } : {}), defaultHeaders: extraHeaders });
  const resp = await client.chat.completions.create({
    model,
    max_completion_tokens: maxTokens,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
  });
  return resp.choices[0]?.message?.content?.trim() ?? null;
}

export async function generateConversationSummary(
  userId: number,
  messages: { fromMe: boolean; text: string | null; contactName: string | null }[]
): Promise<string | null> {
  const apiKey = await getEffectiveAiKey(userId, "openai");
  if (!apiKey) return null;

  const history = messages
    .map((m) => `${m.fromMe ? "Agen" : (m.contactName || "Pelanggan")}: ${m.text || "[Media/Pesan Kosong]"}`)
    .join("\n");

  const systemPrompt = `Kamu adalah asisten profesional. Tugasmu adalah merangkum percakapan WhatsApp antara pelanggan dan agen CS.
Rangkuman harus sangat singkat (maksimal 3-5 poin), bahasa Indonesia yang sopan, dan fokus pada:
1. Masalah utama pelanggan.
2. Status terakhir (apakah sudah selesai atau masih perlu bantuan).
3. Informasi penting lainnya (nomor order, alamat, dll jika ada).`;

  const userMessage = `Berikut adalah transkrip percakapan:\n\n${history}\n\nBerikan rangkuman poin-poin.`;

  try {
    return await callOpenAICompat(apiKey, "gpt-4o-mini", 300, systemPrompt, userMessage);
  } catch (err) {
    console.error("[cs-bot-ai] Failed to generate summary:", err);
    return null;
  }
}

// ── Main entry point ──────────────────────────────────────────────────────────

export async function generateAiReply(
  incomingMsg: string,
  ctx: AiBotContext,
  userId?: number,
): Promise<string | null> {
  const provider: AiProvider = ctx.provider ?? "platform";

  // Build catalog context if deviceId is provided
  if (ctx.deviceId) {
    const products = await db.select({ name: botProductsTable.name, price: botProductsTable.price, code: botProductsTable.code, stock: botProductsTable.stock })
      .from(botProductsTable)
      .where(and(eq(botProductsTable.userId, userId!), eq(botProductsTable.deviceId, ctx.deviceId), eq(botProductsTable.isActive, true)));
    
    if (products.length > 0) {
      ctx.catalog = products.map(p => `- ${p.name} [Kode: ${p.code}] - Harga: Rp${Number(p.price).toLocaleString('id-ID')} (Stok: ${p.stock ?? 'Tersedia'})`).join('\n');
    }
  }

  const systemPrompt = buildSystemPrompt(ctx);
  const maxTokens = ctx.maxTokens;

  // ── Key Resolution ────────────────────────────────────────────────────────
  let apiKey: string | null = null;
  if (provider !== "platform" && ctx.providerApiKey?.trim()) {
    apiKey = ctx.providerApiKey.trim();
  } else if (userId) {
    apiKey = await getEffectiveAiKey(userId, provider === "platform" ? "openai" : provider);
  }

  if (!apiKey) {
    console.warn(`[cs-bot-ai] No API key available for ${provider} — AI reply skipped`);
    return null;
  }

  const model = ctx.model || (provider === "platform" ? await getDefaultModel() : "gpt-4o-mini");

  try {
    if (provider === "anthropic") {
      return await callAnthropic(apiKey, model, maxTokens, systemPrompt, incomingMsg);
    }
    const baseURL = (provider === "platform") ? await getAiBaseUrl() : PROVIDER_BASE_URLS[provider];
    return await callOpenAICompat(apiKey, model, maxTokens, systemPrompt, incomingMsg, baseURL);
  } catch (err) {
    console.error(`[cs-bot-ai] Error calling ${provider}:`, err);
    return null;
  }
}
