/**
 * Auto-Cleanup — Admin-only global data cleanup
 * Settings stored in settings table (key: "cleanup_config")
 * Admin can preview & delete old messages/inbox across ALL users
 */
import { Router, type IRouter } from "express";
import { db, settingsTable, messagesTable, chatInboxTable } from "@workspace/db";
import { eq, lt, sql } from "drizzle-orm";

const router: IRouter = Router();

const SETTINGS_KEY = "cleanup_config";

interface CleanupConfig {
  cleanupDays: number;
  cleanupEnabled: boolean;
}

const DEFAULT_CONFIG: CleanupConfig = { cleanupDays: 90, cleanupEnabled: false };

async function loadConfig(): Promise<CleanupConfig> {
  try {
    const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, SETTINGS_KEY));
    if (row?.value) return { ...DEFAULT_CONFIG, ...(JSON.parse(row.value) as Partial<CleanupConfig>) };
  } catch {}
  return { ...DEFAULT_CONFIG };
}

async function saveConfig(cfg: CleanupConfig): Promise<void> {
  const value = JSON.stringify(cfg);
  const existing = await db.select({ id: settingsTable.id }).from(settingsTable).where(eq(settingsTable.key, SETTINGS_KEY));
  if (existing.length > 0) {
    await db.update(settingsTable).set({ value }).where(eq(settingsTable.key, SETTINGS_KEY));
  } else {
    await db.insert(settingsTable).values({ key: SETTINGS_KEY, value });
  }
}

/** GET /admin/cleanup/settings */
router.get("/admin/cleanup/settings", async (_req, res): Promise<void> => {
  const cfg = await loadConfig();
  res.json(cfg);
});

/** PUT /admin/cleanup/settings */
router.put("/admin/cleanup/settings", async (req, res): Promise<void> => {
  const { cleanupDays, cleanupEnabled } = req.body as Partial<CleanupConfig>;
  const current = await loadConfig();
  const updated: CleanupConfig = {
    cleanupDays: cleanupDays ?? current.cleanupDays,
    cleanupEnabled: cleanupEnabled ?? current.cleanupEnabled,
  };
  await saveConfig(updated);
  res.json({ success: true, ...updated });
});

/** GET /admin/cleanup/preview — preview jumlah data yang akan dihapus (semua user) */
router.get("/admin/cleanup/preview", async (req, res): Promise<void> => {
  const cfg = await loadConfig();
  const daysParam = req.query.days ? parseInt(String(req.query.days), 10) : null;
  const days = daysParam ?? cfg.cleanupDays;
  const cutoff = new Date(Date.now() - days * 86400000);

  const msgRes = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM messages WHERE created_at < ${cutoff}
  `);
  const inboxRes = await db.execute(sql`
    SELECT COUNT(*)::int AS count FROM chat_inbox WHERE timestamp < ${cutoff}
  `);

  const userRes = await db.execute(sql`
    SELECT COUNT(DISTINCT user_id)::int AS count FROM messages WHERE created_at < ${cutoff}
  `);

  res.json({
    messages: Number((msgRes.rows[0] as any)?.count ?? 0),
    inbox: Number((inboxRes.rows[0] as any)?.count ?? 0),
    affectedUsers: Number((userRes.rows[0] as any)?.count ?? 0),
    cutoffDate: cutoff.toISOString(),
    days,
  });
});

/** POST /admin/cleanup/run — jalankan pembersihan untuk semua user */
router.post("/admin/cleanup/run", async (req, res): Promise<void> => {
  const cfg = await loadConfig();
  const daysParam = req.body?.days ? parseInt(String(req.body.days), 10) : null;
  const days = daysParam ?? cfg.cleanupDays;
  const cutoff = new Date(Date.now() - days * 86400000);

  const msgRes = await db.execute(sql`
    WITH deleted AS (
      DELETE FROM messages WHERE created_at < ${cutoff} RETURNING id
    ) SELECT COUNT(*)::int AS count FROM deleted
  `);

  const inboxRes = await db.execute(sql`
    WITH deleted AS (
      DELETE FROM chat_inbox WHERE timestamp < ${cutoff} RETURNING id
    ) SELECT COUNT(*)::int AS count FROM deleted
  `);

  const deletedMessages = Number((msgRes.rows[0] as any)?.count ?? 0);
  const deletedInbox = Number((inboxRes.rows[0] as any)?.count ?? 0);

  res.json({
    success: true,
    deletedMessages,
    deletedInbox,
    total: deletedMessages + deletedInbox,
    cutoffDate: cutoff.toISOString(),
    days,
  });
});

export default router;
