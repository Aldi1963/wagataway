import { Router } from "express";
import { db, messageTemplatesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getUserFromToken } from "./auth";

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

const router = Router();

// ── List templates ────────────────────────────────────────────────────────────
router.get("/templates", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rows = await db
    .select()
    .from(messageTemplatesTable)
    .where(eq(messageTemplatesTable.userId, uid))
    .orderBy(sql`${messageTemplatesTable.usageCount} DESC, ${messageTemplatesTable.createdAt} DESC`);

  res.json(rows.map(fmt));
});

// ── Create template ───────────────────────────────────────────────────────────
router.post("/templates", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { name, category = "general", content, variables = [] } = req.body ?? {};

  if (!name?.trim()) { res.status(400).json({ message: "Nama template wajib diisi" }); return; }
  if (!content?.trim()) { res.status(400).json({ message: "Isi template wajib diisi" }); return; }

  const [row] = await db
    .insert(messageTemplatesTable)
    .values({ userId: uid, name: name.trim(), category, content: content.trim(), variables })
    .returning();

  res.status(201).json(fmt(row));
});

// ── Update template ───────────────────────────────────────────────────────────
router.put("/templates/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const { name, category, content, variables } = req.body ?? {};

  const updates: Record<string, unknown> = {};
  if (name?.trim()) updates.name = name.trim();
  if (category) updates.category = category;
  if (content?.trim()) updates.content = content.trim();
  if (Array.isArray(variables)) updates.variables = variables;

  if (Object.keys(updates).length === 0) { res.status(400).json({ message: "Tidak ada perubahan" }); return; }

  const [row] = await db
    .update(messageTemplatesTable)
    .set(updates)
    .where(and(eq(messageTemplatesTable.id, id), eq(messageTemplatesTable.userId, uid)))
    .returning();

  if (!row) { res.status(404).json({ message: "Template tidak ditemukan" }); return; }
  res.json(fmt(row));
});

// ── Delete template ───────────────────────────────────────────────────────────
router.delete("/templates/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);

  const [row] = await db
    .delete(messageTemplatesTable)
    .where(and(eq(messageTemplatesTable.id, id), eq(messageTemplatesTable.userId, uid)))
    .returning();

  if (!row) { res.status(404).json({ message: "Template tidak ditemukan" }); return; }
  res.json({ ok: true });
});

// ── Use template (increment counter) ─────────────────────────────────────────
router.post("/templates/:id/use", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);

  const [row] = await db
    .update(messageTemplatesTable)
    .set({ usageCount: sql`${messageTemplatesTable.usageCount} + 1` })
    .where(and(eq(messageTemplatesTable.id, id), eq(messageTemplatesTable.userId, uid)))
    .returning();

  if (!row) { res.status(404).json({ message: "Template tidak ditemukan" }); return; }
  res.json(fmt(row));
});

// ── Formatter ─────────────────────────────────────────────────────────────────
function fmt(t: typeof messageTemplatesTable.$inferSelect) {
  return {
    id: String(t.id),
    name: t.name,
    category: t.category,
    content: t.content,
    variables: t.variables ?? [],
    usageCount: t.usageCount,
    createdAt: t.createdAt?.toISOString(),
    updatedAt: t.updatedAt?.toISOString(),
  };
}

export default router;
