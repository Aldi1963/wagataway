import { Router } from "express";
import { db, shortLinksTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { getUserFromToken } from "./auth";
import crypto from "crypto";

function getUser(req: any): number {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  return (token ? getUserFromToken(token) : null) ?? 1;
}

const router = Router();

function generateCode(len = 6): string {
  return crypto.randomBytes(len).toString("base64url").slice(0, len);
}

/** GET /links — list semua short link milik user */
router.get("/links", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rows = await db.select().from(shortLinksTable)
    .where(eq(shortLinksTable.userId, uid))
    .orderBy(desc(shortLinksTable.createdAt));
  res.json(rows);
});

/** POST /links — buat short link baru */
router.post("/links", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { originalUrl, title, customCode } = req.body as { originalUrl: string; title?: string; customCode?: string };

  if (!originalUrl) {
    res.status(400).json({ message: "originalUrl diperlukan" });
    return;
  }

  let code = customCode?.trim() || generateCode(6);

  // Pastikan kode unik
  const existing = await db.select({ id: shortLinksTable.id })
    .from(shortLinksTable).where(eq(shortLinksTable.code, code));
  if (existing.length) {
    code = generateCode(8);
  }

  const [row] = await db.insert(shortLinksTable).values({
    userId: uid,
    code,
    originalUrl,
    title: title ?? null,
    clicks: 0,
  }).returning();

  res.json(row);
});

/** DELETE /links/:id — hapus short link */
router.delete("/links/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  await db.delete(shortLinksTable).where(and(eq(shortLinksTable.id, id), eq(shortLinksTable.userId, uid)));
  res.json({ ok: true });
});

/** GET /l/:code — redirect ke URL asli + increment click (PUBLIC) */
router.get("/l/:code", async (req, res): Promise<void> => {
  const code = req.params.code;
  const [link] = await db.select().from(shortLinksTable).where(eq(shortLinksTable.code, code));

  if (!link) {
    res.status(404).send("Link tidak ditemukan");
    return;
  }

  await db.update(shortLinksTable)
    .set({ clicks: sql`${shortLinksTable.clicks} + 1` })
    .where(eq(shortLinksTable.id, link.id));

  res.redirect(link.originalUrl);
});

export default router;
