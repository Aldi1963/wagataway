import { Router, type IRouter } from "express";
import { db, autoRepliesTable, devicesTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getUserFromToken } from "./auth";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

function formatRule(r: any, deviceName?: string) {
  return {
    id: String(r.id),
    keyword: r.keyword,
    matchType: r.matchType,
    reply: r.reply,
    isActive: r.isActive,
    deviceId: r.deviceId ? String(r.deviceId) : undefined,
    deviceName: deviceName,
    triggerCount: r.triggerCount,
    scheduleFrom: r.scheduleFrom ?? null,
    scheduleTo: r.scheduleTo ?? null,
    timezone: r.timezone ?? "Asia/Jakarta",
    mediaUrl: r.mediaUrl,
    mediaCaption: r.mediaCaption,
    messageType: r.messageType,
    extra: r.extra,
    createdAt: r.createdAt?.toISOString(),
  };
}

router.get("/autoreply", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rules = await db.select().from(autoRepliesTable).where(eq(autoRepliesTable.userId, uid)).orderBy(sql`${autoRepliesTable.createdAt} DESC`);
  res.json(rules.map((r) => formatRule(r)));
});

router.post("/autoreply", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { keyword, matchType, reply, deviceId, isActive, scheduleFrom, scheduleTo, timezone, mediaUrl, mediaCaption, messageType, extra } = req.body;

  if (!keyword || !matchType || !reply) {
    res.status(400).json({ message: "Missing required fields", code: "INVALID_REQUEST" });
    return;
  }

  const [rule] = await db.insert(autoRepliesTable)
    .values({
      userId: uid,
      keyword,
      matchType,
      reply,
      deviceId: deviceId ? parseInt(deviceId, 10) : null,
      isActive: isActive ?? true,
      triggerCount: 0,
      scheduleFrom: scheduleFrom || null,
      scheduleTo: scheduleTo || null,
      timezone: timezone || "Asia/Jakarta",
      mediaUrl,
      mediaCaption,
      messageType: messageType || "text",
      extra: extra || {},
    })
    .returning();

  res.status(201).json(formatRule(rule));
});

router.put("/autoreply/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const { keyword, matchType, reply, deviceId, isActive, scheduleFrom, scheduleTo, timezone, mediaUrl, mediaCaption, messageType, extra } = req.body;

  const [rule] = await db.update(autoRepliesTable)
    .set({
      keyword,
      matchType,
      reply,
      deviceId: deviceId ? parseInt(deviceId, 10) : null,
      isActive: isActive ?? true,
      scheduleFrom: scheduleFrom ?? null,
      scheduleTo: scheduleTo ?? null,
      timezone: timezone || "Asia/Jakarta",
      mediaUrl,
      mediaCaption,
      messageType,
      extra,
    })
    .where(and(eq(autoRepliesTable.id, id), eq(autoRepliesTable.userId, uid)))
    .returning();

  if (!rule) {
    res.status(404).json({ message: "Rule not found", code: "NOT_FOUND" });
    return;
  }

  res.json(formatRule(rule));
});

router.delete("/autoreply/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  await db.delete(autoRepliesTable).where(and(eq(autoRepliesTable.id, id), eq(autoRepliesTable.userId, uid)));
  res.sendStatus(204);
});

router.post("/autoreply/:id/toggle", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const [current] = await db.select().from(autoRepliesTable).where(and(eq(autoRepliesTable.id, id), eq(autoRepliesTable.userId, uid)));
  if (!current) {
    res.status(404).json({ message: "Rule not found", code: "NOT_FOUND" });
    return;
  }

  const [rule] = await db.update(autoRepliesTable)
    .set({ isActive: !current.isActive })
    .where(eq(autoRepliesTable.id, id))
    .returning();

  res.json(formatRule(rule));
});

export default router;
