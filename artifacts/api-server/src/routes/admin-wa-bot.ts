import { Router } from "express";
import {
  db,
  adminWaBotSettingsTable,
  adminWaBotSessionsTable,
  adminWaBotBroadcastsTable,
  adminWaBotTicketsTable,
  adminWaBotConvLogsTable,
} from "@workspace/db";
import { eq, desc, and, isNotNull, ilike } from "drizzle-orm";
import { getUserFromToken } from "./auth";
import { sendBroadcast } from "../lib/admin-bot-processor";

function getUser(req: any): number {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  return (token ? getUserFromToken(token) : null) ?? 1;
}

function isAdmin(req: any): boolean {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  if (!token) return false;
  try {
    const { verifyToken } = require("./auth");
    const payload = verifyToken(token);
    return payload?.role === "admin";
  } catch {
    return false;
  }
}

const router = Router();

// ── GET /admin/wa-bot — get settings ─────────────────────────────────────────
router.get("/admin/wa-bot", async (req, res): Promise<void> => {
  const [settings] = await db.select().from(adminWaBotSettingsTable).limit(1);
  res.json(settings ?? null);
});

// ── PUT /admin/wa-bot — update settings ──────────────────────────────────────
router.put("/admin/wa-bot", async (req, res): Promise<void> => {
  const allowed = [
    "deviceId", "isEnabled",
    "welcomeMessage", "menuMessage", "helpMessage", "footerText",
    "sessionTimeoutMinutes", "appName",
    "reminderEnabled", "reminderDaysBefore", "reminderMessage",
    "onboardingEnabled", "onboardingMessage",
  ];
  const data: any = {};
  for (const k of allowed) if (req.body[k] !== undefined) data[k] = req.body[k];

  const [existing] = await db.select().from(adminWaBotSettingsTable).limit(1);
  let result;
  if (existing) {
    [result] = await db.update(adminWaBotSettingsTable).set(data).where(eq(adminWaBotSettingsTable.id, existing.id)).returning();
  } else {
    [result] = await db.insert(adminWaBotSettingsTable).values(data).returning();
  }
  res.json(result);
});

// ── GET /admin/wa-bot/sessions — list active sessions ─────────────────────────
router.get("/admin/wa-bot/sessions", async (req, res): Promise<void> => {
  const limit = Math.min(parseInt((req.query.limit as string) ?? "50", 10), 200);
  const sessions = await db
    .select()
    .from(adminWaBotSessionsTable)
    .orderBy(desc(adminWaBotSessionsTable.lastActivity))
    .limit(limit);
  res.json(sessions);
});

// ── DELETE /admin/wa-bot/sessions/:id — reset a session ───────────────────────
router.delete("/admin/wa-bot/sessions/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(adminWaBotSessionsTable).where(eq(adminWaBotSessionsTable.id, id));
  res.json({ success: true });
});

// ── GET /admin/wa-bot/stats ───────────────────────────────────────────────────
router.get("/admin/wa-bot/stats", async (req, res): Promise<void> => {
  const allSessions = await db.select().from(adminWaBotSessionsTable);
  const now = Date.now();
  const oneDayMs = 24 * 60 * 60 * 1000;

  const totalSessions = allSessions.length;
  const linkedSessions = allSessions.filter((s) => s.userId !== null).length;
  const activeToday = allSessions.filter((s) => now - s.lastActivity.getTime() < oneDayMs).length;
  const awaitingEmail = allSessions.filter((s) => s.step === "await_email").length;

  const openTickets = await db.select().from(adminWaBotTicketsTable).where(eq(adminWaBotTicketsTable.status, "open"));
  const totalBroadcasts = await db.select().from(adminWaBotBroadcastsTable);

  res.json({
    totalSessions,
    linkedSessions,
    activeToday,
    awaitingEmail,
    openTickets: openTickets.length,
    totalBroadcasts: totalBroadcasts.length,
  });
});

// ── BROADCAST ROUTES ──────────────────────────────────────────────────────────

// GET /admin/wa-bot/broadcasts
router.get("/admin/wa-bot/broadcasts", async (req, res): Promise<void> => {
  const broadcasts = await db
    .select()
    .from(adminWaBotBroadcastsTable)
    .orderBy(desc(adminWaBotBroadcastsTable.createdAt))
    .limit(50);
  res.json(broadcasts);
});

// POST /admin/wa-bot/broadcasts — create broadcast
router.post("/admin/wa-bot/broadcasts", async (req, res): Promise<void> => {
  const { title, message } = req.body ?? {};
  if (!title || !message) {
    res.status(400).json({ message: "title dan message wajib diisi" });
    return;
  }

  const [broadcast] = await db
    .insert(adminWaBotBroadcastsTable)
    .values({ title: title.trim(), message: message.trim(), status: "draft" })
    .returning();
  res.json(broadcast);
});

// POST /admin/wa-bot/broadcasts/:id/send — send broadcast
router.post("/admin/wa-bot/broadcasts/:id/send", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const [broadcast] = await db.select().from(adminWaBotBroadcastsTable).where(eq(adminWaBotBroadcastsTable.id, id));
  if (!broadcast) {
    res.status(404).json({ message: "Broadcast tidak ditemukan" });
    return;
  }
  if (broadcast.status === "sending" || broadcast.status === "sent") {
    res.status(400).json({ message: "Broadcast sudah dikirim atau sedang diproses" });
    return;
  }

  // Fire and forget — send in background
  res.json({ message: "Broadcast sedang diproses...", id });
  sendBroadcast(id).catch((err) => console.error("[Broadcast] Error:", err));
});

// DELETE /admin/wa-bot/broadcasts/:id
router.delete("/admin/wa-bot/broadcasts/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(adminWaBotBroadcastsTable).where(eq(adminWaBotBroadcastsTable.id, id));
  res.json({ success: true });
});

// ── TICKET ROUTES ─────────────────────────────────────────────────────────────

// GET /admin/wa-bot/tickets
router.get("/admin/wa-bot/tickets", async (req, res): Promise<void> => {
  const status = req.query.status as string | undefined;
  let query = db.select().from(adminWaBotTicketsTable).orderBy(desc(adminWaBotTicketsTable.createdAt)).$dynamic();
  if (status) {
    query = query.where(eq(adminWaBotTicketsTable.status, status));
  }
  const tickets = await query.limit(100);
  res.json(tickets);
});

// PUT /admin/wa-bot/tickets/:id — update ticket (resolve / add reply)
router.put("/admin/wa-bot/tickets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  const { status, adminReply } = req.body ?? {};
  const data: any = {};
  if (status) data.status = status;
  if (adminReply !== undefined) {
    data.adminReply = adminReply;
    data.repliedAt = new Date();
  }
  const [updated] = await db
    .update(adminWaBotTicketsTable)
    .set(data)
    .where(eq(adminWaBotTicketsTable.id, id))
    .returning();
  res.json(updated);
});

// DELETE /admin/wa-bot/tickets/:id
router.delete("/admin/wa-bot/tickets/:id", async (req, res): Promise<void> => {
  const id = parseInt(req.params.id, 10);
  await db.delete(adminWaBotTicketsTable).where(eq(adminWaBotTicketsTable.id, id));
  res.json({ success: true });
});

// ── CONVERSATION LOG ROUTES ───────────────────────────────────────────────────

// GET /admin/wa-bot/conversations — all conversation logs (latest 200)
router.get("/admin/wa-bot/conversations", async (req, res): Promise<void> => {
  const phone = req.query.phone as string | undefined;
  const limit = Math.min(parseInt((req.query.limit as string) ?? "100", 10), 500);

  let query = db.select().from(adminWaBotConvLogsTable).orderBy(desc(adminWaBotConvLogsTable.createdAt)).$dynamic();
  if (phone) {
    query = query.where(eq(adminWaBotConvLogsTable.phone, phone));
  }
  const logs = await query.limit(limit);
  res.json(logs);
});

// GET /admin/wa-bot/conversations/phones — unique phones with last message
router.get("/admin/wa-bot/conversations/phones", async (req, res): Promise<void> => {
  // Get unique phones and their most recent log entry
  const allLogs = await db
    .select()
    .from(adminWaBotConvLogsTable)
    .orderBy(desc(adminWaBotConvLogsTable.createdAt))
    .limit(500);

  const phoneMap = new Map<string, typeof allLogs[0]>();
  for (const log of allLogs) {
    if (!phoneMap.has(log.phone)) phoneMap.set(log.phone, log);
  }
  res.json(Array.from(phoneMap.values()));
});

// DELETE /admin/wa-bot/conversations — clear all logs
router.delete("/admin/wa-bot/conversations", async (req, res): Promise<void> => {
  await db.delete(adminWaBotConvLogsTable);
  res.json({ success: true });
});

export default router;
