import { Router, type IRouter } from "express";
import { db, pluginsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getUserFromToken } from "./auth";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

const PLUGIN_TYPES = [
  {
    type: "openai",
    name: "OpenAI ChatGPT",
    description: "Integrasikan ChatGPT sebagai asisten auto-reply cerdas",
    icon: "🤖",
    configSchema: { apiKey: "", model: "gpt-4o-mini", systemPrompt: "You are a helpful WhatsApp assistant.", maxTokens: 500, triggerKeywords: [] },
  },
  {
    type: "gemini",
    name: "Google Gemini AI",
    description: "Gunakan Gemini AI untuk membalas pesan secara cerdas",
    icon: "✨",
    configSchema: { apiKey: "", model: "gemini-2.0-flash", systemPrompt: "You are a helpful WhatsApp assistant.", maxTokens: 500, triggerKeywords: [] },
  },
  {
    type: "claude",
    name: "Anthropic Claude AI",
    description: "Claude AI untuk percakapan yang lebih natural dan aman",
    icon: "🧠",
    configSchema: { apiKey: "", model: "claude-3-5-haiku-20241022", systemPrompt: "You are a helpful WhatsApp assistant.", maxTokens: 500, triggerKeywords: [] },
  },
  {
    type: "botsticker",
    name: "Bot Sticker",
    description: "Kirim stiker otomatis berdasarkan kata kunci pesan",
    icon: "🎨",
    configSchema: { stickerPackUrl: "", triggerKeywords: ["sticker", "stiker"], autoConvertImages: false },
  },
  {
    type: "spreadsheet",
    name: "Google Spreadsheet",
    description: "Simpan & baca data pesan dari Google Sheets",
    icon: "📊",
    configSchema: { spreadsheetId: "", sheetName: "Messages", googleApiKey: "", logIncoming: true, logOutgoing: true },
  },
];

function fmt(p: any) {
  const meta = PLUGIN_TYPES.find((t) => t.type === p.type);
  const config = { ...(p.config ?? {}) };
  if (config.apiKey) config.apiKey = config.apiKey.slice(0, 8) + "••••••••";
  if (config.googleApiKey) config.googleApiKey = config.googleApiKey.slice(0, 8) + "••••••••";
  return {
    id: String(p.id),
    type: p.type,
    name: p.name,
    description: meta?.description ?? "",
    icon: meta?.icon ?? "🔌",
    config,
    isActive: p.isActive,
    createdAt: p.createdAt?.toISOString(),
    updatedAt: p.updatedAt?.toISOString(),
  };
}

router.get("/plugins", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rows = await db.select().from(pluginsTable).where(eq(pluginsTable.userId, uid));

  const existing = rows.reduce((acc, r) => { acc[r.type] = r; return acc; }, {} as Record<string, any>);

  const result = PLUGIN_TYPES.map((pt) => {
    const row = existing[pt.type];
    if (row) return fmt(row);
    return {
      id: null,
      type: pt.type,
      name: pt.name,
      description: pt.description,
      icon: pt.icon,
      config: pt.configSchema,
      isActive: false,
      createdAt: null,
      updatedAt: null,
    };
  });

  res.json(result);
});

router.get("/plugins/types", async (_req, res): Promise<void> => {
  res.json(PLUGIN_TYPES);
});

router.put("/plugins/:type", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { type } = req.params;
  const { config, isActive, name } = req.body;

  const pluginMeta = PLUGIN_TYPES.find((p) => p.type === type);
  if (!pluginMeta) { res.status(400).json({ message: "Unknown plugin type" }); return; }

  const existing = await db.select().from(pluginsTable).where(and(eq(pluginsTable.userId, uid), eq(pluginsTable.type, type)));

  const mergedConfig = { ...pluginMeta.configSchema, ...(existing[0]?.config ?? {}), ...(config ?? {}) };

  if (existing.length > 0) {
    const [row] = await db
      .update(pluginsTable)
      .set({ config: mergedConfig, isActive: isActive ?? existing[0].isActive, updatedAt: new Date() })
      .where(and(eq(pluginsTable.userId, uid), eq(pluginsTable.type, type)))
      .returning();
    res.json(fmt(row));
  } else {
    const [row] = await db
      .insert(pluginsTable)
      .values({ userId: uid, type, name: name ?? pluginMeta.name, config: mergedConfig, isActive: isActive ?? false })
      .returning();
    res.json(fmt(row));
  }
});

router.post("/plugins/:type/toggle", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { type } = req.params;
  const { isActive } = req.body;

  const existing = await db.select().from(pluginsTable).where(and(eq(pluginsTable.userId, uid), eq(pluginsTable.type, type)));

  const pluginMeta = PLUGIN_TYPES.find((p) => p.type === type);
  if (!pluginMeta) { res.status(400).json({ message: "Unknown plugin type" }); return; }

  if (existing.length > 0) {
    const [row] = await db
      .update(pluginsTable)
      .set({ isActive, updatedAt: new Date() })
      .where(and(eq(pluginsTable.userId, uid), eq(pluginsTable.type, type)))
      .returning();
    res.json(fmt(row));
  } else {
    const [row] = await db
      .insert(pluginsTable)
      .values({ userId: uid, type, name: pluginMeta.name, config: pluginMeta.configSchema, isActive })
      .returning();
    res.json(fmt(row));
  }
});

export default router;
