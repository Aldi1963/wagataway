import { Router } from "express";
import { db } from "@workspace/db";
import { dripCampaignsTable, dripStepsTable, dripEnrollmentsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { getUserFromToken } from "./auth";

const router = Router();

function getUser(req: any): number {
  const token = req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null;
  return (token ? getUserFromToken(token) : null) ?? 1;
}

// ── Campaigns ─────────────────────────────────────────────────────────────────

router.get("/drip", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const campaigns = await db
    .select()
    .from(dripCampaignsTable)
    .where(eq(dripCampaignsTable.userId, uid))
    .orderBy(sql`${dripCampaignsTable.createdAt} DESC`);

  const result = await Promise.all(campaigns.map(async (c) => {
    const [steps] = await db
      .select({ count: sql<number>`count(*)` })
      .from(dripStepsTable)
      .where(eq(dripStepsTable.campaignId, c.id));
    const [enrolls] = await db
      .select({ count: sql<number>`count(*)` })
      .from(dripEnrollmentsTable)
      .where(and(eq(dripEnrollmentsTable.campaignId, c.id), eq(dripEnrollmentsTable.status, "active")));
    return {
      id: String(c.id), name: c.name, description: c.description,
      status: c.status, deviceId: String(c.deviceId),
      stepsCount: Number(steps?.count ?? 0),
      activeEnrollments: Number(enrolls?.count ?? 0),
      createdAt: c.createdAt?.toISOString(),
    };
  }));
  res.json(result);
});

router.post("/drip", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { name, description, deviceId, status } = req.body;
  if (!name || !deviceId) { res.status(400).json({ message: "name dan deviceId wajib diisi" }); return; }
  const [c] = await db.insert(dripCampaignsTable)
    .values({ userId: uid, deviceId: parseInt(deviceId, 10), name, description: description ?? null, status: status ?? "active" })
    .returning();
  res.json({ id: String(c.id), name: c.name, status: c.status, createdAt: c.createdAt?.toISOString() });
});

router.put("/drip/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const { name, description, status, deviceId } = req.body;
  const [existing] = await db.select().from(dripCampaignsTable).where(and(eq(dripCampaignsTable.id, id), eq(dripCampaignsTable.userId, uid)));
  if (!existing) { res.status(404).json({ message: "Campaign tidak ditemukan" }); return; }
  const updates: any = {};
  if (name !== undefined) updates.name = name;
  if (description !== undefined) updates.description = description;
  if (status !== undefined) updates.status = status;
  if (deviceId !== undefined) updates.deviceId = parseInt(deviceId, 10);
  const [c] = await db.update(dripCampaignsTable).set(updates).where(eq(dripCampaignsTable.id, id)).returning();
  res.json({ id: String(c.id), name: c.name, status: c.status });
});

router.delete("/drip/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const [existing] = await db.select().from(dripCampaignsTable).where(and(eq(dripCampaignsTable.id, id), eq(dripCampaignsTable.userId, uid)));
  if (!existing) { res.status(404).json({ message: "Campaign tidak ditemukan" }); return; }
  await db.delete(dripEnrollmentsTable).where(eq(dripEnrollmentsTable.campaignId, id));
  await db.delete(dripStepsTable).where(eq(dripStepsTable.campaignId, id));
  await db.delete(dripCampaignsTable).where(eq(dripCampaignsTable.id, id));
  res.json({ message: "Campaign dihapus" });
});

// ── Steps ─────────────────────────────────────────────────────────────────────

router.get("/drip/:id/steps", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const [campaign] = await db.select().from(dripCampaignsTable).where(and(eq(dripCampaignsTable.id, id), eq(dripCampaignsTable.userId, uid)));
  if (!campaign) { res.status(404).json({ message: "Campaign tidak ditemukan" }); return; }
  const steps = await db.select().from(dripStepsTable).where(eq(dripStepsTable.campaignId, id))
    .orderBy(dripStepsTable.stepOrder);
  res.json(steps.map((s) => ({
    id: String(s.id), stepOrder: s.stepOrder, delayDays: s.delayDays,
    message: s.message, mediaUrl: s.mediaUrl, mediaType: s.mediaType,
  })));
});

router.post("/drip/:id/steps", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const [campaign] = await db.select().from(dripCampaignsTable).where(and(eq(dripCampaignsTable.id, id), eq(dripCampaignsTable.userId, uid)));
  if (!campaign) { res.status(404).json({ message: "Campaign tidak ditemukan" }); return; }
  const { message, delayDays, stepOrder, mediaUrl, mediaType } = req.body;
  if (!message) { res.status(400).json({ message: "message wajib diisi" }); return; }
  const [step] = await db.insert(dripStepsTable).values({
    campaignId: id, userId: uid,
    stepOrder: stepOrder ?? 0,
    delayDays: delayDays ?? 0,
    message, mediaUrl: mediaUrl ?? null, mediaType: mediaType ?? null,
  }).returning();
  res.json({ id: String(step.id), stepOrder: step.stepOrder, delayDays: step.delayDays, message: step.message });
});

router.put("/drip/steps/:stepId", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const stepId = parseInt(req.params.stepId, 10);
  const [step] = await db.select().from(dripStepsTable).where(and(eq(dripStepsTable.id, stepId), eq(dripStepsTable.userId, uid)));
  if (!step) { res.status(404).json({ message: "Step tidak ditemukan" }); return; }
  const { message, delayDays, stepOrder, mediaUrl, mediaType } = req.body;
  const updates: any = {};
  if (message !== undefined) updates.message = message;
  if (delayDays !== undefined) updates.delayDays = delayDays;
  if (stepOrder !== undefined) updates.stepOrder = stepOrder;
  if (mediaUrl !== undefined) updates.mediaUrl = mediaUrl;
  if (mediaType !== undefined) updates.mediaType = mediaType;
  const [s] = await db.update(dripStepsTable).set(updates).where(eq(dripStepsTable.id, stepId)).returning();
  res.json({ id: String(s.id), stepOrder: s.stepOrder, delayDays: s.delayDays, message: s.message });
});

router.delete("/drip/steps/:stepId", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const stepId = parseInt(req.params.stepId, 10);
  const [step] = await db.select().from(dripStepsTable).where(and(eq(dripStepsTable.id, stepId), eq(dripStepsTable.userId, uid)));
  if (!step) { res.status(404).json({ message: "Step tidak ditemukan" }); return; }
  await db.delete(dripStepsTable).where(eq(dripStepsTable.id, stepId));
  res.json({ message: "Step dihapus" });
});

// ── Enrollments ───────────────────────────────────────────────────────────────

router.get("/drip/:id/enrollments", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const [campaign] = await db.select().from(dripCampaignsTable).where(and(eq(dripCampaignsTable.id, id), eq(dripCampaignsTable.userId, uid)));
  if (!campaign) { res.status(404).json({ message: "Campaign tidak ditemukan" }); return; }
  const enrollments = await db.select().from(dripEnrollmentsTable).where(eq(dripEnrollmentsTable.campaignId, id))
    .orderBy(sql`${dripEnrollmentsTable.enrolledAt} DESC`).limit(200);
  res.json(enrollments.map((e) => ({
    id: String(e.id), phone: e.phone, contactName: e.contactName,
    currentStep: e.currentStep, status: e.status,
    nextSendAt: e.nextSendAt?.toISOString(),
    enrolledAt: e.enrolledAt?.toISOString(),
  })));
});

router.post("/drip/:id/enroll", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const [campaign] = await db.select().from(dripCampaignsTable).where(and(eq(dripCampaignsTable.id, id), eq(dripCampaignsTable.userId, uid)));
  if (!campaign) { res.status(404).json({ message: "Campaign tidak ditemukan" }); return; }
  const { contacts } = req.body;
  if (!Array.isArray(contacts) || !contacts.length) { res.status(400).json({ message: "contacts wajib diisi" }); return; }
  const steps = await db.select().from(dripStepsTable).where(eq(dripStepsTable.campaignId, id)).orderBy(dripStepsTable.stepOrder);
  if (!steps.length) { res.status(400).json({ message: "Campaign belum memiliki langkah (step)" }); return; }
  const firstStep = steps[0]!;
  const nextSendAt = new Date(Date.now() + firstStep.delayDays * 86400000);
  let enrolled = 0;
  let skipped = 0;
  for (const c of contacts) {
    const phone = typeof c === "string" ? c : c.phone;
    const name = typeof c === "string" ? undefined : c.name;
    const [existing] = await db.select().from(dripEnrollmentsTable)
      .where(and(eq(dripEnrollmentsTable.campaignId, id), eq(dripEnrollmentsTable.phone, phone), eq(dripEnrollmentsTable.status, "active")));
    if (existing) { skipped++; continue; }
    await db.insert(dripEnrollmentsTable).values({
      campaignId: id, userId: uid, phone, contactName: name ?? null,
      currentStep: 0, nextSendAt, status: "active",
    });
    enrolled++;
  }
  res.json({ enrolled, skipped });
});

router.delete("/drip/enrollments/:enrollId", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const enrollId = parseInt(req.params.enrollId, 10);
  const [e] = await db.select().from(dripEnrollmentsTable).where(and(eq(dripEnrollmentsTable.id, enrollId), eq(dripEnrollmentsTable.userId, uid)));
  if (!e) { res.status(404).json({ message: "Enrollment tidak ditemukan" }); return; }
  await db.update(dripEnrollmentsTable).set({ status: "cancelled" }).where(eq(dripEnrollmentsTable.id, enrollId));
  res.json({ message: "Enrollment dibatalkan" });
});

export default router;
