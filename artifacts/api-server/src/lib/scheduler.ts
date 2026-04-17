import { db, scheduledMessagesTable, messagesTable, devicesTable, subscriptionsTable, usersTable, walletTransactionsTable, bulkJobsTable } from "@workspace/db";
import { eq, and, lte, sql } from "drizzle-orm";
import { getSession } from "./wa-manager";
import { sendWithAntiBanned } from "./anti-banned";
import { logger } from "./logger";
import { getPlansFromDb, activatePlan } from "../routes/billing";
import { processDripCampaigns } from "./drip-processor";
import { processBulkJob } from "./bulk-processor";

let schedulerTimer: ReturnType<typeof setInterval> | null = null;

function nextScheduledAt(current: Date, repeat: string): Date | null {
  const next = new Date(current);
  switch (repeat) {
    case "daily":
      next.setDate(next.getDate() + 1);
      return next;
    case "weekly":
      next.setDate(next.getDate() + 7);
      return next;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      return next;
    default:
      return null;
  }
}

async function processScheduledMessages(): Promise<void> {
  try {
    const now = new Date();

    const pending = await db
      .select()
      .from(scheduledMessagesTable)
      .where(
        and(
          eq(scheduledMessagesTable.status, "pending"),
          lte(scheduledMessagesTable.scheduledAt, now)
        )
      );

    if (pending.length === 0) return;

    logger.info({ count: pending.length }, "Processing scheduled messages");

    for (const msg of pending) {
      try {
        const session = getSession(msg.deviceId);
        let success = false;

        if (session?.socket && session.status === "connected") {
          const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, msg.deviceId));
          const jid = `${msg.phone.replace(/\D/g, "")}@s.whatsapp.net`;

          if (device?.antiBannedEnabled) {
            await sendWithAntiBanned({
              socket: session.socket,
              jid,
              message: msg.message,
              minDelay: 0,
              maxDelay: 0,
              typingSimulation: device.typingSimulation,
              typingDuration: device.typingDuration,
              applyDelay: false,
            });
          } else {
            await session.socket.sendMessage(jid, { text: msg.message });
          }
          success = true;
        }

        const repeat = msg.repeat ?? "none";
        const nextAt = success ? nextScheduledAt(msg.scheduledAt!, repeat) : null;

        if (success && nextAt) {
          await db
            .update(scheduledMessagesTable)
            .set({ sentAt: now, scheduledAt: nextAt, status: "pending" })
            .where(eq(scheduledMessagesTable.id, msg.id));
        } else {
          await db
            .update(scheduledMessagesTable)
            .set({ status: success ? "sent" : "failed", sentAt: success ? now : null })
            .where(eq(scheduledMessagesTable.id, msg.id));
        }

        if (success) {
          await db.insert(messagesTable).values({
            userId: msg.userId,
            deviceId: msg.deviceId,
            phone: msg.phone,
            message: msg.message,
            status: "sent",
            messageType: "text",
          });

          await db
            .update(devicesTable)
            .set({ messagesSent: sql`${devicesTable.messagesSent} + 1` })
            .where(eq(devicesTable.id, msg.deviceId));
        }

        logger.info(
          { id: msg.id, phone: msg.phone, success, repeat },
          "Scheduled message processed"
        );
      } catch (err) {
        logger.error({ err, id: msg.id }, "Failed to process scheduled message");
        await db
          .update(scheduledMessagesTable)
          .set({ status: "failed" })
          .where(eq(scheduledMessagesTable.id, msg.id));
      }
    }
  } catch (err) {
    logger.error({ err }, "Scheduler tick error");
  }
}

// ── Auto-Renewal ──────────────────────────────────────────────────────────────

async function processAutoRenewals(): Promise<void> {
  try {
    const now = new Date();
    const subs = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.status, "active"));

    const allPlans = (await getPlansFromDb()) ?? [];

    for (const sub of subs) {
      try {
        if (!sub.currentPeriodEnd || sub.currentPeriodEnd > now) continue;
        if (!sub.planId || sub.planId === "free") continue;

        const [user] = await db.select().from(usersTable).where(eq(usersTable.id, sub.userId));
        if (!user?.autoRenew) continue;

        const planData = allPlans.find((p) => p.id === sub.planId);
        if (!planData || planData.price === 0) continue;

        const priceIdr = (planData as any).priceIdr > 0 ? (planData as any).priceIdr : planData.price * 15000;
        const currentBalance = parseFloat(user.balance as string ?? "0");

        if (currentBalance < priceIdr) {
          logger.warn({ userId: sub.userId, planId: sub.planId, balance: currentBalance, price: priceIdr }, "Auto-renew: saldo tidak cukup, lewati");
          continue;
        }

        // Potong saldo dan perpanjang paket
        await db.update(usersTable)
          .set({ balance: sql`${usersTable.balance} - ${String(priceIdr)}` })
          .where(eq(usersTable.id, sub.userId));

        await activatePlan(sub.userId, planData);

        await db.insert(walletTransactionsTable).values({
          userId: sub.userId,
          amount: String(priceIdr),
          type: "auto_renew",
          status: "paid",
          description: `Auto-renewal paket ${planData.name}`,
          planId: sub.planId,
        });

        logger.info({ userId: sub.userId, planId: sub.planId, amount: priceIdr }, "Auto-renew berhasil");
      } catch (err) {
        logger.error({ err, userId: sub.userId }, "Auto-renew gagal untuk user");
      }
    }
  } catch (err) {
    logger.error({ err }, "Auto-renewal processor error");
  }
}

let renewalTimer: ReturnType<typeof setInterval> | null = null;

async function processScheduledBlasts(): Promise<void> {
  try {
    const now = new Date();
    const pendingBlasts = await db
      .select()
      .from(bulkJobsTable)
      .where(
        and(
          eq(bulkJobsTable.status, "pending"),
          lte(bulkJobsTable.scheduledAt, now)
        )
      )
      .limit(5);

    for (const job of pendingBlasts) {
      const storedRecipients = (job.recipients as { phone: string; name?: string }[] | null) ?? [];
      if (!storedRecipients.length) {
        logger.warn({ jobId: job.id }, "Scheduled blast has no stored recipients, skipping");
        await db.update(bulkJobsTable).set({ status: "failed" }).where(eq(bulkJobsTable.id, job.id));
        continue;
      }
      logger.info({ jobId: job.id, recipientCount: storedRecipients.length }, "Starting scheduled blast");
      await db.update(bulkJobsTable).set({ status: "running" }).where(eq(bulkJobsTable.id, job.id));
      processBulkJob({
        jobId: job.id, userId: job.userId, deviceId: job.deviceId,
        message: job.message, mediaUrl: job.mediaUrl ?? undefined,
        mediaType: job.mediaType ?? undefined,
        recipients: storedRecipients,
      }).catch(() => {});
    }
  } catch (err) {
    logger.error({ err }, "Scheduled blast processor error");
  }
}

export function startScheduler(): void {
  if (schedulerTimer) return;

  const INTERVAL_MS = 60_000;
  const RENEWAL_INTERVAL_MS = 60 * 60_000;

  schedulerTimer = setInterval(() => {
    processScheduledMessages().catch(() => {});
    processScheduledBlasts().catch(() => {});
    processDripCampaigns().catch(() => {});
  }, INTERVAL_MS);
  renewalTimer = setInterval(processAutoRenewals, RENEWAL_INTERVAL_MS);

  processScheduledMessages().catch(() => {});
  processScheduledBlasts().catch(() => {});
  processDripCampaigns().catch(() => {});
  processAutoRenewals().catch(() => {});

  logger.info({ intervalMs: INTERVAL_MS }, "Scheduled message processor started");
  logger.info({ intervalMs: RENEWAL_INTERVAL_MS }, "Auto-renewal processor started");
}

export function stopScheduler(): void {
  if (schedulerTimer) {
    clearInterval(schedulerTimer);
    schedulerTimer = null;
    logger.info("Scheduled message processor stopped");
  }
  if (renewalTimer) {
    clearInterval(renewalTimer);
    renewalTimer = null;
    logger.info("Auto-renewal processor stopped");
  }
}
