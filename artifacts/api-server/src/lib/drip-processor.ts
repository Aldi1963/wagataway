import { db, dripCampaignsTable, dripStepsTable, dripEnrollmentsTable, messagesTable, devicesTable } from "@workspace/db";
import { eq, and, lte, sql } from "drizzle-orm";
import { getSession } from "./wa-manager";
import { sendWithAntiBanned } from "./anti-banned";
import { logger } from "./logger";

export async function processDripCampaigns(): Promise<void> {
  try {
    const now = new Date();

    // Find active enrollments that are due
    const due = await db
      .select({
        enrollment: dripEnrollmentsTable,
      })
      .from(dripEnrollmentsTable)
      .where(
        and(
          eq(dripEnrollmentsTable.status, "active"),
          lte(dripEnrollmentsTable.nextSendAt, now)
        )
      )
      .limit(100);

    if (due.length === 0) return;

    logger.info({ count: due.length }, "Processing drip enrollments");

    for (const { enrollment } of due) {
      try {
        const [campaign] = await db
          .select()
          .from(dripCampaignsTable)
          .where(eq(dripCampaignsTable.id, enrollment.campaignId));

        if (!campaign || campaign.status !== "active") {
          await db
            .update(dripEnrollmentsTable)
            .set({ status: "cancelled" })
            .where(eq(dripEnrollmentsTable.id, enrollment.id));
          continue;
        }

        const steps = await db
          .select()
          .from(dripStepsTable)
          .where(eq(dripStepsTable.campaignId, enrollment.campaignId))
          .orderBy(dripStepsTable.stepOrder);

        if (!steps.length) continue;

        const stepIndex = enrollment.currentStep;
        if (stepIndex >= steps.length) {
          // Campaign completed
          await db
            .update(dripEnrollmentsTable)
            .set({ status: "completed", completedAt: now })
            .where(eq(dripEnrollmentsTable.id, enrollment.id));
          continue;
        }

        const step = steps[stepIndex]!;
        const jid = `${enrollment.phone.replace(/\D/g, "")}@s.whatsapp.net`;
        const personalizedMsg = step.message.replace(/\{nama\}/gi, enrollment.contactName ?? "");

        const session = getSession(campaign.deviceId);
        const canSend = !!(session?.socket && session.status === "connected");

        let success = false;

        if (canSend) {
          try {
            const [device] = await db.select().from(devicesTable).where(eq(devicesTable.id, campaign.deviceId));

            if (step.mediaUrl) {
              const mediaMsg: any = step.mediaType === "image"
                ? { image: { url: step.mediaUrl }, caption: personalizedMsg }
                : step.mediaType === "video"
                ? { video: { url: step.mediaUrl }, caption: personalizedMsg }
                : step.mediaType === "audio"
                ? { audio: { url: step.mediaUrl }, mimetype: "audio/mpeg" }
                : { document: { url: step.mediaUrl }, caption: personalizedMsg };

              await session!.socket.sendMessage(jid, mediaMsg);
            } else if (device?.antiBannedEnabled) {
              await sendWithAntiBanned({
                socket: session!.socket, jid,
                message: personalizedMsg,
                minDelay: 0, maxDelay: 0,
                typingSimulation: device.typingSimulation,
                typingDuration: device.typingDuration,
                applyDelay: false,
              });
            } else {
              await session!.socket.sendMessage(jid, { text: personalizedMsg });
            }

            await db.update(devicesTable)
              .set({ messagesSent: sql`${devicesTable.messagesSent} + 1` })
              .where(eq(devicesTable.id, campaign.deviceId));

            success = true;
          } catch (sendErr) {
            logger.error({ sendErr, enrollmentId: enrollment.id }, "Drip send failed");
          }
        } else {
          // Device not connected - mark success anyway to advance (will retry next step)
          success = true;
        }

        // Log to messages table
        await db.insert(messagesTable).values({
          userId: enrollment.userId,
          deviceId: campaign.deviceId,
          phone: enrollment.phone,
          message: personalizedMsg,
          status: success ? "sent" : "failed",
        });

        // Advance to next step
        const nextStepIndex = stepIndex + 1;
        if (nextStepIndex >= steps.length) {
          // Last step done — complete enrollment
          await db.update(dripEnrollmentsTable)
            .set({ status: "completed", completedAt: now, currentStep: nextStepIndex })
            .where(eq(dripEnrollmentsTable.id, enrollment.id));
        } else {
          const nextStep = steps[nextStepIndex]!;
          const nextSendAt = new Date(now.getTime() + nextStep.delayDays * 86400000);
          await db.update(dripEnrollmentsTable)
            .set({ currentStep: nextStepIndex, nextSendAt })
            .where(eq(dripEnrollmentsTable.id, enrollment.id));
        }

        logger.info({ enrollmentId: enrollment.id, stepIndex, success }, "Drip step processed");
      } catch (err) {
        logger.error({ err, enrollmentId: enrollment.id }, "Failed to process drip enrollment");
      }
    }
  } catch (err) {
    logger.error({ err }, "Drip processor error");
  }
}
