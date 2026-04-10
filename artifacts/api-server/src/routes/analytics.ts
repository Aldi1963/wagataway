import { Router, type IRouter } from "express";
import { db, messagesTable, devicesTable, chatInboxTable } from "@workspace/db";
import { eq, and, gte, sql, desc } from "drizzle-orm";
import { getUserFromToken } from "./auth";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

/** GET /analytics/messages — trend pesan 30 hari terakhir by day */
router.get("/analytics/messages", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const days = parseInt(String(req.query.days ?? "30"), 10);
  const since = new Date(Date.now() - days * 86400000);

  const sent = await db.execute(sql`
    SELECT date_trunc('day', created_at AT TIME ZONE 'Asia/Jakarta') AS day,
           COUNT(*) AS count,
           status
    FROM messages
    WHERE user_id = ${uid} AND created_at >= ${since}
    GROUP BY 1, status
    ORDER BY 1
  `);

  const received = await db.execute(sql`
    SELECT date_trunc('day', timestamp AT TIME ZONE 'Asia/Jakarta') AS day,
           COUNT(*) AS count
    FROM chat_inbox
    WHERE user_id = ${uid} AND timestamp >= ${since}
    GROUP BY 1
    ORDER BY 1
  `);

  res.json({
    sent: sent.rows,
    received: received.rows,
  });
});

/** GET /analytics/heatmap — distribusi pesan per jam & hari seminggu */
router.get("/analytics/heatmap", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const since = new Date(Date.now() - 30 * 86400000);

  const rows = await db.execute(sql`
    SELECT EXTRACT(DOW FROM created_at AT TIME ZONE 'Asia/Jakarta')::int AS dow,
           EXTRACT(HOUR FROM created_at AT TIME ZONE 'Asia/Jakarta')::int AS hour,
           COUNT(*) AS count
    FROM messages
    WHERE user_id = ${uid} AND created_at >= ${since}
    GROUP BY 1, 2
    ORDER BY 1, 2
  `);

  res.json(rows.rows);
});

/** GET /analytics/devices — performa per device */
router.get("/analytics/devices", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const since = new Date(Date.now() - 30 * 86400000);

  const rows = await db.execute(sql`
    SELECT d.id, d.name, d.phone, d.status,
           COUNT(m.id) FILTER (WHERE m.status = 'sent') AS sent,
           COUNT(m.id) FILTER (WHERE m.status = 'failed') AS failed,
           COUNT(m.id) FILTER (WHERE m.status = 'pending') AS pending,
           ROUND(
             CASE WHEN COUNT(m.id) > 0
               THEN COUNT(m.id) FILTER (WHERE m.status = 'sent') * 100.0 / COUNT(m.id)
               ELSE 0 END, 1
           ) AS success_rate
    FROM devices d
    LEFT JOIN messages m ON m.device_id = d.id AND m.created_at >= ${since}
    WHERE d.user_id = ${uid}
    GROUP BY d.id, d.name, d.phone, d.status
    ORDER BY sent DESC
  `);

  res.json(rows.rows);
});

/** GET /analytics/summary — ringkasan cepat */
router.get("/analytics/summary", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const thisMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const todaySentRes = await db.execute(sql`
    SELECT COUNT(*) AS count FROM messages WHERE user_id = ${uid} AND status = 'sent' AND created_at >= ${today}
  `);
  const monthSentRes = await db.execute(sql`
    SELECT COUNT(*) AS count FROM messages WHERE user_id = ${uid} AND status = 'sent' AND created_at >= ${thisMonth}
  `);
  const totalFailedRes = await db.execute(sql`
    SELECT COUNT(*) AS count FROM messages WHERE user_id = ${uid} AND status = 'failed'
  `);
  const totalReceivedRes = await db.execute(sql`
    SELECT COUNT(*) AS count FROM chat_inbox WHERE user_id = ${uid} AND timestamp >= ${thisMonth}
  `);

  res.json({
    todaySent: Number((todaySentRes.rows[0] as any)?.count ?? 0),
    monthSent: Number((monthSentRes.rows[0] as any)?.count ?? 0),
    totalFailed: Number((totalFailedRes.rows[0] as any)?.count ?? 0),
    monthReceived: Number((totalReceivedRes.rows[0] as any)?.count ?? 0),
  });
});

export default router;
