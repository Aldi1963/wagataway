import { Router, type IRouter } from "express";
import { db, messagesTable, devicesTable, contactsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getUserFromToken } from "./auth";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

router.get("/dashboard/stats", async (req, res): Promise<void> => {
  const uid = getUser(req);

  const [msgStats] = await db
    .select({
      total: sql<number>`COUNT(*)`,
      sent: sql<number>`COUNT(CASE WHEN ${messagesTable.status} = 'sent' THEN 1 END)`,
      failed: sql<number>`COUNT(CASE WHEN ${messagesTable.status} = 'failed' THEN 1 END)`,
      pending: sql<number>`COUNT(CASE WHEN ${messagesTable.status} = 'pending' THEN 1 END)`,
    })
    .from(messagesTable)
    .where(eq(messagesTable.userId, uid));

  const deviceStats = await db
    .select()
    .from(devicesTable)
    .where(eq(devicesTable.userId, uid));

  const [contactStats] = await db
    .select({ total: sql<number>`COUNT(*)` })
    .from(contactsTable)
    .where(eq(contactsTable.userId, uid));

  const totalMessages = Number(msgStats?.total ?? 0);
  const sentMessages = Number(msgStats?.sent ?? 0);
  const failedMessages = Number(msgStats?.failed ?? 0);
  const pendingMessages = Number(msgStats?.pending ?? 0);
  const activeDevices = deviceStats.filter((d) => d.status === "connected").length;
  const successRate = totalMessages > 0 ? Math.round((sentMessages / totalMessages) * 100) : 0;

  res.json({
    totalMessages,
    sentMessages,
    failedMessages,
    pendingMessages,
    activeDevices,
    totalDevices: deviceStats.length,
    totalContacts: Number(contactStats?.total ?? 0),
    successRate,
  });
});

router.get("/dashboard/activity", async (req, res): Promise<void> => {
  const uid = getUser(req);

  const devices = await db
    .select({ id: devicesTable.id, name: devicesTable.name })
    .from(devicesTable)
    .where(eq(devicesTable.userId, uid));

  const deviceMap: Record<number, string> = {};
  devices.forEach((d) => { deviceMap[d.id] = d.name; });

  const messages = await db
    .select()
    .from(messagesTable)
    .where(eq(messagesTable.userId, uid))
    .orderBy(sql`${messagesTable.createdAt} DESC`)
    .limit(20);

  const activity = messages.map((m) => ({
    id: String(m.id),
    type: m.status === "sent" ? "message_sent" : m.status === "failed" ? "message_failed" : "message_pending",
    description: m.status === "sent"
      ? `Pesan terkirim ke ${m.phone}`
      : m.status === "failed"
      ? `Pesan gagal ke ${m.phone}`
      : `Pesan pending ke ${m.phone}`,
    phone: m.phone,
    deviceName: deviceMap[m.deviceId ?? 0] ?? `Device #${m.deviceId}`,
    createdAt: m.createdAt?.toISOString(),
  }));

  res.json(activity);
});

router.get("/dashboard/chart", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const period = (req.query.period as string) ?? "7d";
  const days = period === "90d" ? 90 : period === "30d" ? 30 : 7;

  // Query real message counts grouped by date
  const rows = await db
    .select({
      date: sql<string>`DATE(${messagesTable.createdAt})`,
      sent: sql<number>`COUNT(CASE WHEN ${messagesTable.status} = 'sent' THEN 1 END)`,
      failed: sql<number>`COUNT(CASE WHEN ${messagesTable.status} = 'failed' THEN 1 END)`,
      pending: sql<number>`COUNT(CASE WHEN ${messagesTable.status} = 'pending' THEN 1 END)`,
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.userId, uid),
        sql`${messagesTable.createdAt} >= NOW() - INTERVAL '${sql.raw(String(days))} days'`
      )
    )
    .groupBy(sql`DATE(${messagesTable.createdAt})`);

  // Build a map for quick lookup
  const dataMap = new Map(rows.map((r) => [r.date, r]));

  // Fill all days in range (even days with 0 messages)
  const data = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i);
    const dateStr = date.toISOString().split("T")[0];
    const row = dataMap.get(dateStr);
    data.push({
      date: dateStr,
      sent: Number(row?.sent ?? 0),
      failed: Number(row?.failed ?? 0),
      pending: Number(row?.pending ?? 0),
    });
  }

  res.json(data);
});

/** GET /dashboard/top-devices — top 5 devices by messages sent */
router.get("/dashboard/top-devices", async (req, res): Promise<void> => {
  const uid = getUser(req);

  const rows = await db
    .select({
      deviceId: messagesTable.deviceId,
      deviceName: devicesTable.name,
      total: sql<number>`COUNT(*)`,
      sent: sql<number>`COUNT(CASE WHEN ${messagesTable.status} = 'sent' THEN 1 END)`,
    })
    .from(messagesTable)
    .leftJoin(devicesTable, eq(messagesTable.deviceId, devicesTable.id))
    .where(eq(messagesTable.userId, uid))
    .groupBy(messagesTable.deviceId, devicesTable.name)
    .orderBy(sql`COUNT(*) DESC`)
    .limit(5);

  res.json(rows.map((r) => ({
    name: r.deviceName ?? `Device #${r.deviceId}`,
    total: Number(r.total),
    sent: Number(r.sent),
  })));
});

/** GET /dashboard/hourly — pesan 24 jam terakhir per-jam */
router.get("/dashboard/hourly", async (req, res): Promise<void> => {
  const uid = getUser(req);

  const rows = await db
    .select({
      hour: sql<number>`EXTRACT(HOUR FROM ${messagesTable.createdAt})::int`,
      sent: sql<number>`COUNT(CASE WHEN ${messagesTable.status} = 'sent' THEN 1 END)`,
      failed: sql<number>`COUNT(CASE WHEN ${messagesTable.status} = 'failed' THEN 1 END)`,
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.userId, uid),
        sql`${messagesTable.createdAt} >= NOW() - INTERVAL '24 hours'`
      )
    )
    .groupBy(sql`EXTRACT(HOUR FROM ${messagesTable.createdAt})::int`);

  const dataMap = new Map(rows.map((r) => [Number(r.hour), r]));
  const data = Array.from({ length: 24 }, (_, h) => {
    const r = dataMap.get(h);
    return { hour: `${String(h).padStart(2, "0")}:00`, sent: Number(r?.sent ?? 0), failed: Number(r?.failed ?? 0) };
  });

  res.json(data);
});

export default router;
