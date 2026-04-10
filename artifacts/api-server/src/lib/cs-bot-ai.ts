import OpenAI from "openai";
import Anthropic from "@anthropic-ai/sdk";
import { db, settingsTable, plansTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";

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

export async function getUserOpenaiKey(userId: number): Promise<string | null> {
  const [user] = await db.select({ openaiApiKey: usersTable.openaiApiKey }).from(usersTable).where(eq(usersTable.id, userId));
  return user?.openaiApiKey || null;
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
  const ownKey = await getUserOpenaiKey(userId);
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
    return { allowed: true, source: "plan", hasOwnKey: false, keyPrefix: null };
  }
  return { allowed: false, source: "none", hasOwnKey: false, keyPrefix: null };
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
}

// ── Build system prompt ───────────────────────────────────────────────────────

function buildSystemPrompt(ctx: AiBotContext): string {
  const faqBlock =
    ctx.faqs.length > 0
      ? `\n\nDatabase FAQ yang tersedia:\n${ctx.faqs
          .map((f) => `Q: ${f.question}\nA: ${f.answer}`)
          .join("\n\n")}`
      : "";

  const businessBlock = ctx.businessContext
    ? `\n\nInformasi bisnis:\n${ctx.businessContext}`
    : "";

  const websiteBlock = ctx.websiteContent?.trim()
    ? `\n\nKonten website bisnis (gunakan sebagai referensi untuk menjawab pertanyaan):\n${ctx.websiteContent.slice(0, 3000)}`
    : "";

  return (
    `${ctx.systemPrompt}${businessBlock}${websiteBlock}${faqBlock}\n\n` +
    `Nama bot kamu: ${ctx.botName}. ` +
    `Jawab dalam 1-3 kalimat singkat. ` +
    `Jika tidak tahu jawabannya, sarankan pelanggan untuk menghubungi agen manusia.`
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

// ── Main entry point ──────────────────────────────────────────────────────────

export async function generateAiReply(
  incomingMsg: string,
  ctx: AiBotContext,
  userId?: number,
): Promise<string | null> {
  const provider: AiProvider = ctx.provider ?? "platform";
  const systemPrompt = buildSystemPrompt(ctx);
  const maxTokens = ctx.maxTokens;

  // ── Per-bot custom API key ────────────────────────────────────────────────
  if (provider !== "platform" && ctx.providerApiKey?.trim()) {
    const apiKey = ctx.providerApiKey.trim();
    const model = ctx.model;

    try {
      if (provider === "anthropic") {
        return await callAnthropic(apiKey, model, maxTokens, systemPrompt, incomingMsg);
      }
      const baseURL = PROVIDER_BASE_URLS[provider];
      const extraHeaders =
        provider === "openrouter"
          ? { "HTTP-Referer": "https://wagateway.app", "X-Title": "WA Gateway CS Bot" }
          : undefined;
      return await callOpenAICompat(apiKey, model, maxTokens, systemPrompt, incomingMsg, baseURL, extraHeaders);
    } catch (err) {
      console.error(`[cs-bot-ai] Error calling ${provider}:`, err);
      return null;
    }
  }

  // ── Platform / user-level OpenAI key fallback ─────────────────────────────
  let apiKey: string | null = null;
  if (userId) {
    apiKey = await getUserOpenaiKey(userId);
  }
  if (!apiKey) {
    apiKey = await getAdminApiKey();
  }
  if (!apiKey) {
    console.warn("[cs-bot-ai] No API key available — AI reply skipped");
    return null;
  }

  const defaultModel = await getDefaultModel();
  const model = ctx.model || defaultModel;
  const baseURL = await getAiBaseUrl();

  try {
    return await callOpenAICompat(apiKey, model, maxTokens, systemPrompt, incomingMsg, baseURL);
  } catch (err) {
    console.error("[cs-bot-ai] Error calling platform AI:", err);
    return null;
  }
}
