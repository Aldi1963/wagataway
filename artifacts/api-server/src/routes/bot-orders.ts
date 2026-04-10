import { Router } from "express";
import { db, botProductsTable, botOrdersTable, botOrderSessionsTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { getUserFromToken } from "./auth";

const router = Router();

function getUser(req: any): number {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  return (token ? getUserFromToken(token) : null) ?? 1;
}

// ── Products ───────────────────────────────────────────────────────────────────

router.get("/bot-products", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const deviceId = req.query.deviceId ? parseInt(req.query.deviceId as string, 10) : undefined;
  const where = deviceId
    ? and(eq(botProductsTable.userId, uid), eq(botProductsTable.deviceId, deviceId))
    : eq(botProductsTable.userId, uid);
  const products = await db.select().from(botProductsTable).where(where).orderBy(desc(botProductsTable.createdAt));
  res.json(products);
});

router.post("/bot-products", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { deviceId, name, description, price, stock, imageUrl, code, isActive } = req.body;
  if (!deviceId || !name?.trim() || !code?.trim()) {
    res.status(400).json({ error: "deviceId, name, dan code wajib diisi" }); return;
  }
  const [product] = await db.insert(botProductsTable).values({
    userId: uid, deviceId: parseInt(deviceId, 10),
    name, description: description ?? "", price: String(price ?? 0),
    stock: stock ?? null, imageUrl: imageUrl ?? "", code: code.trim().toUpperCase(),
    isActive: isActive !== false,
  }).returning();
  res.status(201).json(product);
});

router.put("/bot-products/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const { name, description, price, stock, imageUrl, code, isActive } = req.body;
  const [product] = await db.update(botProductsTable)
    .set({ name, description, price: String(price ?? 0), stock, imageUrl, code: code?.trim()?.toUpperCase(), isActive, updatedAt: new Date() })
    .where(and(eq(botProductsTable.id, id), eq(botProductsTable.userId, uid)))
    .returning();
  if (!product) { res.status(404).json({ error: "Produk tidak ditemukan" }); return; }
  res.json(product);
});

router.delete("/bot-products/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  await db.delete(botProductsTable).where(and(eq(botProductsTable.id, id), eq(botProductsTable.userId, uid)));
  res.json({ ok: true });
});

// ── Orders ─────────────────────────────────────────────────────────────────────

router.get("/bot-orders", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const deviceId = req.query.deviceId ? parseInt(req.query.deviceId as string, 10) : undefined;
  const where = deviceId
    ? and(eq(botOrdersTable.userId, uid), eq(botOrdersTable.deviceId, deviceId))
    : eq(botOrdersTable.userId, uid);
  const orders = await db.select().from(botOrdersTable).where(where).orderBy(desc(botOrdersTable.createdAt)).limit(100);
  res.json(orders);
});

router.put("/bot-orders/:id/status", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const { status } = req.body;
  const valid = ["pending", "confirmed", "processing", "shipped", "done", "cancelled"];
  if (!valid.includes(status)) { res.status(400).json({ error: "Status tidak valid" }); return; }
  const [order] = await db.update(botOrdersTable)
    .set({ status, updatedAt: new Date() })
    .where(and(eq(botOrdersTable.id, id), eq(botOrdersTable.userId, uid)))
    .returning();
  if (!order) { res.status(404).json({ error: "Pesanan tidak ditemukan" }); return; }
  res.json(order);
});

export default router;
