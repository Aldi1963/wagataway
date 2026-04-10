import { Router, type IRouter } from "express";
import { db, devicesTable, messagesTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { getUserFromToken } from "./auth";
import { getGroups, getGroupMembers, sendToGroup, getSession } from "../lib/wa-manager";
import { getUserPlan, countTodayMessages, limitError } from "../lib/plan-limits";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7) : null;
  return (token ? getUserFromToken(token) : null) ?? 1;
}

// GET /api/groups?deviceId=X — list all groups for a device
router.get("/groups", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const deviceId = parseInt(req.query.deviceId as string, 10);
  if (!deviceId) {
    res.status(400).json({ message: "deviceId diperlukan" });
    return;
  }
  const [device] = await db.select().from(devicesTable)
    .where(eq(devicesTable.id, deviceId));
  if (!device || device.userId !== uid) {
    res.status(403).json({ message: "Akses ditolak" });
    return;
  }
  try {
    const groups = await getGroups(deviceId);
    res.json({ data: groups, total: groups.length });
  } catch (err: any) {
    res.status(503).json({ message: err.message ?? "Perangkat tidak terhubung" });
  }
});

// GET /api/groups/:groupId/members?deviceId=X — get members of a group
router.get("/groups/:groupId/members", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const deviceId = parseInt(req.query.deviceId as string, 10);
  const groupId = req.params.groupId;
  if (!deviceId) {
    res.status(400).json({ message: "deviceId diperlukan" });
    return;
  }
  const [device] = await db.select().from(devicesTable)
    .where(eq(devicesTable.id, deviceId));
  if (!device || device.userId !== uid) {
    res.status(403).json({ message: "Akses ditolak" });
    return;
  }
  try {
    const members = await getGroupMembers(deviceId, groupId);
    res.json({ data: members, total: members.length });
  } catch (err: any) {
    res.status(503).json({ message: err.message ?? "Gagal mengambil anggota grup" });
  }
});

// POST /api/groups/send — send message to a group
router.post("/groups/send", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { deviceId, groupId, message, messageType = "text", mediaUrl, extra } = req.body;
  if (!deviceId || !groupId || !message) {
    res.status(400).json({ message: "deviceId, groupId, dan message diperlukan" });
    return;
  }
  const devId = parseInt(deviceId, 10);
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, devId));
  if (!device || device.userId !== uid) {
    res.status(403).json({ message: "Akses ditolak" });
    return;
  }
  const session = getSession(devId);
  if (!session?.socket || session.status !== "connected") {
    res.status(503).json({ message: "Perangkat tidak terhubung" });
    return;
  }

  const [plan, todayCount] = await Promise.all([getUserPlan(uid), countTodayMessages(uid)]);
  const err = limitError(todayCount, plan.limitMessagesPerDay, "pesan hari ini");
  if (err) { res.status(403).json({ ...err, planName: plan.planName }); return; }

  let content: any;
  if (messageType === "media") {
    const mediaTypeLower = (extra?.mediaType ?? "image").toLowerCase();
    if (mediaTypeLower === "video") {
      content = { video: { url: mediaUrl }, caption: extra?.caption ?? message };
    } else if (mediaTypeLower === "audio") {
      content = { audio: { url: mediaUrl }, mimetype: "audio/mp4" };
    } else if (mediaTypeLower === "document") {
      content = { document: { url: mediaUrl }, caption: extra?.caption ?? message, fileName: extra?.fileName ?? "file" };
    } else {
      content = { image: { url: mediaUrl }, caption: extra?.caption ?? message };
    }
  } else if (messageType === "location") {
    content = {
      location: {
        degreesLatitude: extra?.lat ?? 0,
        degreesLongitude: extra?.lng ?? 0,
        name: extra?.title ?? message,
        address: extra?.address ?? "",
      },
    };
  } else {
    content = { text: message };
  }

  try {
    const externalId = await sendToGroup(devId, groupId, content);
    const gid = groupId.replace(/@g\.us$/, "");

    const [msg] = await db.insert(messagesTable).values({
      userId: uid,
      deviceId: devId,
      phone: gid,
      message: message ?? "[media]",
      status: "sent",
      mediaUrl: mediaUrl ?? null,
      messageType,
      externalId: externalId ?? null,
    }).returning();

    await db.update(devicesTable)
      .set({ messagesSent: sql`${devicesTable.messagesSent} + 1` })
      .where(eq(devicesTable.id, devId));

    res.json({
      id: String(msg.id),
      groupId,
      message: msg.message,
      status: msg.status,
      externalId: msg.externalId,
      createdAt: msg.createdAt?.toISOString(),
    });
  } catch (err: any) {
    res.status(503).json({ message: err.message ?? "Gagal kirim ke grup" });
  }
});

// POST /api/check-numbers — check if phones are on WhatsApp
router.post("/check-numbers", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { deviceId, phones } = req.body;
  if (!deviceId || !Array.isArray(phones) || phones.length === 0) {
    res.status(400).json({ message: "deviceId dan phones[] diperlukan" });
    return;
  }
  if (phones.length > 100) {
    res.status(400).json({ message: "Maksimal 100 nomor per request" });
    return;
  }
  const devId = parseInt(deviceId, 10);
  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, devId));
  if (!device || device.userId !== uid) {
    res.status(403).json({ message: "Akses ditolak" });
    return;
  }
  const session = getSession(devId);
  if (!session?.socket || session.status !== "connected") {
    res.status(503).json({ message: "Perangkat tidak terhubung" });
    return;
  }
  try {
    const { checkNumbers } = await import("../lib/wa-manager");
    const results = await checkNumbers(devId, phones);
    const exists = results.filter((r) => r.exists).length;
    res.json({ data: results, total: results.length, exists, notExists: results.length - exists });
  } catch (err: any) {
    res.status(500).json({ message: err.message ?? "Gagal cek nomor" });
  }
});

export default router;
