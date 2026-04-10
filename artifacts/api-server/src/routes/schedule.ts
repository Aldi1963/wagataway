import { Router, type IRouter } from "express";
import { db, scheduledMessagesTable, devicesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getUserFromToken } from "./auth";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

function fmt(m: any) {
  return {
    id: String(m.id),
    deviceId: String(m.deviceId),
    phone: m.phone,
    message: m.message,
    messageType: m.messageType,
    extra: m.extra,
    scheduledAt: m.scheduledAt?.toISOString(),
    status: m.status,
    repeat: m.repeat,
    sentAt: m.sentAt?.toISOString() ?? null,
    createdAt: m.createdAt?.toISOString(),
  };
}

router.get("/schedule", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rows = await db
    .select()
    .from(scheduledMessagesTable)
    .where(eq(scheduledMessagesTable.userId, uid))
    .orderBy(sql`${scheduledMessagesTable.scheduledAt} ASC`);
  res.json(rows.map(fmt));
});

router.post("/schedule", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { deviceId, phone, message, messageType, extra, scheduledAt, repeat } = req.body;

  if (!deviceId || !phone || !message || !scheduledAt) {
    res.status(400).json({ message: "Missing required fields", code: "INVALID_REQUEST" });
    return;
  }

  const [row] = await db
    .insert(scheduledMessagesTable)
    .values({
      userId: uid,
      deviceId: parseInt(deviceId, 10),
      phone,
      message,
      messageType: messageType ?? "text",
      extra: extra ?? null,
      scheduledAt: new Date(scheduledAt),
      status: "pending",
      repeat: repeat ?? "none",
    })
    .returning();

  res.status(201).json(fmt(row));
});

router.put("/schedule/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const { phone, message, messageType, extra, scheduledAt, repeat, status } = req.body;

  const [row] = await db
    .update(scheduledMessagesTable)
    .set({
      ...(phone && { phone }),
      ...(message && { message }),
      ...(messageType && { messageType }),
      ...(extra !== undefined && { extra }),
      ...(scheduledAt && { scheduledAt: new Date(scheduledAt) }),
      ...(repeat && { repeat }),
      ...(status && { status }),
    })
    .where(and(eq(scheduledMessagesTable.id, id), eq(scheduledMessagesTable.userId, uid)))
    .returning();

  if (!row) { res.status(404).json({ message: "Not found" }); return; }
  res.json(fmt(row));
});

router.delete("/schedule/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  await db
    .delete(scheduledMessagesTable)
    .where(and(eq(scheduledMessagesTable.id, id), eq(scheduledMessagesTable.userId, uid)));
  res.sendStatus(204);
});

router.post("/schedule/:id/cancel", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const [row] = await db
    .update(scheduledMessagesTable)
    .set({ status: "cancelled" })
    .where(and(eq(scheduledMessagesTable.id, id), eq(scheduledMessagesTable.userId, uid), eq(scheduledMessagesTable.status, "pending")))
    .returning();
  if (!row) { res.status(404).json({ message: "Not found or already processed" }); return; }
  res.json(fmt(row));
});

export default router;
