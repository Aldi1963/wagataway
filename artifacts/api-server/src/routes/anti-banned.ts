import { Router, type IRouter } from "express";
import { db, devicesTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { getUserFromToken } from "./auth";
import { personalizeMessage } from "../lib/anti-banned";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

function fmtSettings(d: any) {
  return {
    antiBannedEnabled: d.antiBannedEnabled,
    minDelay: d.minDelay,
    maxDelay: d.maxDelay,
    typingSimulation: d.typingSimulation,
    typingDuration: d.typingDuration,
    readSimulation: d.readSimulation,
    autoRead: d.autoRead,
    autoOnline: d.autoOnline,
    warmupMode: d.warmupMode,
    warmupCurrentLimit: d.warmupCurrentLimit,
    warmupIncrement: d.warmupIncrement,
    warmupMaxLimit: d.warmupMaxLimit,
    dailyLimit: d.dailyLimit,
    warmupLastUpdated: d.warmupLastUpdated?.toISOString() ?? null,
  };
}

// GET /api/devices/:id/anti-banned
router.get("/devices/:id/anti-banned", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const devId = parseInt(req.params.id, 10);

  const [device] = await db
    .select()
    .from(devicesTable)
    .where(and(eq(devicesTable.id, devId), eq(devicesTable.userId, uid)));

  if (!device) { res.status(404).json({ message: "Device not found" }); return; }

  res.json(fmtSettings(device));
});

// PUT /api/devices/:id/anti-banned
router.put("/devices/:id/anti-banned", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const devId = parseInt(req.params.id, 10);

  const [existing] = await db
    .select()
    .from(devicesTable)
    .where(and(eq(devicesTable.id, devId), eq(devicesTable.userId, uid)));

  if (!existing) { res.status(404).json({ message: "Device not found" }); return; }

  const {
    antiBannedEnabled,
    minDelay,
    maxDelay,
    typingSimulation,
    typingDuration,
    readSimulation,
    autoRead,
    autoOnline,
    warmupMode,
    warmupCurrentLimit,
    warmupIncrement,
    warmupMaxLimit,
    dailyLimit,
  } = req.body;

  const [updated] = await db
    .update(devicesTable)
    .set({
      ...(antiBannedEnabled !== undefined && { antiBannedEnabled }),
      ...(minDelay !== undefined && { minDelay: Math.max(0, parseInt(minDelay, 10)) }),
      ...(maxDelay !== undefined && { maxDelay: Math.max(1, parseInt(maxDelay, 10)) }),
      ...(typingSimulation !== undefined && { typingSimulation }),
      ...(typingDuration !== undefined && { typingDuration: Math.max(1, parseInt(typingDuration, 10)) }),
      ...(readSimulation !== undefined && { readSimulation }),
      ...(autoRead !== undefined && { autoRead }),
      ...(autoOnline !== undefined && { autoOnline }),
      ...(warmupMode !== undefined && { warmupMode }),
      ...(warmupCurrentLimit !== undefined && { warmupCurrentLimit: Math.max(1, parseInt(warmupCurrentLimit, 10)) }),
      ...(warmupIncrement !== undefined && { warmupIncrement: Math.max(1, parseInt(warmupIncrement, 10)) }),
      ...(warmupMaxLimit !== undefined && { warmupMaxLimit: Math.max(1, parseInt(warmupMaxLimit, 10)) }),
      ...(dailyLimit !== undefined && { dailyLimit: Math.max(0, parseInt(dailyLimit, 10)) }),
    })
    .where(and(eq(devicesTable.id, devId), eq(devicesTable.userId, uid)))
    .returning();

  res.json(fmtSettings(updated));
});

// POST /api/anti-banned/spin-preview — preview message spinning without sending
router.post("/anti-banned/spin-preview", (req, res): void => {
  const { message, count = 5, name } = req.body;
  if (!message) { res.status(400).json({ message: "message is required" }); return; }

  const n = Math.min(Math.max(1, parseInt(count, 10)), 20);
  const placeholderName = name ?? "Budi";
  const previews = Array.from({ length: n }, () => personalizeMessage(message, placeholderName));

  res.json({ previews, note: `Variabel {{name}} diganti dengan "${placeholderName}" untuk preview` });
});

export default router;
