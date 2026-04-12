import { Router, type IRouter } from "express";
import { db, devicesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateDeviceBody,
} from "@workspace/api-zod";
import { getUserFromToken } from "./auth";
import { startSession, requestPairingCode, disconnectSession, getSession, getGroups as getGroupsFromManager } from "../lib/wa-manager";
import { getUserPlan, countUserDevices, limitError } from "../lib/plan-limits";

const router: IRouter = Router();

function getUser(req: any): number {
  const headerToken = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  const queryToken = req.query?.token as string | undefined;
  const token = headerToken ?? queryToken;
  return (token ? getUserFromToken(token) : null) ?? 1;
}

router.get("/devices", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const devices = await db.select().from(devicesTable).where(eq(devicesTable.userId, uid));
  res.json(
    devices.map((d) => ({
      id: String(d.id),
      name: d.name,
      phone: d.phone,
      status: d.status,
      provider: d.provider,
      officialPhoneId: d.officialPhoneId,
      officialBusinessAccountId: d.officialBusinessAccountId,
      officialAccessToken: d.officialAccessToken,
      battery: d.battery,
      lastSeen: d.lastSeen?.toISOString(),
      autoReconnect: d.autoReconnect,
      notifyOnDisconnect: d.notifyOnDisconnect,
      notifyOnConnect: d.notifyOnConnect,
      messagesSent: d.messagesSent,
      createdAt: d.createdAt?.toISOString(),
      rotationEnabled: d.rotationEnabled ?? false,
      rotationWeight: d.rotationWeight ?? 1,
      rotationGroup: d.rotationGroup ?? "default",
    }))
  );
});

router.post("/devices", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { 
    name, phone, provider, officialPhoneId, officialBusinessAccountId, officialAccessToken, autoReconnect 
  } = req.body;

  const [device] = await db
    .insert(devicesTable)
    .values({
      userId: uid,
      name: name,
      phone: phone ?? null,
      provider: provider || "baileys",
      officialPhoneId: officialPhoneId ?? null,
      officialBusinessAccountId: officialBusinessAccountId ?? null,
      officialAccessToken: officialAccessToken ?? null,
      autoReconnect: autoReconnect ?? true,
      status: provider === "official" ? "connected" : "disconnected",
      messagesSent: 0,
    })
    .returning();

  res.status(201).json({
    id: String(device.id),
    name: device.name,
    phone: device.phone,
    status: device.status,
    provider: device.provider,
    officialPhoneId: device.officialPhoneId,
    battery: device.battery,
    lastSeen: device.lastSeen?.toISOString(),
    autoReconnect: device.autoReconnect,
    messagesSent: device.messagesSent,
    createdAt: device.createdAt?.toISOString(),
  });
});

router.get("/devices/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const [device] = await db
    .select()
    .from(devicesTable)
    .where(and(eq(devicesTable.id, id), eq(devicesTable.userId, uid)));

  if (!device) {
    res.status(404).json({ message: "Device not found", code: "NOT_FOUND" });
    return;
  }

  res.json({
    id: String(device.id),
    name: device.name,
    phone: device.phone,
    status: device.status,
    battery: device.battery,
    lastSeen: device.lastSeen?.toISOString(),
    autoReconnect: device.autoReconnect,
    messagesSent: device.messagesSent,
    createdAt: device.createdAt?.toISOString(),
    rotationEnabled: device.rotationEnabled ?? false,
    rotationWeight: device.rotationWeight ?? 1,
    rotationGroup: device.rotationGroup ?? "default",
  });
});

router.put("/devices/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const { 
    name, phone, autoReconnect, notifyOnDisconnect, notifyOnConnect, 
    rotationEnabled, rotationWeight, rotationGroup, status,
    provider, officialPhoneId, officialBusinessAccountId, officialAccessToken
  } = req.body;

  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (phone !== undefined) updates.phone = phone;
  if (status !== undefined) updates.status = status;
  if (provider !== undefined) updates.provider = provider;
  if (officialPhoneId !== undefined) updates.officialPhoneId = officialPhoneId;
  if (officialBusinessAccountId !== undefined) updates.officialBusinessAccountId = officialBusinessAccountId;
  if (officialAccessToken !== undefined) updates.officialAccessToken = officialAccessToken;
  if (autoReconnect !== undefined) updates.autoReconnect = autoReconnect;
  if (notifyOnDisconnect !== undefined) updates.notifyOnDisconnect = notifyOnDisconnect;
  if (notifyOnConnect !== undefined) updates.notifyOnConnect = notifyOnConnect;
  if (rotationEnabled !== undefined) updates.rotationEnabled = Boolean(rotationEnabled);
  if (rotationWeight !== undefined) updates.rotationWeight = Math.max(1, Math.min(100, parseInt(rotationWeight, 10) || 1));
  if (rotationGroup !== undefined) updates.rotationGroup = String(rotationGroup);

  const [device] = await db
    .update(devicesTable)
    .set(updates)
    .where(and(eq(devicesTable.id, id), eq(devicesTable.userId, uid)))
    .returning();

  if (!device) { res.status(404).json({ message: "Device not found" }); return; }
  res.json({ 
    id: String(device.id), 
    name: device.name, 
    phone: device.phone, 
    status: device.status, 
    provider: device.provider,
    autoReconnect: device.autoReconnect, 
    notifyOnDisconnect: device.notifyOnDisconnect, 
    notifyOnConnect: device.notifyOnConnect 
  });
});

router.delete("/devices/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  await disconnectSession(id);
  await db
    .delete(devicesTable)
    .where(and(eq(devicesTable.id, id), eq(devicesTable.userId, uid)));

  res.sendStatus(204);
});

router.patch("/devices/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const { status, officialPhoneId, officialBusinessAccountId, officialAccessToken } = req.body;

  const updates: any = {};
  if (status !== undefined) updates.status = status;
  if (officialPhoneId !== undefined) updates.officialPhoneId = officialPhoneId;
  if (officialBusinessAccountId !== undefined) updates.officialBusinessAccountId = officialBusinessAccountId;
  if (officialAccessToken !== undefined) updates.officialAccessToken = officialAccessToken;

  const [device] = await db
    .update(devicesTable)
    .set(updates)
    .where(and(eq(devicesTable.id, id), eq(devicesTable.userId, uid)))
    .returning();

  if (!device) {
    res.status(404).json({ message: "Device not found" });
    return;
  }

  res.json({
    id: String(device.id),
    status: device.status,
    officialPhoneId: device.officialPhoneId,
  });
});

// ── SSE endpoint: streams QR codes and connection status ──────────────────────
router.get("/devices/:id/qr-stream", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const [device] = await db.select().from(devicesTable).where(and(eq(devicesTable.id, id), eq(devicesTable.userId, uid)));
  if (!device) { res.status(404).json({ message: "Device not found" }); return; }
  if (device.status === "connected") { res.status(200).json({ status: "already_connected" }); return; }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (event: string, data: object) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  send("status", { status: "connecting" });

  let state;
  try {
    state = await startSession(id);
  } catch (e: any) {
    send("error", { message: e.message ?? "Failed to start session" });
    res.end();
    return;
  }

  if (state.qr) {
    send("qr", { qr: state.qr, expiresAt: state.qrExpiresAt });
  }

  const onQr = (data: any) => send("qr", data);
  const onConnected = (data: any) => { send("connected", data); res.end(); };
  const onDisconnected = (data: any) => { send("disconnected", data); res.end(); };

  state.events.on("qr", onQr);
  state.events.once("connected", onConnected);
  state.events.once("disconnected", onDisconnected);

  req.on("close", () => {
    state!.events.off("qr", onQr);
    state!.events.off("connected", onConnected);
    state!.events.off("disconnected", onDisconnected);
  });

  // Heartbeat
  const heartbeat = setInterval(() => {
    if (!res.writableEnded) res.write(": heartbeat\n\n");
    else clearInterval(heartbeat);
  }, 15000);

  req.on("close", () => clearInterval(heartbeat));
});

// ── Pairing code ──────────────────────────────────────────────────────────────
router.post("/devices/:id/pair-phone", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);
  const { phone } = req.body;

  if (!phone || typeof phone !== "string") {
    res.status(400).json({ message: "Nomor HP wajib diisi" });
    return;
  }

  const [device] = await db.select().from(devicesTable).where(and(eq(devicesTable.id, id), eq(devicesTable.userId, uid)));
  if (!device) { res.status(404).json({ message: "Device not found" }); return; }

  try {
    const pairingCode = await requestPairingCode(id, phone.replace(/\D/g, ""));
    res.json({
      pairingCode,
      expiresAt: new Date(Date.now() + 160000).toISOString(),
      message: "Masukkan kode ini di WhatsApp > Perangkat Tertaut > Tautkan Perangkat > Tautkan dengan nomor HP",
    });
  } catch (e: any) {
    res.status(500).json({ message: e.message ?? "Gagal mendapatkan kode pairing" });
  }
});

// ── Connect / reconnect ───────────────────────────────────────────────────────
router.post("/devices/:id/connect", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  const [device] = await db.select().from(devicesTable).where(and(eq(devicesTable.id, id), eq(devicesTable.userId, uid)));
  if (!device) { res.status(404).json({ message: "Device not found" }); return; }

  const existing = getSession(id);
  if (existing?.status === "connected") {
    res.json({ status: "connected", message: "Device already connected" });
    return;
  }

  // Start session in background; return immediately
  startSession(id).catch((e) => console.error(`[WA] Session start error for ${id}:`, e));
  res.json({ status: "connecting", message: "Reconnecting... Use GET /devices/:id/qr-stream for QR code if needed", deviceId: id });
});

router.post("/devices/:id/disconnect", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const rawId = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const id = parseInt(rawId, 10);

  await disconnectSession(id);
  res.json({ success: true });
});

/** GET /devices/:id/groups — list grup WA dari perangkat */
router.get("/devices/:id/groups", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);

  const [device] = await db.select({ id: devicesTable.id, userId: devicesTable.userId })
    .from(devicesTable).where(eq(devicesTable.id, id));
  if (!device || device.userId !== uid) {
    res.status(404).json({ message: "Perangkat tidak ditemukan" });
    return;
  }

  try {
    const groups = await getGroupsFromManager(id);
    res.json(groups);
  } catch (err: any) {
    res.status(400).json({ message: err?.message ?? "Gagal mengambil daftar grup" });
  }
});

export default router;
