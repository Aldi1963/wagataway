/**
 * Retry Processor — otomatis retry pesan yang gagal dikirim
 * Berjalan setiap 2 menit, retry pesan dengan status "failed" dan retryAt <= now
 */
import { db, messagesTable, devicesTable } from "@workspace/db";
import { eq, lte, and, sql } from "drizzle-orm";
import { getSession } from "./wa-manager";

const MAX_RETRY = 3;
const RETRY_DELAYS_MS = [2 * 60 * 1000, 5 * 60 * 1000, 15 * 60 * 1000]; // 2m, 5m, 15m

export function startRetryProcessor(): void {
  setInterval(processRetries, 2 * 60 * 1000);
  console.log("[Retry] Message retry processor started", { intervalMs: 120000 });
}

async function processRetries(): Promise<void> {
  const now = new Date();
  try {
    const failedMessages = await db
      .select()
      .from(messagesTable)
      .where(
        and(
          eq(messagesTable.status, "failed"),
          lte(messagesTable.retryAt, now),
        )
      )
      .limit(50);

    if (failedMessages.length === 0) return;
    console.log(`[Retry] Processing ${failedMessages.length} failed message(s)`);

    for (const msg of failedMessages) {
      const session = getSession(msg.deviceId);
      if (!session?.socket || session.status !== "connected") continue;

      try {
        const jid = `${msg.phone.replace(/\D/g, "").replace(/^0/, "62")}@s.whatsapp.net`;
        let content: any = { text: msg.message };

        if (msg.messageType === "media" && msg.mediaUrl) {
          content = { image: { url: msg.mediaUrl }, caption: msg.message };
        }

        const sent = await session.socket.sendMessage(jid, content);
        const externalId = sent?.key?.id ?? null;

        await db.update(messagesTable)
          .set({
            status: "sent",
            externalId: externalId ?? msg.externalId,
            retryAt: null,
            failedReason: null,
          })
          .where(eq(messagesTable.id, msg.id));

        await db.update(devicesTable)
          .set({ messagesSent: sql`${devicesTable.messagesSent} + 1` })
          .where(eq(devicesTable.id, msg.deviceId));

        console.log(`[Retry] ✅ Retry success: msg #${msg.id} → ${msg.phone}`);
      } catch (err: any) {
        const nextRetry = (msg.retryCount ?? 0) + 1;
        if (nextRetry >= MAX_RETRY) {
          await db.update(messagesTable)
            .set({ status: "failed", failedReason: `Max retries reached: ${err?.message}`, retryAt: null })
            .where(eq(messagesTable.id, msg.id));
          console.log(`[Retry] ❌ Max retries reached for msg #${msg.id}`);
        } else {
          const delayMs = RETRY_DELAYS_MS[nextRetry] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1];
          await db.update(messagesTable)
            .set({
              retryCount: nextRetry,
              retryAt: new Date(Date.now() + delayMs),
              failedReason: err?.message ?? "Send failed",
            })
            .where(eq(messagesTable.id, msg.id));
          console.log(`[Retry] 🔄 Scheduled retry #${nextRetry} for msg #${msg.id} in ${delayMs / 60000}m`);
        }
      }
    }
  } catch (err) {
    console.error("[Retry] Processor error:", err);
  }
}

/** Mark message as failed and schedule retry */
export function scheduleRetry(messageId: number, reason: string, currentRetry = 0): void {
  const delayMs = RETRY_DELAYS_MS[currentRetry] ?? RETRY_DELAYS_MS[0];
  db.update(messagesTable)
    .set({
      status: "failed",
      failedReason: reason,
      retryAt: new Date(Date.now() + delayMs),
      retryCount: currentRetry + 1,
    })
    .where(eq(messagesTable.id, messageId))
    .catch(() => {});
}
