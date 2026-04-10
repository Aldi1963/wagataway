import { db, messagesTable, bulkJobsTable, devicesTable, blacklistTable } from "@workspace/db";
import { eq, sql, and, inArray } from "drizzle-orm";
import { getSession } from "./wa-manager";
import { sendWithAntiBanned, getEffectiveDailyLimit } from "./anti-banned";
import { getUserPlan } from "./plan-limits";
import { logger } from "./logger";
import { sendTelegramNotification, fmtBlastDone } from "./telegram-notify";
import { proto, generateMessageIDV2 } from "@whiskeysockets/baileys";

interface BulkRecipient {
  phone: string;
  name?: string;
}

interface BulkProcessOptions {
  jobId: number;
  userId: number;
  deviceId: number;
  message: string;
  mediaUrl?: string;
  mediaType?: string;
  messageType?: string;
  extra?: any;
  recipients: BulkRecipient[];
}

const activeJobs = new Set<number>();

export function isJobRunning(jobId: number): boolean {
  return activeJobs.has(jobId);
}

export async function cancelBulkJob(jobId: number): Promise<void> {
  activeJobs.delete(jobId);
  await db
    .update(bulkJobsTable)
    .set({ status: "cancelled" })
    .where(eq(bulkJobsTable.id, jobId));
}

export async function processBulkJob({
  jobId,
  userId,
  deviceId,
  message,
  mediaUrl,
  mediaType,
  messageType = "text",
  extra,
  recipients,
}: BulkProcessOptions): Promise<void> {
  activeJobs.add(jobId);

  try {
    const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, deviceId));
    if (!device) throw new Error(`Device ${deviceId} not found`);

    const plan = await getUserPlan(userId);
    const effectiveLimit = await getEffectiveDailyLimit(device, plan.limitMessagesPerDay);

    const session = getSession(deviceId);
    const canSendReal = !!(session?.socket && session.status === "connected");

    // ── Filter blacklisted numbers ────────────────────────────────────────────
    const allPhones = recipients.map((r) => r.phone);
    const blacklisted = await db.select({ phone: blacklistTable.phone })
      .from(blacklistTable)
      .where(and(eq(blacklistTable.userId, userId), inArray(blacklistTable.phone, allPhones)));
    const blacklistedSet = new Set(blacklisted.map((b) => b.phone));
    const filteredRecipients = recipients.filter((r) => !blacklistedSet.has(r.phone));

    if (blacklistedSet.size > 0) {
      logger.info({ jobId, blacklisted: blacklistedSet.size }, "Skipping blacklisted numbers");
      // Update total to reflect filtered count
      await db.update(bulkJobsTable)
        .set({ total: filteredRecipients.length })
        .where(eq(bulkJobsTable.id, jobId));
    }

    const [job] = await db.select({ name: (bulkJobsTable as any).name }).from(bulkJobsTable).where(eq(bulkJobsTable.id, jobId));
    const jobName = (job as any)?.name ?? `Job #${jobId}`;

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < filteredRecipients.length; i++) {
      const recipients = filteredRecipients; // rebind for code below
      if (!activeJobs.has(jobId)) {
        logger.info({ jobId }, "Bulk job cancelled mid-run");
        break;
      }

      if (effectiveLimit !== Infinity && sent >= effectiveLimit) {
        logger.warn({ jobId, deviceId, sent, effectiveLimit }, "Device daily limit reached, stopping bulk job");
        break;
      }

      const recipient = recipients[i]!;
      const jid = `${recipient.phone.replace(/\D/g, "")}@s.whatsapp.net`;

      // Replace {nama} placeholder
      const personalizedMsg = message.replace(/\{nama\}/gi, recipient.name ?? "");

      try {
        if (canSendReal) {
          if (messageType === "button") {
            const btns = (extra?.buttons ?? [])
              .filter((b: any) => b?.displayText || b?.title)
              .map((b: any, bi: number) => {
                const type = b.type ?? "quick_reply";
                if (type === "url") {
                  return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({ display_text: b.displayText || b.title, url: b.url, merchant_url: b.url }),
                  });
                }
                if (type === "call") {
                  return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
                    name: "cta_call",
                    buttonParamsJson: JSON.stringify({ display_text: b.displayText || b.title, phone_number: b.phoneNumber || b.phone }),
                  });
                }
                return proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({ display_text: b.displayText || b.title, id: b.id || `btn_${bi + 1}` }),
                });
              });

            const headerContent: any = { hasMediaAttachment: !!extra?.headerUrl };
            if (extra?.headerUrl) {
              headerContent.imageMessage = { url: extra.headerUrl };
            } else if (extra?.headerText) {
              headerContent.title = extra.headerText;
            }

            const relayMsg = proto.Message.create({
              interactiveMessage: proto.Message.InteractiveMessage.create({
                header: proto.Message.InteractiveMessage.Header.create(headerContent),
                body: proto.Message.InteractiveMessage.Body.create({ text: personalizedMsg }),
                footer: proto.Message.InteractiveMessage.Footer.create({ text: extra?.footer ?? "" }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                  messageVersion: 1,
                  buttons: btns,
                }),
              }),
            });
            await (session!.socket as any).relayMessage(jid, relayMsg, { messageId: generateMessageIDV2() });
          } else if (messageType === "list") {
            const selectBtn = proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: extra?.buttonText ?? "Pilih",
                sections: (extra?.sections ?? []).map((s: any) => ({
                  title: s.title ?? "",
                  rows: (s.rows ?? []).map((r: any) => ({
                    title: r.title ?? r.rowTitle ?? String(r),
                    description: r.description ?? "",
                    id: r.id ?? r.title ?? String(r),
                  })),
                })),
              }),
            });
            const relayMsg = proto.Message.create({
              interactiveMessage: proto.Message.InteractiveMessage.create({
                body: proto.Message.InteractiveMessage.Body.create({ text: personalizedMsg }),
                footer: proto.Message.InteractiveMessage.Footer.create({ text: extra?.footer ?? "" }),
                nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
                  messageVersion: 1,
                  buttons: [selectBtn],
                }),
              }),
            });
            await (session!.socket as any).relayMessage(jid, relayMsg, { messageId: generateMessageIDV2() });
          } else {
            // Standard text/media with Anti-Banned support
            if (device.antiBannedEnabled) {
              await sendWithAntiBanned({
                socket: session!.socket, jid, message: personalizedMsg,
                recipientName: recipient.name,
                mediaUrl: mediaUrl, mediaType: mediaType as any,
                minDelay: i === 0 ? 0 : device.minDelay,
                maxDelay: device.maxDelay,
                typingSimulation: device.typingSimulation,
                typingDuration: device.typingDuration,
                applyDelay: i < recipients.length - 1,
              });
            } else {
              if (mediaUrl) {
                const mediaMsg: any = mediaType === "video" ? { video: { url: mediaUrl }, caption: personalizedMsg }
                  : mediaType === "audio" ? { audio: { url: mediaUrl }, mimetype: "audio/mpeg" }
                  : mediaType === "document" ? { document: { url: mediaUrl }, caption: personalizedMsg }
                  : { image: { url: mediaUrl }, caption: personalizedMsg };
                await session!.socket.sendMessage(jid, mediaMsg);
              } else {
                await session!.socket.sendMessage(jid, { text: personalizedMsg });
              }
            }
          }
        }

        await db.insert(messagesTable).values({
          userId, deviceId, phone: recipient.phone,
          message: personalizedMsg, status: "sent",
          mediaUrl: mediaUrl ?? null, bulkJobId: jobId,
          messageType, extra: extra ? JSON.parse(JSON.stringify(extra)) : null,
        });

        await db.update(devicesTable)
          .set({ messagesSent: sql`${devicesTable.messagesSent} + 1` })
          .where(eq(devicesTable.id, deviceId));

        sent++;
      } catch (err) {
        logger.error({ err, jobId, phone: recipient.phone }, "Failed to send bulk message");
        await db.insert(messagesTable).values({
          userId, deviceId, phone: recipient.phone,
          message: personalizedMsg, status: "failed",
          mediaUrl: mediaUrl ?? null, bulkJobId: jobId,
          messageType, extra: extra ? JSON.parse(JSON.stringify(extra)) : null,
          failedReason: (err as any)?.message ?? "Unknown error",
        });
        failed++;
      }

      if ((i + 1) % 5 === 0 || i === recipients.length - 1) {
        const pending = Math.max(0, recipients.length - sent - failed);
        await db.update(bulkJobsTable).set({ sent, failed, pending }).where(eq(bulkJobsTable.id, jobId));
      }
    }

    const finalStatus = activeJobs.has(jobId) ? "completed" : "cancelled";
    const totalFinal = filteredRecipients.length;
    await db.update(bulkJobsTable)
      .set({ sent, failed, pending: 0, status: finalStatus })
      .where(eq(bulkJobsTable.id, jobId));

    logger.info({ jobId, sent, failed, status: finalStatus }, "Bulk job finished");

    // Telegram notification — blast selesai
    if (finalStatus === "completed") {
      sendTelegramNotification(fmtBlastDone(jobName, sent, failed, totalFinal)).catch(() => {});
    }
  } catch (err) {
    logger.error({ err, jobId }, "Bulk job crashed");
    await db.update(bulkJobsTable).set({ status: "failed" }).where(eq(bulkJobsTable.id, jobId));
  } finally {
    activeJobs.delete(jobId);
  }
}
