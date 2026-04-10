import { db, devicesTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

// ── Delay Utilities ─────────────────────────────────────────────────────────

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function randomDelay(minSec: number, maxSec: number): Promise<void> {
  const ms = (minSec + Math.random() * (maxSec - minSec)) * 1000;
  return sleep(ms);
}

// ── Message Spinning ─────────────────────────────────────────────────────────
// Syntax: {option1|option2|option3}
// Example: "{Halo|Hi|Hey} {nama|kamu}, pesanan kamu sudah {siap|dikirim}!"
// Nested not supported. Only the outermost {} are processed.

export function spinMessage(template: string): string {
  return template.replace(/\{([^{}]+)\}/g, (_, group: string) => {
    const options = group.split("|");
    return options[Math.floor(Math.random() * options.length)]!;
  });
}

// ── Personalise + Spin ───────────────────────────────────────────────────────
// Also replaces {{name}} or {name} with recipient name if provided

export function personalizeMessage(template: string, name?: string): string {
  let msg = template;

  if (name) {
    msg = msg
      .replace(/\{\{name\}\}/gi, name)
      .replace(/\{\{nama\}\}/gi, name)
      .replace(/%name%/gi, name)
      .replace(/%nama%/gi, name);
  }

  return spinMessage(msg);
}

// ── Typing Simulation ────────────────────────────────────────────────────────

export async function simulateTyping(
  socket: any,
  jid: string,
  durationSec: number
): Promise<void> {
  try {
    await socket.sendPresenceUpdate("composing", jid);
    await sleep(durationSec * 1000);
    await socket.sendPresenceUpdate("paused", jid);
  } catch (err) {
    logger.warn({ err, jid }, "Typing simulation failed (non-fatal)");
  }
}

// ── Warmup Mode ──────────────────────────────────────────────────────────────
// Checks if warmup daily limit has been reached for the device today.
// Also increments the warmup limit if a new day has passed.

export async function getEffectiveDailyLimit(
  device: {
    dailyLimit: number;
    warmupMode: boolean;
    warmupCurrentLimit: number;
    warmupIncrement: number;
    warmupMaxLimit: number;
    warmupLastUpdated: Date | null;
    id: number;
  },
  planDailyLimit: number
): Promise<number> {
  if (device.warmupMode) {
    let current = device.warmupCurrentLimit;
    const lastUpdated = device.warmupLastUpdated;
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (!lastUpdated || lastUpdated < today) {
      const newLimit = Math.min(
        current + device.warmupIncrement,
        device.warmupMaxLimit
      );

      await db
        .update(devicesTable)
        .set({ warmupCurrentLimit: newLimit, warmupLastUpdated: new Date() })
        .where(eq(devicesTable.id, device.id));

      logger.info(
        { deviceId: device.id, oldLimit: current, newLimit },
        "Warmup mode: daily limit increased"
      );

      current = newLimit;
    }

    return current;
  }

  if (device.dailyLimit > 0) return device.dailyLimit;

  return planDailyLimit === -1 ? Infinity : planDailyLimit;
}

// ── Anti-Banned Sender ───────────────────────────────────────────────────────
// Sends a single message with full anti-banned protections applied.

export interface SendOptions {
  socket: any;
  jid: string;
  message: string;
  recipientName?: string;
  minDelay?: number;
  maxDelay?: number;
  typingSimulation?: boolean;
  typingDuration?: number;
  applyDelay?: boolean;
}

export async function sendWithAntiBanned({
  socket,
  jid,
  message,
  recipientName,
  minDelay = 3,
  maxDelay = 10,
  typingSimulation = true,
  typingDuration = 2,
  applyDelay = true,
}: SendOptions): Promise<void> {
  const spun = personalizeMessage(message, recipientName);

  if (typingSimulation) {
    await simulateTyping(socket, jid, typingDuration);
  }

  await socket.sendMessage(jid, { text: spun });

  if (applyDelay) {
    await randomDelay(minDelay, maxDelay);
  }
}
