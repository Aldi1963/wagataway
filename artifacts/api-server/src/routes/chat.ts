import { Router, type IRouter, type Request, type Response } from "express";
import { db, chatInboxTable, devicesTable, contactsTable, chatConversationsTable } from "@workspace/db";
import { eq, and, desc, sql, or, asc, count, gte } from "drizzle-orm";
import { getUserFromToken } from "./auth";
import { getSession } from "../lib/wa-manager";
import { EventEmitter } from "events";
import { generateConversationSummary } from "../lib/cs-bot-ai";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

// Global emitter per deviceId for SSE
const chatEmitters = new Map<number, EventEmitter>();
export function getChatEmitter(deviceId: number): EventEmitter {
  if (!chatEmitters.has(deviceId)) {
    const em = new EventEmitter();
    em.setMaxListeners(50);
    chatEmitters.set(deviceId, em);
  }
  return chatEmitters.get(deviceId)!;
}

// Helper: get contact name from saved contacts
async function resolveContactName(
  userId: number,
  phone: string,
  pushName: string | null
): Promise<string | null> {
  const clean = phone.replace(/\D/g, "");
  const [contact] = await db
    .select({ name: contactsTable.name })
    .from(contactsTable)
    .where(and(eq(contactsTable.userId, userId), eq(contactsTable.phone, clean)));
  return contact?.name ?? pushName ?? null;
}

// GET /chat/conversations?deviceId=X
router.get("/chat/conversations", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const deviceId = parseInt(req.query.deviceId as string, 10);
  if (!deviceId) { res.status(400).json({ message: "deviceId required" }); return; }

  const rows = await db
    .select()
    .from(chatInboxTable)
    .where(and(eq(chatInboxTable.userId, uid), eq(chatInboxTable.deviceId, deviceId)))
    .orderBy(desc(chatInboxTable.timestamp));

  // Group by JID
  const seen = new Map<string, {
    lastMessage: typeof rows[0];
    unread: number;
    contactName: string | null;
  }>();
  for (const row of rows) {
    if (!seen.has(row.jid)) {
      seen.set(row.jid, { lastMessage: row, unread: 0, contactName: row.contactName });
    }
    if (!row.fromMe && !row.isRead) {
      seen.get(row.jid)!.unread++;
    }
  }

  // Resolve contact names from contacts table
  const conversations = await Promise.all(
    Array.from(seen.entries()).map(async ([jid, v]) => {
      const phone = jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
      const savedName = await resolveContactName(uid, phone, v.contactName);
      return {
        jid,
        contactName: savedName,
        phone,
        isGroup: jid.endsWith("@g.us"),
        lastMessage: v.lastMessage.text || (v.lastMessage.mediaType ? `[${v.lastMessage.mediaType}]` : ""),
        lastMessageTime: v.lastMessage.timestamp,
        lastFromMe: v.lastMessage.fromMe,
        unread: v.unread,
      };
    })
  );

  conversations.sort((a, b) => new Date(b.lastMessageTime).getTime() - new Date(a.lastMessageTime).getTime());
  res.json(conversations);
});

// GET /chat/messages?deviceId=X&jid=Y&offset=0&limit=40
router.get("/chat/messages", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const deviceId = parseInt(req.query.deviceId as string, 10);
  const jid = req.query.jid as string;
  const offset = parseInt(req.query.offset as string || "0", 10);
  const limit = Math.min(parseInt(req.query.limit as string || "40", 10), 100);
  if (!deviceId || !jid) { res.status(400).json({ message: "deviceId and jid required" }); return; }

  // Total count
  const [{ count }] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(chatInboxTable)
    .where(and(eq(chatInboxTable.userId, uid), eq(chatInboxTable.deviceId, deviceId), eq(chatInboxTable.jid, jid)));

  const messages = await db
    .select()
    .from(chatInboxTable)
    .where(and(eq(chatInboxTable.userId, uid), eq(chatInboxTable.deviceId, deviceId), eq(chatInboxTable.jid, jid)))
    .orderBy(desc(chatInboxTable.timestamp))
    .offset(offset)
    .limit(limit);

  // Mark incoming as read (only when offset=0 = viewing latest)
  if (offset === 0) {
    await db
      .update(chatInboxTable)
      .set({ isRead: true })
      .where(
        and(
          eq(chatInboxTable.userId, uid),
          eq(chatInboxTable.deviceId, deviceId),
          eq(chatInboxTable.jid, jid),
          eq(chatInboxTable.fromMe, false),
          eq(chatInboxTable.isRead, false)
        )
      );
  }

  res.json({ messages: messages.reverse(), total: count, hasMore: offset + limit < count });
});

// POST /chat/send
router.post("/chat/send", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const { deviceId, jid, text, replyTo } = req.body;
  if (!deviceId || !jid || !text?.trim()) {
    res.status(400).json({ message: "deviceId, jid, and text required" });
    return;
  }

  const devId = parseInt(deviceId, 10);
  const session = getSession(devId);
  if (!session || session.status !== "connected" || !session.socket) {
    res.status(400).json({ message: "Perangkat tidak terhubung" });
    return;
  }

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, devId));
  if (!device) { res.status(404).json({ message: "Device not found" }); return; }

  // Build message content (with optional quote reply)
  let waContent: any = { text: text.trim() };
  if (replyTo?.messageId) {
    waContent = {
      text: text.trim(),
      contextInfo: {
        stanzaId: replyTo.messageId,
        participant: jid,
        quotedMessage: { conversation: replyTo.text || "" },
      },
    };
  }

  const sent = await session.socket.sendMessage(jid, waContent);

  const [saved] = await db
    .insert(chatInboxTable)
    .values({
      userId: uid,
      deviceId: devId,
      jid,
      contactName: null,
      fromMe: true,
      messageId: sent?.key?.id ?? null,
      text: text.trim(),
      status: "sent",
      isRead: true,
    })
    .returning();

  // ── Auto-pause bot when admin replies manually ──────────────────────────
  try {
    await pauseConvBot(uid, devId, jid);
  } catch (err) {
    console.error("[chat] Failed to pause bot:", err);
  }

  getChatEmitter(devId).emit("message", saved);
  res.json(saved);
});

// DELETE /chat/conversations/:jid - Delete all messages in a conversation
router.delete("/chat/conversations/:jid", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const { deviceId } = req.query;
  const jid = decodeURIComponent(req.params.jid as string);
  if (!deviceId) { res.status(400).json({ message: "deviceId required" }); return; }

  await db
    .delete(chatInboxTable)
    .where(
      and(
        eq(chatInboxTable.userId, uid),
        eq(chatInboxTable.deviceId, parseInt(deviceId as string, 10)),
        eq(chatInboxTable.jid, jid)
      )
    );
  res.json({ success: true });
});

// PATCH /chat/conversations/:jid/read - Mark conversation as unread
router.patch("/chat/conversations/:jid/unread", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const { deviceId } = req.query;
  const jid = decodeURIComponent(req.params.jid as string);
  if (!deviceId) { res.status(400).json({ message: "deviceId required" }); return; }

  // Mark the last incoming message as unread
  const [last] = await db
    .select()
    .from(chatInboxTable)
    .where(
      and(
        eq(chatInboxTable.userId, uid),
        eq(chatInboxTable.deviceId, parseInt(deviceId as string, 10)),
        eq(chatInboxTable.jid, jid),
        eq(chatInboxTable.fromMe, false)
      )
    )
    .orderBy(desc(chatInboxTable.timestamp))
    .limit(1);

  if (last) {
    await db
      .update(chatInboxTable)
      .set({ isRead: false })
      .where(eq(chatInboxTable.id, last.id));
  }
  res.json({ success: true });
});

// ── Conversation helpers ───────────────────────────────────────────────────────

async function getOrCreateConv(userId: number, deviceId: number, jid: string, contactName?: string | null) {
  const [existing] = await db.select().from(chatConversationsTable)
    .where(and(eq(chatConversationsTable.userId, userId), eq(chatConversationsTable.deviceId, deviceId), eq(chatConversationsTable.jid, jid)));
  if (existing) return existing;
  const [created] = await db.insert(chatConversationsTable)
    .values({ userId, deviceId, jid, contactName: contactName ?? null, status: "open" })
    .returning();
  return created!;
}

export async function isConvBotPaused(userId: number, deviceId: number, jid: string): Promise<boolean> {
  const [conv] = await db.select({ botPaused: chatConversationsTable.botPaused })
    .from(chatConversationsTable)
    .where(and(eq(chatConversationsTable.userId, userId), eq(chatConversationsTable.deviceId, deviceId), eq(chatConversationsTable.jid, jid)));
  return conv?.botPaused ?? false;
}

export async function pauseConvBot(userId: number, deviceId: number, jid: string, contactName?: string): Promise<void> {
  const conv = await getOrCreateConv(userId, deviceId, jid, contactName);
  await db.update(chatConversationsTable)
    .set({ botPaused: true, status: "pending", updatedAt: new Date() })
    .where(eq(chatConversationsTable.id, conv.id));
  getChatEmitter(deviceId).emit("conv_update", { ...conv, botPaused: true, status: "pending" });
}

// GET /chat/conversation/:jid?deviceId=X — get conv metadata
router.get("/chat/conversation/:jid", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const jid = decodeURIComponent(req.params.jid as string);
  const deviceId = parseInt(req.query.deviceId as string, 10);
  if (!deviceId) { res.status(400).json({ message: "deviceId required" }); return; }
  const conv = await getOrCreateConv(uid, deviceId, jid);
  res.json(conv);
});

// PUT /chat/conversation/:jid/status?deviceId=X
router.put("/chat/conversation/:jid/status", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const jid = decodeURIComponent(req.params.jid as string);
  const deviceId = parseInt(req.query.deviceId as string, 10);
  const { status } = req.body;
  if (!deviceId || !status) { res.status(400).json({ message: "deviceId and status required" }); return; }
  const conv = await getOrCreateConv(uid, deviceId, jid);
  const [updated] = await db.update(chatConversationsTable)
    .set({ status, resolvedAt: status === "resolved" ? new Date() : null, updatedAt: new Date() })
    .where(eq(chatConversationsTable.id, conv.id))
    .returning();
  getChatEmitter(deviceId).emit("conv_update", updated);
  res.json(updated);
});

// PUT /chat/conversation/:jid/assign?deviceId=X
router.put("/chat/conversation/:jid/assign", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const jid = decodeURIComponent(req.params.jid as string);
  const deviceId = parseInt(req.query.deviceId as string, 10);
  const { assignedAgent } = req.body;
  if (!deviceId) { res.status(400).json({ message: "deviceId required" }); return; }
  const conv = await getOrCreateConv(uid, deviceId, jid);
  const [updated] = await db.update(chatConversationsTable)
    .set({ assignedAgent: assignedAgent ?? null, status: assignedAgent ? "in_progress" : conv.status, updatedAt: new Date() })
    .where(eq(chatConversationsTable.id, conv.id))
    .returning();
  getChatEmitter(deviceId).emit("conv_update", updated);
  res.json(updated);
});

// PUT /chat/conversation/:jid/tags?deviceId=X
router.put("/chat/conversation/:jid/tags", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const jid = decodeURIComponent(req.params.jid as string);
  const deviceId = parseInt(req.query.deviceId as string, 10);
  const { tags } = req.body;
  if (!deviceId) { res.status(400).json({ message: "deviceId required" }); return; }
  const conv = await getOrCreateConv(uid, deviceId, jid);
  const [updated] = await db.update(chatConversationsTable)
    .set({ tags: Array.isArray(tags) ? tags.join(",") : (tags ?? ""), updatedAt: new Date() })
    .where(eq(chatConversationsTable.id, conv.id))
    .returning();
  res.json(updated);
});

// PUT /chat/conversation/:jid/bot-pause?deviceId=X
router.put("/chat/conversation/:jid/bot-pause", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const jid = decodeURIComponent(req.params.jid as string);
  const deviceId = parseInt(req.query.deviceId as string, 10);
  const { botPaused } = req.body;
  if (!deviceId) { res.status(400).json({ message: "deviceId required" }); return; }
  const conv = await getOrCreateConv(uid, deviceId, jid);
  const [updated] = await db.update(chatConversationsTable)
    .set({ botPaused: !!botPaused, updatedAt: new Date() })
    .where(eq(chatConversationsTable.id, conv.id))
    .returning();
  getChatEmitter(deviceId).emit("conv_update", updated);
  res.json(updated);
});

// PUT /chat/conversation/:jid/sla?deviceId=X
router.put("/chat/conversation/:jid/sla", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const jid = decodeURIComponent(req.params.jid as string);
  const deviceId = parseInt(req.query.deviceId as string, 10);
  const { slaDeadline } = req.body;
  if (!deviceId) { res.status(400).json({ message: "deviceId required" }); return; }
  const conv = await getOrCreateConv(uid, deviceId, jid);
  const [updated] = await db.update(chatConversationsTable)
    .set({ slaDeadline: slaDeadline ? new Date(slaDeadline) : null, updatedAt: new Date() })
    .where(eq(chatConversationsTable.id, conv.id))
    .returning();
  res.json(updated);
});

// POST /chat/conversation/:jid/summarize?deviceId=X
router.post("/chat/conversation/:jid/summarize", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const jid = decodeURIComponent(req.params.jid as string);
  const deviceId = parseInt(req.query.deviceId as string, 10);
  if (!deviceId) { res.status(400).json({ message: "deviceId required" }); return; }

  const conv = await getOrCreateConv(uid, deviceId, jid);
  
  // Get last 40 messages for context
  const messages = await db
    .select({ fromMe: chatInboxTable.fromMe, text: chatInboxTable.text, contactName: chatInboxTable.contactName })
    .from(chatInboxTable)
    .where(and(eq(chatInboxTable.userId, uid), eq(chatInboxTable.deviceId, deviceId), eq(chatInboxTable.jid, jid)))
    .orderBy(desc(chatInboxTable.timestamp))
    .limit(40);

  if (messages.length === 0) {
    res.status(400).json({ message: "No messages to summarize" });
    return;
  }

  const summary = await generateConversationSummary(uid, messages.reverse());
  
  if (!summary) {
    res.status(500).json({ message: "Failed to generate summary" });
    return;
  }

  const [updated] = await db.update(chatConversationsTable)
    .set({ summary, summaryUpdatedAt: new Date(), updatedAt: new Date() })
    .where(eq(chatConversationsTable.id, conv.id))
    .returning();

  getChatEmitter(deviceId).emit("conv_update", updated);
  res.json(updated);
});

// POST /chat/conversation/:jid/note?deviceId=X — add internal note
router.post("/chat/conversation/:jid/note", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const jid = decodeURIComponent(req.params.jid as string);
  const deviceId = parseInt(req.query.deviceId as string, 10);
  const { text, author } = req.body;
  if (!deviceId || !text?.trim()) { res.status(400).json({ message: "deviceId and text required" }); return; }
  const [note] = await db.insert(chatInboxTable).values({
    userId: uid,
    deviceId,
    jid,
    contactName: author ?? "Anda",
    fromMe: true,
    text: text.trim(),
    status: "note",
    isRead: true,
    isInternal: true,
  }).returning();
  getChatEmitter(deviceId).emit("message", note);
  res.json(note);
});

// GET /chat/reports?deviceId=X
router.get("/chat/reports", async (req: Request, res: Response): Promise<void> => {
  const uid = getUser(req);
  const deviceId = parseInt(req.query.deviceId as string, 10);
  if (!deviceId) { res.status(400).json({ message: "deviceId required" }); return; }

  const convs = await db.select().from(chatConversationsTable)
    .where(and(eq(chatConversationsTable.userId, uid), eq(chatConversationsTable.deviceId, deviceId)));

  const byStatus: Record<string, number> = { open: 0, in_progress: 0, resolved: 0, pending: 0 };
  const byAgent: Record<string, number> = {};
  const byTag: Record<string, number> = {};

  for (const c of convs) {
    byStatus[c.status] = (byStatus[c.status] ?? 0) + 1;
    if (c.assignedAgent) byAgent[c.assignedAgent] = (byAgent[c.assignedAgent] ?? 0) + 1;
    if (c.tags) {
      for (const t of c.tags.split(",").filter(Boolean)) {
        byTag[t.trim()] = (byTag[t.trim()] ?? 0) + 1;
      }
    }
  }

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const resolvedToday = convs.filter(c => c.resolvedAt && new Date(c.resolvedAt) >= today).length;
  const slaBreached = convs.filter(c => c.slaDeadline && new Date(c.slaDeadline) < new Date() && c.status !== "resolved").length;
  const totalMessages = await db.select({ count: sql<number>`count(*)::int` })
    .from(chatInboxTable)
    .where(and(eq(chatInboxTable.userId, uid), eq(chatInboxTable.deviceId, deviceId)));

  res.json({
    totalConversations: convs.length,
    byStatus,
    byAgent,
    byTag,
    resolvedToday,
    slaBreached,
    totalMessages: totalMessages[0]?.count ?? 0,
  });
});

// GET /chat/stream?deviceId=X (SSE)
router.get("/chat/stream", (req: Request, res: Response): void => {
  const deviceId = parseInt(req.query.deviceId as string, 10);
  if (!deviceId) { res.status(400).end(); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ deviceId })}\n\n`);

  const heartbeat = setInterval(() => res.write(": heartbeat\n\n"), 20000);

  const emitter = getChatEmitter(deviceId);
  const onMessage = (msg: any) => {
    res.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`);
  };
  const onConvUpdate = (conv: any) => {
    res.write(`event: conv_update\ndata: ${JSON.stringify(conv)}\n\n`);
  };
  emitter.on("message", onMessage);
  emitter.on("conv_update", onConvUpdate);

  req.on("close", () => {
    clearInterval(heartbeat);
    emitter.off("message", onMessage);
    emitter.off("conv_update", onConvUpdate);
  });
});

export default router;
