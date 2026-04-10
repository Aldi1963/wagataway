import { Router } from "express";
import { db, blacklistTable } from "@workspace/db";
import { eq, and, ilike, desc } from "drizzle-orm";
import { getUserFromToken } from "./auth";

function getUser(req: any): number {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  return (token ? getUserFromToken(token) : null) ?? 1;
}

const router = Router();

/** GET /blacklist — list semua nomor blacklist milik user */
router.get("/blacklist", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const search = (req.query.search as string | undefined)?.trim();

  let rows = await db.select().from(blacklistTable)
    .where(
      search
        ? and(eq(blacklistTable.userId, uid), ilike(blacklistTable.phone, `%${search}%`))
        : eq(blacklistTable.userId, uid)
    )
    .orderBy(desc(blacklistTable.createdAt));

  res.json(rows);
});

/** POST /blacklist — tambah nomor ke blacklist */
router.post("/blacklist", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { phones, phone, reason } = req.body as { phones?: string | string[]; phone?: string; reason?: string };

  const raw = phones ?? phone;
  const list = (Array.isArray(raw) ? raw : raw ? [raw] : [])
    .map((p: any) => (typeof p === "string" ? p.replace(/\D/g, "").trim() : ""))
    .filter(Boolean);

  if (!list.length) {
    res.status(400).json({ message: "Nomor tidak boleh kosong" });
    return;
  }

  const inserted: string[] = [];
  for (const phone of list) {
    const existing = await db.select({ id: blacklistTable.id })
      .from(blacklistTable)
      .where(and(eq(blacklistTable.userId, uid), eq(blacklistTable.phone, phone)));
    if (!existing.length) {
      await db.insert(blacklistTable).values({ userId: uid, phone, reason: reason ?? null });
      inserted.push(phone);
    }
  }

  res.json({ inserted: inserted.length, skipped: list.length - inserted.length });
});

/** DELETE /blacklist/:id — hapus satu nomor */
router.delete("/blacklist/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  await db.delete(blacklistTable).where(and(eq(blacklistTable.id, id), eq(blacklistTable.userId, uid)));
  res.json({ ok: true });
});

/** DELETE /blacklist — hapus berdasarkan nomor telepon */
router.delete("/blacklist", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { phone } = req.body as { phone: string };
  if (!phone) { res.status(400).json({ message: "phone diperlukan" }); return; }
  await db.delete(blacklistTable).where(and(eq(blacklistTable.phone, phone), eq(blacklistTable.userId, uid)));
  res.json({ ok: true });
});

/** POST /blacklist/check — cek apakah nomor ada di blacklist */
router.post("/blacklist/check", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { phone } = req.body as { phone: string };
  const rows = await db.select().from(blacklistTable)
    .where(and(eq(blacklistTable.userId, uid), eq(blacklistTable.phone, phone)));
  res.json({ blocked: rows.length > 0, entry: rows[0] ?? null });
});

export default router;
