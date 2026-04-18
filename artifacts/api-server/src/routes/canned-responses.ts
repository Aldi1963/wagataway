import { Router, type IRouter, type Request, type Response } from "express";
import { db, cannedResponsesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getUserFromToken } from "./auth";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

// GET /canned-responses
router.get("/canned-responses", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const rows = await db.select().from(cannedResponsesTable)
    .where(eq(cannedResponsesTable.userId, uid))
    .orderBy(cannedResponsesTable.shortcut);
  res.json(rows);
});

// POST /canned-responses
router.post("/canned-responses", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const { shortcut, title, body } = req.body;
  if (!shortcut?.trim() || !title?.trim() || !body?.trim()) {
    res.status(400).json({ message: "shortcut, title, dan body wajib diisi" }); return;
  }
  const [row] = await db.insert(cannedResponsesTable)
    .values({ userId: uid, shortcut: shortcut.trim(), title: title.trim(), body: body.trim() })
    .returning();
  res.json(row);
});

// PUT /canned-responses/:id
router.put("/canned-responses/:id", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id as string, 10);
  const { shortcut, title, body } = req.body;
  if (!shortcut?.trim() || !title?.trim() || !body?.trim()) {
    res.status(400).json({ message: "shortcut, title, dan body wajib diisi" }); return;
  }
  const [row] = await db.update(cannedResponsesTable)
    .set({ shortcut: shortcut.trim(), title: title.trim(), body: body.trim() })
    .where(and(eq(cannedResponsesTable.id, id), eq(cannedResponsesTable.userId, uid)))
    .returning();
  if (!row) { res.status(404).json({ message: "Tidak ditemukan" }); return; }
  res.json(row);
});

// DELETE /canned-responses/:id
router.delete("/canned-responses/:id", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id as string, 10);
  await db.delete(cannedResponsesTable)
    .where(and(eq(cannedResponsesTable.id, id), eq(cannedResponsesTable.userId, uid)));
  res.json({ success: true });
});

export default router;
