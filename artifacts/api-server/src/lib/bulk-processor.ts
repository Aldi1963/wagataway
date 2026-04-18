import { db, messagesTable, bulkJobsTable, devicesTable, blacklistTable } from "@workspace/db";
import { eq, sql, and, inArray } from "drizzle-orm";
import { getSession } from "./wa-manager";
import { sendWithAntiBanned, getEffectiveDailyLimit } from "./anti-banned";
import { getUserPlan } from "./plan-limits";
import { logger } from "./logger";
import { sendTelegramNotification, fmtBlastDone } from "./telegram-notify";
import { sendOfficialMessage, formatOfficialInteractive } from "./official-api";

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
    if (!device) {
      throw new Error(`Device ${deviceId} not found`);
    }

    const deviceRecord = device as any;
    const plan = await getUserPlan(userId);
    const effectiveLimit = await getEffectiveDailyLimit(device, plan.limitMessagesPerDay);
    const session = deviceRecord.provider === "official" ? null : getSession(deviceId);
    const canSendReal = deviceRecord.provider === "official"
      ? !!(deviceRecord.officialPhoneId && deviceRecord.officialAccessToken)
      : !!(session?.socket && session.status === "connected");

    const allPhones = recipients.map((recipient) => recipient.phone);
    const blacklisted = await db
      .select({ phone: blacklistTable.phone })
      .from(blacklistTable)
      .where(and(eq(blacklistTable.userId, userId), inArray(blacklistTable.phone, allPhones)));
    const blacklistedSet = new Set(blacklisted.map((entry) => entry.phone));
    const filteredRecipients = recipients.filter((recipient) => !blacklistedSet.has(recipient.phone));

    if (blacklistedSet.size > 0) {
      logger.info({ jobId, blacklisted: blacklistedSet.size }, "Skipping blacklisted numbers");
      await db
        .update(bulkJobsTable)
        .set({ total: filteredRecipients.length })
        .where(eq(bulkJobsTable.id, jobId));
    }

    const [job] = await db
      .select({ name: (bulkJobsTable as any).name })
      .from(bulkJobsTable)
      .where(eq(bulkJobsTable.id, jobId));
    const jobName = (job as any)?.name ?? `Job #${jobId}`;

    let sent = 0;
    let failed = 0;

    for (let i = 0; i < filteredRecipients.length; i++) {
      const recipient = filteredRecipients[i]!;

      if (!activeJobs.has(jobId)) {
        logger.info({ jobId }, "Bulk job cancelled mid-run");
        break;
      }

      if (effectiveLimit !== Infinity && sent >= effectiveLimit) {
        logger.warn({ jobId, deviceId, sent, effectiveLimit }, "Device daily limit reached, stopping bulk job");
        break;
      }

      const jid = `${recipient.phone.replace(/\D/g, "")}@s.whatsapp.net`;
      const personalizedMsg = message.replace(/\{nama\}/gi, recipient.name ?? "");

      try {
        if (!canSendReal) {
          throw new Error("Device session is not connected");
        }

        if (deviceRecord.provider === "official") {
          const config = {
            phoneId: deviceRecord.officialPhoneId!,
            accessToken: deviceRecord.officialAccessToken!,
          };

          let officialPayload: any = {};

          if (messageType === "button") {
            officialPayload = (formatOfficialInteractive as any)({
              body: personalizedMsg,
              footer: extra?.footer,
              buttons: extra?.buttons || [],
            }, { type: "button" });
          } else if (mediaUrl) {
            const typeMap: Record<string, string> = {
              image: "image",
              video: "video",
              audio: "audio",
              document: "document",
            };
            const type = typeMap[mediaType ?? ""] || "image";
            officialPayload = {
              type,
              [type]: {
                link: mediaUrl,
                ...(type !== "audio" ? { caption: personalizedMsg } : {}),
              },
            };
          } else {
            officialPayload = {
              type: "text",
              text: { body: personalizedMsg },
              preview_url: true,
            };
          }

          await sendOfficialMessage({
            accessToken: config.accessToken,
            phoneId: config.phoneId,
            to: jid,
            message: officialPayload,
          });
        } else {
          const sock = session?.socket;
          if (!sock) {
            throw new Error("Baileys socket is not available");
          }

          if (messageType === "button") {
            const btns = (extra?.buttons ?? [])
              .filter((button: any) => button?.displayText || button?.title)
              .map((button: any, index: number) => {
                const buttonType = button.type ?? "quick_reply";

                if (buttonType === "url") {
                  return {
                    name: "cta_url",
                    buttonParamsJson: JSON.stringify({
                      display_text: button.displayText || button.title,
                      url: button.url,
                      merchant_url: button.url,
                    }),
                  };
                }

                if (buttonType === "call") {
                  return {
                    name: "cta_call",
                    buttonParamsJson: JSON.stringify({
                      display_text: button.displayText || button.title,
                      phone_number: button.phoneNumber || button.phone,
                    }),
                  };
                }

                return {
                  name: "quick_reply",
                  buttonParamsJson: JSON.stringify({
                    display_text: button.displayText || button.title,
                    id: String(button.id || `btn_${index + 1}`),
                  }),
                };
              });

            const headerContent: any = {};
            if (extra?.headerUrl) {
              headerContent.imageMessage = { url: extra.headerUrl };
              headerContent.hasMediaAttachment = true;
            } else if (extra?.headerText) {
              headerContent.title = extra.headerText;
              headerContent.hasMediaAttachment = false;
            }

            const messageObj = {
              interactiveMessage: {
                header: headerContent,
                body: { text: personalizedMsg },
                footer: { text: extra?.footer ?? "" },
                nativeFlowMessage: {
                  buttons: btns,
                  messageVersion: 1,
                },
              },
            };

            const msgs = (sock as any).generateWAMessageFromContent(jid, {
              viewOnceMessage: {
                message: messageObj,
              },
            }, { userJid: (sock as any).user.id });

            logger.info({ jid, messageObj }, "Relaying interactive button message");
            await (sock as any).relayMessage(jid, msgs.message, { messageId: msgs.key.id });
          } else if (messageType === "list") {
            const selectBtn = {
              name: "single_select",
              buttonParamsJson: JSON.stringify({
                title: extra?.buttonText ?? "Pilih",
                sections: (extra?.sections ?? []).map((section: any) => ({
                  title: section.title ?? "",
                  rows: (section.rows ?? []).map((row: any) => ({
                    title: row.title ?? row.rowTitle ?? String(row),
                    description: row.description ?? "",
                    id: row.id ?? row.title ?? String(row),
                  })),
                })),
              }),
            };

            const messageObj = {
              interactiveMessage: {
                body: { text: personalizedMsg },
                footer: { text: extra?.footer ?? "" },
                nativeFlowMessage: {
                  buttons: [selectBtn],
                  messageVersion: 1,
                },
              },
            };

            const msgs = (sock as any).generateWAMessageFromContent(jid, {
              viewOnceMessage: {
                message: messageObj,
              },
            }, { userJid: (sock as any).user.id });

            await (sock as any).relayMessage(jid, msgs.message, { messageId: msgs.key.id });
          } else if (device.antiBannedEnabled) {
            await sendWithAntiBanned({
              socket: sock,
              jid,
              message: personalizedMsg,
              recipientName: recipient.name,
              mediaUrl,
              mediaType: mediaType as any,
              minDelay: i === 0 ? 0 : device.minDelay,
              maxDelay: device.maxDelay,
              typingSimulation: device.typingSimulation,
              typingDuration: device.typingDuration,
              applyDelay: i < filteredRecipients.length - 1,
            });
          } else if (mediaUrl) {
            const mediaMsg: any = mediaType === "video"
              ? { video: { url: mediaUrl }, caption: personalizedMsg }
              : mediaType === "audio"
                ? { audio: { url: mediaUrl }, mimetype: "audio/mpeg" }
                : mediaType === "document"
                  ? { document: { url: mediaUrl }, caption: personalizedMsg }
                  : { image: { url: mediaUrl }, caption: personalizedMsg };
            await sock.sendMessage(jid, mediaMsg);
          } else {
            await sock.sendMessage(jid, { text: personalizedMsg });
          }
        }

        await db.insert(messagesTable).values({
          userId,
          deviceId,
          phone: recipient.phone,
          message: personalizedMsg,
          mediaUrl: mediaUrl ?? null,
          messageType: mediaUrl ? (mediaType ?? "image") : "text",
          status: "sent",
          bulkJobId: jobId,
        } as any);

        await db
          .update(devicesTable)
          .set({ messagesSent: sql`${devicesTable.messagesSent} + 1` })
          .where(eq(devicesTable.id, deviceId));

        sent++;
      } catch (err) {
        logger.error({ err, jobId, phone: recipient.phone }, "Failed to send bulk message");
        await db.insert(messagesTable).values({
          userId,
          deviceId,
          phone: recipient.phone,
          message: personalizedMsg,
          status: "failed",
          mediaUrl: mediaUrl ?? null,
          bulkJobId: jobId,
          messageType,
          extra: extra ? JSON.parse(JSON.stringify(extra)) : null,
          failedReason: (err as any)?.message ?? "Unknown error",
        } as any);
        failed++;
      }

      if ((i + 1) % 5 === 0 || i === filteredRecipients.length - 1) {
        const pending = Math.max(0, filteredRecipients.length - sent - failed);
        await db
          .update(bulkJobsTable)
          .set({ sent, failed, pending })
          .where(eq(bulkJobsTable.id, jobId));
      }
    }

    const finalStatus = activeJobs.has(jobId) ? "completed" : "cancelled";
    const totalFinal = filteredRecipients.length;

    await db
      .update(bulkJobsTable)
      .set({ sent, failed, pending: 0, status: finalStatus })
      .where(eq(bulkJobsTable.id, jobId));

    logger.info({ jobId, sent, failed, status: finalStatus }, "Bulk job finished");

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
