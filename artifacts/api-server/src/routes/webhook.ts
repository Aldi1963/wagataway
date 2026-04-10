import { Router, type IRouter } from "express";
import { db, webhooksTable, devicesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getUserFromToken } from "./auth";
import crypto from "crypto";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

function fmt(w: any) {
  return {
    id: String(w.id),
    deviceId: w.deviceId ? String(w.deviceId) : null,
    name: w.name,
    url: w.url,
    events: w.events ?? [],
    secret: w.secret ? w.secret.slice(0, 8) + "••••••••" : null,
    isActive: w.isActive,
    lastTriggered: w.lastTriggered?.toISOString() ?? null,
    triggerCount: w.triggerCount,
    createdAt: w.createdAt?.toISOString(),
  };
}

router.get("/webhooks", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rows = await db
    .select()
    .from(webhooksTable)
    .where(eq(webhooksTable.userId, uid))
    .orderBy(sql`${webhooksTable.createdAt} DESC`);
  res.json(rows.map(fmt));
});

router.post("/webhooks", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { name, url, events, deviceId, secret } = req.body;

  if (!name || !url) {
    res.status(400).json({ message: "Name and URL are required", code: "INVALID_REQUEST" });
    return;
  }

  const generatedSecret = secret ?? crypto.randomBytes(16).toString("hex");

  const [row] = await db
    .insert(webhooksTable)
    .values({
      userId: uid,
      deviceId: deviceId ? parseInt(deviceId, 10) : null,
      name,
      url,
      events: events ?? ["message.received"],
      secret: generatedSecret,
      isActive: true,
      triggerCount: 0,
    })
    .returning();

  res.status(201).json({ ...fmt(row), secret: generatedSecret });
});

router.put("/webhooks/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const { name, url, events, deviceId, isActive } = req.body;

  const [row] = await db
    .update(webhooksTable)
    .set({
      ...(name && { name }),
      ...(url && { url }),
      ...(events && { events }),
      ...(deviceId !== undefined && { deviceId: deviceId ? parseInt(deviceId, 10) : null }),
      ...(isActive !== undefined && { isActive }),
    })
    .where(and(eq(webhooksTable.id, id), eq(webhooksTable.userId, uid)))
    .returning();

  if (!row) { res.status(404).json({ message: "Not found" }); return; }
  res.json(fmt(row));
});

router.delete("/webhooks/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  await db.delete(webhooksTable).where(and(eq(webhooksTable.id, id), eq(webhooksTable.userId, uid)));
  res.sendStatus(204);
});

router.post("/webhooks/:id/test", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);

  const [wh] = await db.select().from(webhooksTable).where(and(eq(webhooksTable.id, id), eq(webhooksTable.userId, uid)));
  if (!wh) { res.status(404).json({ message: "Not found" }); return; }

  try {
    // Ambil info device jika webhook terikat ke device tertentu
    let deviceName = "Device Demo";
    let deviceId: number | null = wh.deviceId ?? null;
    if (deviceId) {
      const [dev] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
      if (dev) deviceName = dev.name;
    }

    const payload = {
      event: "message.received",
      timestamp: new Date().toISOString(),
      deviceId: deviceId ?? 0,
      data: {
        device: deviceName,
        message: "Halo, ini adalah pesan uji coba dari WA Gateway 👋",
        from: "6281234567890",
        name: "Budi Santoso",
        participant: null,
        ppUrl: "https://pps.whatsapp.net/v/t61.24694-24/sample_photo.jpg",
        media: null,
      },
    };

    const resp = await fetch(wh.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-WA-Gateway-Secret": wh.secret ?? "" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5000),
    });

    await db.update(webhooksTable)
      .set({ lastTriggered: new Date(), triggerCount: (wh.triggerCount ?? 0) + 1 })
      .where(eq(webhooksTable.id, id));

    res.json({ success: true, statusCode: resp.status, message: `Webhook test sent (HTTP ${resp.status})` });
  } catch (err: any) {
    res.status(502).json({ success: false, message: `Failed to reach endpoint: ${err.message}` });
  }
});

export default router;
