import { Router } from "express";
import { db, botProductsTable, botOrdersTable, botOrderSessionsTable, botCategoriesTable, botPaymentMethodsTable, botOwnerSettingsTable } from "@workspace/db";
import { eq, and, desc, sql, gte, lte, sum } from "drizzle-orm";
import { getUserFromToken } from "./auth";
import { RajaOngkirService } from "../lib/rajaongkir";

const router = Router();

function getUser(req: any): number {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  return (token ? getUserFromToken(token) : null) ?? 1;
}

// ── Categories ────────────────────────────────────────────────────────────────
router.get("/bot-categories", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const deviceId = req.query.deviceId ? parseInt(req.query.deviceId as string, 10) : undefined;
  if (!deviceId) { res.status(400).json({ error: "deviceId wajib diisi" }); return; }
  const categories = await db.select().from(botCategoriesTable).where(
    and(eq(botCategoriesTable.userId, uid), eq(botCategoriesTable.deviceId, deviceId))
  ).orderBy(desc(botCategoriesTable.createdAt));
  res.json(categories);
});

router.post("/bot-categories", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { deviceId, name, description } = req.body;
  if (!deviceId || !name?.trim()) { res.status(400).json({ error: "deviceId dan nama wajib diisi" }); return; }
  const [cat] = await db.insert(botCategoriesTable).values({
    userId: uid, deviceId: parseInt(deviceId, 10), name, description: description ?? "",
  }).returning();
  res.status(201).json(cat);
});

router.delete("/bot-categories/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  await db.delete(botCategoriesTable).where(and(eq(botCategoriesTable.id, id), eq(botCategoriesTable.userId, uid)));
  res.json({ ok: true });
});

// ── Products ───────────────────────────────────────────────────────────────────

router.get("/bot-products", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const deviceId = req.query.deviceId ? parseInt(req.query.deviceId as string, 10) : undefined;
  const categoryId = req.query.categoryId ? parseInt(req.query.categoryId as string, 10) : undefined;
  
  let conditions = [eq(botProductsTable.userId, uid)];
  if (deviceId) conditions.push(eq(botProductsTable.deviceId, deviceId));
  if (categoryId) conditions.push(eq(botProductsTable.categoryId, categoryId));

  const products = await db.select().from(botProductsTable).where(and(...conditions)).orderBy(desc(botProductsTable.createdAt));
  res.json(products);
});

router.post("/bot-products", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { deviceId, categoryId, name, description, price, stock, minStock, variants, imageUrl, code, isActive } = req.body;
  if (!deviceId || !name?.trim() || !code?.trim()) {
    res.status(400).json({ error: "deviceId, name, dan code wajib diisi" }); return;
  }
  const [product] = await db.insert(botProductsTable).values({
    userId: uid, 
    deviceId: parseInt(deviceId, 10),
    categoryId: categoryId ? parseInt(categoryId, 10) : null,
    name, description: description ?? "", 
    price: String(price ?? 0),
    stock: stock ?? null,
    minStock: minStock ?? 0,
    variants: variants ?? null,
    imageUrl: imageUrl ?? "", 
    code: code.trim().toUpperCase(),
    isActive: isActive !== false,
  }).returning();
  res.status(201).json(product);
});

router.put("/bot-products/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const { categoryId, name, description, price, stock, minStock, variants, imageUrl, code, isActive } = req.body;
  const [product] = await db.update(botProductsTable)
    .set({ 
      categoryId: categoryId ? parseInt(categoryId, 10) : null,
      name, description, price: String(price ?? 0), stock, minStock, variants, imageUrl, 
      code: code?.trim()?.toUpperCase(), isActive, updatedAt: new Date() 
    })
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
  const orders = await db.select().from(botOrdersTable).where(where).orderBy(desc(botOrdersTable.createdAt)).limit(500);
  res.json(orders);
});

router.put("/bot-orders/:id/status", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const { status, paymentStatus } = req.body;
  
  const data: any = { updatedAt: new Date() };
  if (status) {
    const valid = ["pending", "confirmed", "processing", "shipped", "done", "cancelled"];
    if (!valid.includes(status)) { res.status(400).json({ error: "Status tidak valid" }); return; }
    data.status = status;
  }
  if (paymentStatus) {
    if (!["unpaid", "paid"].includes(paymentStatus)) { res.status(400).json({ error: "Status pembayaran tidak valid" }); return; }
    data.paymentStatus = paymentStatus;
  }

  const [order] = await db.update(botOrdersTable)
    .set(data)
    .where(and(eq(botOrdersTable.id, id), eq(botOrdersTable.userId, uid)))
    .returning();
  if (!order) { res.status(404).json({ error: "Pesanan tidak ditemukan" }); return; }
  
  // TODO: Trigger WA Notification here if needed
  
  res.json(order);
});

// ── Analytics & Export ────────────────────────────────────────────────────────

router.get("/bot-commerce/stats", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const deviceId = req.query.deviceId ? parseInt(req.query.deviceId as string, 10) : undefined;
  if (!deviceId) { res.status(400).json({ error: "deviceId wajib diisi" }); return; }

  const orders = await db.select().from(botOrdersTable).where(
    and(eq(botOrdersTable.userId, uid), eq(botOrdersTable.deviceId, deviceId), eq(botOrdersTable.status, "done"))
  );

  const totalOmzet = orders.reduce((acc, o) => acc + Number(o.totalPrice), 0);
  const totalOrders = orders.length;

  const [totalProducts] = await db.select({ count: sql`count(*)` }).from(botProductsTable).where(
    and(eq(botProductsTable.userId, uid), eq(botProductsTable.deviceId, deviceId), eq(botProductsTable.isActive, true))
  );

  // Chart data (last 7 days)
  const chartData = await db.execute(sql`
    SELECT TO_CHAR(created_at, 'DD/MM') as date, SUM(total_price::numeric) as amount
    FROM bot_orders
    WHERE user_id = ${uid} AND device_id = ${deviceId} AND status = 'done'
    AND created_at >= NOW() - INTERVAL '7 days'
    GROUP BY date ORDER BY date ASC
  `);

  // Top Products
  const topProducts = await db.select({
    name: botOrdersTable.productName,
    count: sql<number>`count(*)`
  }).from(botOrdersTable).where(
    and(eq(botOrdersTable.userId, uid), eq(botOrdersTable.deviceId, deviceId))
  ).groupBy(botOrdersTable.productName).orderBy(desc(sql`count(*)`)).limit(5);

  res.json({
    totalOmzet,
    totalOrders,
    totalProducts: Number((totalProducts as any).count),
    chartData: chartData.rows,
    topProducts
  });
});

router.get("/bot-commerce/payment-methods", async (req, res) => {
  const uid = getUser(req);
  const deviceId = parseInt(req.query.deviceId as string, 10);
  const items = await db.select().from(botPaymentMethodsTable).where(
    and(eq(botPaymentMethodsTable.userId, uid), eq(botPaymentMethodsTable.deviceId, deviceId))
  );
  res.json(items);
});

router.post("/bot-commerce/payment-methods", async (req, res) => {
  const uid = getUser(req);
  const { id, ...data } = req.body;
  if (id) {
    const [updated] = await db.update(botPaymentMethodsTable).set(data).where(and(eq(botPaymentMethodsTable.id, id), eq(botPaymentMethodsTable.userId, uid))).returning();
    return res.json(updated);
  }
  const [created] = await db.insert(botPaymentMethodsTable).values({ ...data, userId: uid }).returning();
  res.json(created);
});

router.delete("/bot-commerce/payment-methods/:id", async (req, res) => {
  const uid = getUser(req);
  await db.delete(botPaymentMethodsTable).where(and(eq(botPaymentMethodsTable.id, parseInt(req.params.id, 10)), eq(botPaymentMethodsTable.userId, uid)));
  res.json({ ok: true });
});

router.get("/bot-commerce/settings", async (req, res) => {
  const uid = getUser(req);
  const deviceId = parseInt(req.query.deviceId as string, 10);
  const [settings] = await db.select().from(botOwnerSettingsTable).where(
    and(eq(botOwnerSettingsTable.userId, uid), eq(botOwnerSettingsTable.deviceId, deviceId))
  );
  res.json(settings || { ownerPhone: "", stockAlertEnabled: true, paymentInstructionEnabled: true });
});

router.post("/bot-commerce/settings", async (req, res) => {
  const uid = getUser(req);
  const { deviceId, ...data } = req.body;
  const dId = parseInt(deviceId, 10);
  const [existing] = await db.select().from(botOwnerSettingsTable).where(and(eq(botOwnerSettingsTable.userId, uid), eq(botOwnerSettingsTable.deviceId, dId)));

  // Whitelist fields
  const allowed = [
    "ownerPhone", "stockAlertEnabled", "paymentInstructionEnabled", 
    "defaultShippingFee", "shippingInstructions",
    "shippingCalcType", "rajaongkirApiKey", "rajaongkirOriginId", "rajaongkirAccountType"
  ];
  const payload: any = {};
  for (const k of allowed) if (data[k] !== undefined) payload[k] = data[k];

  if (existing) {
    const [updated] = await db.update(botOwnerSettingsTable).set(payload).where(eq(botOwnerSettingsTable.id, existing.id)).returning();
    return res.json(updated);
  }
  const [created] = await db.insert(botOwnerSettingsTable).values({ ...payload, userId: uid, deviceId: dId }).returning();
  res.json(created);
});

router.get("/bot-commerce/rajaongkir/cities", async (req, res) => {
  const uid = getUser(req);
  const { apiKey, accountType } = req.query as { apiKey: string, accountType: string };
  if (!apiKey) return res.status(400).json({ error: "apiKey wajib diisi" });

  try {
    const service = new RajaOngkirService(apiKey, (accountType as any) || "starter");
    const cities = await service.getCities();
    res.json(cities);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
