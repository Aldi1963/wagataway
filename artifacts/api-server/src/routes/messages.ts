import { Router, type IRouter } from "express";
import { db, messagesTable, devicesTable, bulkJobsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getUserFromToken } from "./auth";
import { getUserPlan, countTodayMessages, limitError } from "../lib/plan-limits";
import { getSession } from "../lib/wa-manager";
import { sendWithAntiBanned } from "../lib/anti-banned";
import { processBulkJob, cancelBulkJob, isJobRunning } from "../lib/bulk-processor";
import { scheduleRetry } from "../lib/retry-processor";
import { proto, generateMessageIDV2 } from "@whiskeysockets/baileys";
import { sendOfficialMessage, formatOfficialInteractive } from "../lib/official-api";
import { validateSafeUrl } from "../lib/security";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

/** Pick a rotation device from user's connected pool */
async function pickRotationDevice(uid: number, rotationGroup = "default"): Promise<typeof import("@workspace/db").devicesTable.$inferSelect | null> {
  const devices = await db.select().from(devicesTable)
    .where(and(eq(devicesTable.userId, uid), eq(devicesTable.rotationEnabled, true)));
  const connected = devices.filter((d) => {
    if (d.provider === "official") return d.status === "connected" && (!rotationGroup || d.rotationGroup === rotationGroup);
    const session = getSession(d.id);
    return session?.status === "connected" && (!rotationGroup || d.rotationGroup === rotationGroup);
  });
  if (!connected.length) return null;
  // Weighted random selection
  const totalWeight = connected.reduce((sum, d) => sum + (d.rotationWeight ?? 1), 0);
  let rand = Math.random() * totalWeight;
  for (const d of connected) {
    rand -= d.rotationWeight ?? 1;
    if (rand <= 0) return d;
  }
  return connected[0];
}

router.post("/messages/send", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { phone, message, mediaUrl, messageType = "text", extra } = req.body;
  let { deviceId } = req.body;

  if (!phone || !deviceId) {
    res.status(400).json({ message: "Missing required fields", code: "INVALID_REQUEST" });
    return;
  }

  // For poll/react type, message field is required differently
  if (!message && !["media", "sticker", "location", "react"].includes(messageType)) {
    res.status(400).json({ message: "Missing required fields", code: "INVALID_REQUEST" });
    return;
  }

  // ── SSRF Protection ──────────────────────────────────────────────────────
  if (mediaUrl && !(await validateSafeUrl(mediaUrl))) {
    res.status(400).json({ message: "Invalid or unsafe media URL", code: "UNSAFE_URL" });
    return;
  }

  const [plan, todayCount] = await Promise.all([getUserPlan(uid), countTodayMessages(uid)]);
  const err = limitError(todayCount, plan.limitMessagesPerDay, "pesan hari ini");
  if (err) { res.status(403).json({ ...err, planName: plan.planName }); return; }

  // ── Device Rotation ──────────────────────────────────────────────────────
  let device: typeof import("@workspace/db").devicesTable.$inferSelect | undefined;
  let devId: number;
  if (deviceId === "auto" || deviceId === "rotate") {
    const rotGroup = extra?.rotationGroup ?? "default";
    const picked = await pickRotationDevice(uid, rotGroup);
    if (!picked) {
      res.status(503).json({ message: "Tidak ada perangkat rotasi yang terhubung", code: "NO_DEVICE" });
      return;
    }
    device = picked;
    devId = picked.id;
  } else {
    devId = parseInt(deviceId, 10);
    const [d] = await db.select().from(devicesTable).where(eq(devicesTable.id, devId));
    device = d;
  }

  const session = getSession(devId);

  // ── Official API Branch ──────────────────────────────────────────────────
  if (device?.provider === "official") {
    try {
      let payload: any;
      if (messageType === "button") {
        payload = formatOfficialInteractive({
          type: "button",
          body: message ?? "",
          footer: extra?.footer,
          header: extra?.headerUrl ? { type: "image", image: { link: extra.headerUrl } } : undefined,
          buttons: (extra?.buttons ?? []).map((b: any) => ({
            type: b.type === "url" ? "url" : b.type === "call" ? "call" : "reply",
            title: b.displayText || b.title,
            ...(b.type === "url" ? { url: b.url } : b.type === "call" ? { phone_number: b.phoneNumber || b.phone } : { id: b.id })
          }))
        });
      } else if (messageType === "media") {
        const type = (extra?.mediaType || "image").toLowerCase() as any;
        payload = {
          type,
          [type]: { link: mediaUrl || extra?.url, caption: extra?.caption || message }
        };
      } else {
        payload = { type: "text", text: { body: message } };
      }

      const response = await sendOfficialMessage({
        accessToken: device.officialAccessToken!,
        phoneId: device.officialPhoneId!,
        to: phone.replace(/\D/g, ""),
        message: payload
      });

      const [msg] = await db.insert(messagesTable).values({
        userId: uid, deviceId: devId, phone,
        message: message ?? "[media]", status: "sent",
        externalId: response.messages?.[0]?.id,
        mediaUrl: mediaUrl ?? extra?.url ?? null,
        messageType,
      }).returning();

      await db.update(devicesTable).set({ messagesSent: sql`${devicesTable.messagesSent} + 1` }).where(eq(devicesTable.id, devId));

      res.json({
        id: String(msg.id),
        phone: msg.phone,
        message: msg.message,
        status: msg.status,
        deviceId: String(msg.deviceId),
        externalId: msg.externalId,
        createdAt: msg.createdAt?.toISOString(),
      });
      return;
    } catch (err: any) {
      res.status(500).json({ message: err.message || "Failed to send via Official API", code: "API_ERROR" });
      return;
    }
  }

  // ── Baileys Branch ────────────────────────────────────────────────────────
  if (session?.socket && session.status === "connected" && device) {
    const jid = `${phone.replace(/\D/g, "")}@s.whatsapp.net`;

    // Build Baileys message content based on messageType
    let waContent: any;

    if (messageType === "poll") {
      const options: string[] = (extra?.options ?? []).filter(Boolean);
      if (options.length < 2) {
        res.status(400).json({ message: "Polling butuh minimal 2 pilihan jawaban", code: "INVALID_REQUEST" });
        return;
      }
      waContent = {
        poll: {
          name: message,
          values: options,
          selectableCount: extra?.allowMultipleAnswers ? options.length : 1,
        },
      };
    } else if (messageType === "button") {
      // interactiveMessage must be sent via relayMessage (sendMessage doesn't support it)
      const btns = (extra?.buttons ?? [])
        .filter((b: any) => b?.displayText || b?.title)
        .map((b: any, i: number) => {
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
            buttonParamsJson: JSON.stringify({ display_text: b.displayText || b.title, id: b.id || `btn_${i + 1}` }),
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
          body: proto.Message.InteractiveMessage.Body.create({ text: message }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: extra?.footer ?? "" }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            messageVersion: 1,
            buttons: btns,
          }),
        }),
      });
      await (session.socket as any).relayMessage(jid, relayMsg, { messageId: generateMessageIDV2() });
      waContent = null; // already sent
    } else if (messageType === "list") {
      // interactiveMessage must be sent via relayMessage (sendMessage doesn't support it)
      const selectBtn = proto.Message.InteractiveMessage.NativeFlowMessage.NativeFlowButton.create({
        name: "single_select",
        buttonParamsJson: JSON.stringify({
          title: extra?.buttonText ?? "Pilih",
          sections: (extra?.sections ?? []).map((s: any) => ({
            title: s.title ?? "",
            highlight_label: "",
            rows: (s.rows ?? []).map((r: any) => ({
              header: "",
              title: r.title ?? r.rowTitle ?? String(r),
              description: r.description ?? "",
              id: r.id ?? r.title ?? String(r),
            })),
          })),
        }),
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
          body: proto.Message.InteractiveMessage.Body.create({ text: message }),
          footer: proto.Message.InteractiveMessage.Footer.create({ text: extra?.footer ?? "" }),
          nativeFlowMessage: proto.Message.InteractiveMessage.NativeFlowMessage.create({
            messageVersion: 1,
            buttons: [selectBtn],
          }),
        }),
      });
      await (session.socket as any).relayMessage(jid, relayMsg, { messageId: generateMessageIDV2() });
      waContent = null; // already sent
    } else if (messageType === "location") {
      const lat = extra?.lat ?? extra?.latitude;
      const lng = extra?.lng ?? extra?.longitude;
      if (!lat || !lng) {
        res.status(400).json({ message: "lat dan lng diperlukan untuk location", code: "INVALID_REQUEST" });
        return;
      }
      waContent = {
        location: {
          degreesLatitude: parseFloat(lat),
          degreesLongitude: parseFloat(lng),
          name: extra?.title ?? message ?? "",
          address: extra?.address ?? "",
        },
      };
    } else if (messageType === "sticker") {
      const url = mediaUrl ?? extra?.url;
      if (!url) {
        res.status(400).json({ message: "URL sticker tidak boleh kosong", code: "INVALID_REQUEST" });
        return;
      }
      waContent = { sticker: { url } };
    } else if (messageType === "react") {
      const targetId = extra?.messageId ?? extra?.targetId;
      if (!targetId) {
        res.status(400).json({ message: "messageId target diperlukan untuk react", code: "INVALID_REQUEST" });
        return;
      }
      waContent = {
        react: {
          text: extra?.emoji ?? message ?? "👍",
          key: { id: targetId, remoteJid: jid, fromMe: false },
        },
      };
    } else if (messageType === "media") {
      const url = mediaUrl ?? extra?.url;
      if (!url) {
        res.status(400).json({ message: "URL media tidak boleh kosong", code: "INVALID_REQUEST" });
        return;
      }
      const mediaTypeLower = (extra?.mediaType ?? "image").toLowerCase();
      if (mediaTypeLower === "video") {
        waContent = { video: { url }, caption: extra?.caption ?? message ?? "" };
      } else if (mediaTypeLower === "audio") {
        waContent = { audio: { url }, mimetype: "audio/mp4" };
      } else if (mediaTypeLower === "document") {
        waContent = { document: { url }, caption: extra?.caption ?? message ?? "", fileName: extra?.fileName ?? "file" };
      } else {
        waContent = { image: { url }, caption: extra?.caption ?? message ?? "" };
      }
    } else {
      // Default: plain text (text, template)
      waContent = { text: message };
    }

    // Handle quoted reply (extra.quoteId or extra.quoted)
    if (waContent && extra?.quoteId) {
      waContent.quoted = {
        key: { id: extra.quoteId, remoteJid: jid, fromMe: false },
        message: { conversation: extra.quoteText ?? "" },
      };
    }

    // waContent is null when message was already sent via relayMessage (button/list)
    let externalId: string | null = null;
    if (waContent !== null) {
      try {
        let sent: any;
        if (device.antiBannedEnabled && messageType === "text") {
          await sendWithAntiBanned({
            socket: session.socket,
            jid,
            message,
            minDelay: 0,
            maxDelay: 0,
            typingSimulation: device.typingSimulation,
            typingDuration: device.typingDuration,
            applyDelay: false,
          });
        } else {
          sent = await session.socket.sendMessage(jid, waContent);
        }
        externalId = sent?.key?.id ?? null;
      } catch (sendErr: any) {
        // Store as failed, schedule retry
        const [failedMsg] = await db.insert(messagesTable).values({
          userId: uid, deviceId: devId, phone,
          message: message ?? "[media]", status: "failed",
          mediaUrl: mediaUrl ?? extra?.url ?? null,
          messageType, failedReason: sendErr?.message ?? "Send failed",
        }).returning();
        scheduleRetry(failedMsg.id, sendErr?.message ?? "Send failed", 0);
        res.status(500).json({ message: "Gagal kirim pesan, dijadwalkan untuk retry", id: String(failedMsg.id), status: "failed" });
        return;
      }
    }
  }

  const [msg] = await db
    .insert(messagesTable)
    .values({
      userId: uid, deviceId: devId, phone,
      message: message ?? "[media]", status: session?.status === "connected" && device ? "sent" : "pending",
      mediaUrl: mediaUrl ?? extra?.url ?? null,
      messageType,
    })
    .returning();

  await db
    .update(devicesTable)
    .set({ messagesSent: sql`${devicesTable.messagesSent} + 1` })
    .where(eq(devicesTable.id, devId));

  res.json({
    id: String(msg.id),
    phone: msg.phone,
    message: msg.message,
    status: msg.status,
    deviceId: String(msg.deviceId),
    mediaUrl: msg.mediaUrl,
    messageType: msg.messageType,
    externalId: msg.externalId,
    createdAt: msg.createdAt?.toISOString(),
  });
});

router.post("/messages/bulk", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { deviceId, message, name, mediaUrl, mediaType, scheduledAt, messageType = "text", extra } = req.body;

  let recipients: { phone: string; name?: string }[] = [];
  if (Array.isArray(req.body.recipients)) {
    recipients = req.body.recipients.map((r: any) => typeof r === "string" ? { phone: r } : r);
  } else if (Array.isArray(req.body.phones)) {
    recipients = req.body.phones.map((p: string) => ({ phone: p }));
  }

  if (!deviceId || (!message && !["media", "sticker"].includes(messageType)) || !recipients.length) {
    res.status(400).json({ message: "Missing required fields", code: "INVALID_REQUEST" });
    return;
  }

  // ── SSRF Protection ──────────────────────────────────────────────────────
  if (mediaUrl && !(await validateSafeUrl(mediaUrl))) {
    res.status(400).json({ message: "Invalid or unsafe media URL", code: "UNSAFE_URL" });
    return;
  }

  const scheduledDate = scheduledAt ? new Date(scheduledAt) : null;
  const isScheduled = scheduledDate && scheduledDate > new Date();

  // For scheduled blasts, skip daily limit check (will check at send time)
  let cappedRecipients = recipients;
  if (!isScheduled) {
    const [plan, todayCount] = await Promise.all([getUserPlan(uid), countTodayMessages(uid)]);
    const remaining = plan.limitMessagesPerDay === -1 ? Infinity : Math.max(0, plan.limitMessagesPerDay - todayCount);
    if (plan.limitMessagesPerDay !== -1 && todayCount >= plan.limitMessagesPerDay) {
      const err = limitError(todayCount, plan.limitMessagesPerDay, "pesan hari ini");
      if (err) { res.status(403).json({ ...err, planName: plan.planName }); return; }
    }
    cappedRecipients = plan.limitMessagesPerDay === -1 ? recipients : recipients.slice(0, remaining);
  }

  const devId = parseInt(deviceId, 10);
  const total = cappedRecipients.length;
  const jobName = name || `Blast ${new Date().toLocaleDateString("id-ID")} ${new Date().toLocaleTimeString("id-ID", { hour: "2-digit", minute: "2-digit" })}`;

  const [job] = await db
    .insert(bulkJobsTable)
    .values({
      userId: uid, deviceId: devId, name: jobName,
      message: message ?? "", mediaUrl: mediaUrl ?? null, mediaType: mediaType ?? null,
      messageType, extra: extra ?? null,
      total, sent: 0, failed: 0, pending: total,
      status: isScheduled ? "pending" : "running",
      scheduledAt: scheduledDate ?? null,
      recipients: cappedRecipients,
    })
    .returning();

  if (!isScheduled) {
    processBulkJob({
      jobId: job.id, userId: uid, deviceId: devId,
      message: message ?? "", mediaUrl: mediaUrl ?? undefined, mediaType: mediaType ?? undefined,
      messageType, extra,
      recipients: cappedRecipients,
    }).catch(() => {});
  }

  res.json({
    id: String(job.id), name: job.name,
    total: job.total, sent: 0, failed: 0, pending: total,
    status: job.status,
    scheduledAt: scheduledDate?.toISOString() ?? null,
    createdAt: job.createdAt?.toISOString(),
  });
});

router.post("/messages/bulk/:id/cancel", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);

  const [job] = await db
    .select()
    .from(bulkJobsTable)
    .where(and(eq(bulkJobsTable.id, id), eq(bulkJobsTable.userId, uid)));

  if (!job) { res.status(404).json({ message: "Job not found" }); return; }
  if (job.status !== "running") { res.status(400).json({ message: "Job is not running" }); return; }

  await cancelBulkJob(id);
  res.json({ message: "Job cancellation requested" });
});

router.get("/messages", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const page = parseInt(req.query.page as string ?? "1", 10);
  const limit = parseInt(req.query.limit as string ?? "20", 10);
  const offset = (page - 1) * limit;

  const msgs = await db.select().from(messagesTable).where(eq(messagesTable.userId, uid)).limit(limit).offset(offset).orderBy(sql`${messagesTable.createdAt} DESC`);
  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(messagesTable).where(eq(messagesTable.userId, uid));
  const total = Number(count);

  res.json({
    data: msgs.map((m) => ({
      id: String(m.id),
      phone: m.phone,
      message: m.message,
      status: m.status,
      messageType: m.messageType ?? "text",
      deviceId: String(m.deviceId),
      mediaUrl: m.mediaUrl,
      failedReason: m.failedReason,
      retryCount: m.retryCount ?? 0,
      deliveredAt: m.deliveredAt?.toISOString() ?? null,
      readAt: m.readAt?.toISOString() ?? null,
      createdAt: m.createdAt?.toISOString(),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

router.get("/messages/bulk-jobs", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const jobs = await db.select().from(bulkJobsTable).where(eq(bulkJobsTable.userId, uid)).orderBy(sql`${bulkJobsTable.createdAt} DESC`);

  res.json(jobs.map((j) => ({
    id: String(j.id),
    name: j.name || `Job #${j.id}`,
    message: j.message,
    mediaUrl: j.mediaUrl,
    mediaType: j.mediaType,
    totalRecipients: j.total,
    sentCount: j.sent,
    failedCount: j.failed,
    pendingCount: j.pending,
    total: j.total, sent: j.sent, failed: j.failed, pending: j.pending,
    status: j.status,
    scheduledAt: j.scheduledAt?.toISOString() ?? null,
    running: isJobRunning(j.id),
    createdAt: j.createdAt?.toISOString(),
  })));
});

/** GET /messages/bulk-jobs/:id — detail satu bulk job */
router.get("/messages/bulk-jobs/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const jobId = parseInt(req.params.id, 10);
  const [job] = await db.select().from(bulkJobsTable).where(and(eq(bulkJobsTable.id, jobId), eq(bulkJobsTable.userId, uid)));
  if (!job) { res.status(404).json({ message: "Job tidak ditemukan" }); return; }
  res.json({
    id: String(job.id),
    name: (job as any).name ?? `Job #${job.id}`,
    message: job.message,
    total: job.total, sent: job.sent, failed: job.failed, pending: job.pending,
    status: job.status, running: isJobRunning(job.id),
    createdAt: job.createdAt?.toISOString(),
  });
});

/** GET /messages/bulk-jobs/:id/report — per-recipient delivery report */
router.get("/messages/bulk-jobs/:id/report", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const jobId = parseInt(req.params.id, 10);
  const [job] = await db.select().from(bulkJobsTable).where(and(eq(bulkJobsTable.id, jobId), eq(bulkJobsTable.userId, uid)));
  if (!job) { res.status(404).json({ message: "Job tidak ditemukan" }); return; }

  const format = (req.query.format as string ?? "json").toLowerCase();
  const messages = await db.select().from(messagesTable)
    .where(and(eq(messagesTable.userId, uid), eq(messagesTable.bulkJobId, jobId)))
    .orderBy(sql`${messagesTable.createdAt} ASC`);

  if (format === "csv") {
    const header = "phone,status,waktu";
    const rows = messages.map((m) => [
      `"${m.phone}"`,
      `"${m.status}"`,
      `"${m.createdAt?.toISOString() ?? ""}"`,
    ].join(","));
    const csv = [header, ...rows].join("\n");
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename=laporan-blast-${jobId}.csv`);
    res.send(csv);
    return;
  }

  res.json({
    jobId: String(job.id),
    jobName: (job as any).name ?? `Job #${job.id}`,
    total: job.total, sent: job.sent, failed: job.failed,
    messages: messages.map((m) => ({
      phone: m.phone,
      status: m.status,
      createdAt: m.createdAt?.toISOString(),
    })),
  });
});

/** POST /messages/bulk-jobs/:id/retry-failed — kirim ulang pesan gagal dalam satu job */
router.post("/messages/bulk-jobs/:id/retry-failed", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const jobId = parseInt(req.params.id, 10);

  const [job] = await db.select().from(bulkJobsTable)
    .where(and(eq(bulkJobsTable.id, jobId), eq(bulkJobsTable.userId, uid)));
  if (!job) { res.status(404).json({ message: "Job tidak ditemukan" }); return; }

  const failed = await db.select().from(messagesTable)
    .where(and(eq(messagesTable.userId, uid), eq(messagesTable.bulkJobId, jobId), eq(messagesTable.status, "failed")));

  if (failed.length === 0) {
    res.json({ retried: 0, message: "Tidak ada pesan gagal dalam job ini." });
    return;
  }

  let retried = 0;
  let errors = 0;

  for (const msg of failed) {
    try {
      const sess = getSession(msg.deviceId);
      if (!sess?.socket) { errors++; continue; }
      const jid = `${msg.phone}@s.whatsapp.net`;
      await sendWithAntiBanned({ socket: sess.socket, jid, message: msg.message });
      await db.update(messagesTable).set({ status: "sent" }).where(eq(messagesTable.id, msg.id));
      retried++;
    } catch {
      errors++;
    }
  }

  // Update job counters
  const newFailed = Math.max(0, (job.failed ?? 0) - retried);
  const newSent = (job.sent ?? 0) + retried;
  await db.update(bulkJobsTable).set({ sent: newSent, failed: newFailed }).where(eq(bulkJobsTable.id, jobId));

  res.json({ retried, errors, total: failed.length });
});

/** POST /messages/send-group — kirim pesan ke grup WA */
router.post("/messages/send-group", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { deviceId, groupId, message } = req.body;
  if (!deviceId || !groupId || !message?.trim()) {
    res.status(400).json({ error: "deviceId, groupId, dan message wajib diisi" });
    return;
  }

  const sess = getSession(parseInt(deviceId, 10));
  if (!sess?.socket) {
    res.status(400).json({ error: "Perangkat tidak terhubung" });
    return;
  }

  try {
    const jid = groupId.includes("@") ? groupId : `${groupId}@g.us`;
    await sess.socket.sendMessage(jid, { text: message });

    const [saved] = await db.insert(messagesTable).values({
      userId: uid,
      deviceId: parseInt(deviceId, 10),
      phone: groupId,
      message,
      messageType: "text",
      status: "sent",
    }).returning();

    res.json({ success: true, messageId: saved.id });
  } catch (err: any) {
    res.status(500).json({ error: err.message ?? "Gagal kirim pesan grup" });
  }
});

/** POST /messages/retry-failed — kirim ulang semua pesan gagal */
router.post("/messages/retry-failed", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { deviceId } = req.body;

  const where = deviceId
    ? and(eq(messagesTable.userId, uid), eq(messagesTable.status, "failed"), eq(messagesTable.deviceId, parseInt(deviceId, 10)))
    : and(eq(messagesTable.userId, uid), eq(messagesTable.status, "failed"));

  const failed = await db.select().from(messagesTable).where(where);
  if (failed.length === 0) {
    res.json({ retried: 0, message: "Tidak ada pesan gagal." });
    return;
  }

  // Pilih device
  let targetDeviceId = deviceId ? parseInt(deviceId, 10) : failed[0].deviceId;
  const session = getSession(targetDeviceId);

  let retried = 0;
  let errors = 0;

  for (const msg of failed) {
    try {
      const sess = getSession(msg.deviceId);
      if (!sess?.socket) { errors++; continue; }

      const jid = `${msg.phone}@s.whatsapp.net`;
      await sendWithAntiBanned({ socket: sess.socket, jid, message: msg.message });

      await db.update(messagesTable)
        .set({ status: "sent" })
        .where(eq(messagesTable.id, msg.id));

      retried++;
    } catch {
      errors++;
    }
  }

  res.json({ retried, errors, total: failed.length });
});

export default router;
