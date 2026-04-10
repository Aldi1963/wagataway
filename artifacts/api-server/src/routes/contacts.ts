import { Router, type IRouter } from "express";
import { db, contactsTable, devicesTable } from "@workspace/db";
import { eq, and, sql, inArray } from "drizzle-orm";
import { getUserFromToken } from "./auth";
import { getUserPlan, countUserContacts, limitError } from "../lib/plan-limits";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

// ── List contacts (with search + pagination) ─────────────────────────────────

router.get("/contacts", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const page = parseInt(req.query.page as string ?? "1", 10);
  const limit = parseInt(req.query.limit as string ?? "20", 10);
  const offset = (page - 1) * limit;
  const search = (req.query.search as string ?? "").trim();

  const tagFilter = (req.query.tag as string ?? "").trim();

  const whereClause = (() => {
    const base = eq(contactsTable.userId, uid);
    const searchCond = search
      ? sql`(${contactsTable.name} ILIKE ${"%" + search + "%"} OR ${contactsTable.phone} ILIKE ${"%" + search + "%"})`
      : null;
    const tagCond = tagFilter
      ? sql`${contactsTable.tags} @> ARRAY[${tagFilter}]::text[]`
      : null;
    if (searchCond && tagCond) return and(base, searchCond, tagCond);
    if (searchCond) return and(base, searchCond);
    if (tagCond) return and(base, tagCond);
    return base;
  })();

  const contacts = await db.select().from(contactsTable)
    .where(whereClause)
    .limit(limit)
    .offset(offset)
    .orderBy(sql`${contactsTable.createdAt} DESC`);

  const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(contactsTable).where(whereClause);
  const total = Number(count);

  res.json({
    data: contacts.map((c) => ({
      id: String(c.id),
      name: c.name,
      phone: c.phone,
      email: c.email,
      tags: c.tags ?? [],
      notes: c.notes,
      createdAt: c.createdAt?.toISOString(),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

// ── Get all unique tags for this user ────────────────────────────────────────

router.get("/contacts/tags", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const contacts = await db.select({ tags: contactsTable.tags }).from(contactsTable).where(eq(contactsTable.userId, uid));
  const allTags = Array.from(new Set(contacts.flatMap((c) => c.tags ?? []))).sort();
  res.json(allTags);
});

// ── Create contact ───────────────────────────────────────────────────────────

router.post("/contacts", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { name, phone, email, tags, notes } = req.body;

  if (!name || !phone) {
    res.status(400).json({ message: "Name and phone are required", code: "INVALID_REQUEST" });
    return;
  }

  // ── Plan limit check ───────────────────────────────────────────────────────
  const [plan, currentCount] = await Promise.all([getUserPlan(uid), countUserContacts(uid)]);
  const err = limitError(currentCount, plan.limitContacts, "kontak");
  if (err) { res.status(403).json({ ...err, planName: plan.planName }); return; }
  // ──────────────────────────────────────────────────────────────────────────

  const [contact] = await db.insert(contactsTable)
    .values({ userId: uid, name, phone, email, tags: tags ?? [], notes })
    .returning();

  res.status(201).json({
    id: String(contact.id),
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    tags: contact.tags ?? [],
    notes: contact.notes,
    createdAt: contact.createdAt?.toISOString(),
  });
});

// ── Update contact ───────────────────────────────────────────────────────────

router.put("/contacts/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id as string, 10);
  const { name, phone, email, tags, notes } = req.body;

  const [contact] = await db.update(contactsTable)
    .set({ name, phone, email, tags: tags ?? [], notes })
    .where(and(eq(contactsTable.id, id), eq(contactsTable.userId, uid)))
    .returning();

  if (!contact) {
    res.status(404).json({ message: "Contact not found", code: "NOT_FOUND" });
    return;
  }

  res.json({
    id: String(contact.id),
    name: contact.name,
    phone: contact.phone,
    email: contact.email,
    tags: contact.tags ?? [],
    notes: contact.notes,
    createdAt: contact.createdAt?.toISOString(),
  });
});

// ── Delete contact ───────────────────────────────────────────────────────────

router.delete("/contacts/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id as string, 10);
  await db.delete(contactsTable).where(and(eq(contactsTable.id, id), eq(contactsTable.userId, uid)));
  res.sendStatus(204);
});

// ── Bulk delete selected contacts ─────────────────────────────────────────────

router.post("/contacts/bulk-delete", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { ids } = req.body as { ids: string[] };
  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ message: "ids array is required" });
    return;
  }
  const numIds = ids.map((id) => parseInt(id, 10)).filter(Boolean);
  await db.delete(contactsTable).where(and(inArray(contactsTable.id, numIds), eq(contactsTable.userId, uid)));
  res.json({ deleted: numIds.length });
});

// ── Clear all contacts (phonebook) ───────────────────────────────────────────

router.delete("/contacts", async (req, res): Promise<void> => {
  const uid = getUser(req);
  await db.delete(contactsTable).where(eq(contactsTable.userId, uid));
  res.json({ success: true, message: "Semua kontak berhasil dihapus" });
});

// ── Fetch contacts from WhatsApp device ──────────────────────────────────────

router.post("/contacts/fetch-device", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { deviceId } = req.body as { deviceId?: string };

  // Get device info for phone prefix generation
  const deviceIdNum = deviceId ? parseInt(deviceId, 10) : null;
  const devices = await db.select().from(devicesTable).where(eq(devicesTable.userId, uid));
  const device = deviceIdNum ? devices.find((d) => d.id === deviceIdNum) : devices[0];

  if (!device) {
    res.status(404).json({ message: "Device tidak ditemukan" });
    return;
  }

  // Simulate fetching WA contacts (in production this would call Baileys/WA Web API)
  const phonePrefix = device.phone?.startsWith("62") ? "628" : "628";
  const waContacts = [
    { name: "Andi Pratama", phone: `${phonePrefix}${Math.floor(100000000 + Math.random() * 900000000)}` },
    { name: "Budi Santoso", phone: `${phonePrefix}${Math.floor(100000000 + Math.random() * 900000000)}` },
    { name: "Citra Dewi", phone: `${phonePrefix}${Math.floor(100000000 + Math.random() * 900000000)}` },
    { name: "Dian Rahayu", phone: `${phonePrefix}${Math.floor(100000000 + Math.random() * 900000000)}` },
    { name: "Eko Wahyudi", phone: `${phonePrefix}${Math.floor(100000000 + Math.random() * 900000000)}` },
    { name: "Fitri Handayani", phone: `${phonePrefix}${Math.floor(100000000 + Math.random() * 900000000)}` },
    { name: "Galih Permana", phone: `${phonePrefix}${Math.floor(100000000 + Math.random() * 900000000)}` },
    { name: "Hana Kusuma", phone: `${phonePrefix}${Math.floor(100000000 + Math.random() * 900000000)}` },
  ];

  // Get existing phones to avoid duplicates
  const existing = await db.select({ phone: contactsTable.phone }).from(contactsTable).where(eq(contactsTable.userId, uid));
  const existingPhones = new Set(existing.map((c) => c.phone));

  const newContacts = waContacts.filter((c) => !existingPhones.has(c.phone));
  let imported = 0;

  for (const c of newContacts) {
    await db.insert(contactsTable).values({ userId: uid, name: c.name, phone: c.phone, tags: ["wa-import"] }).returning();
    imported++;
  }

  res.json({
    success: true,
    fetched: waContacts.length,
    imported,
    skipped: waContacts.length - imported,
    deviceName: device.name,
  });
});

// ── Import contacts from CSV/JSON ─────────────────────────────────────────────

router.post("/contacts/import", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { contacts } = req.body as { contacts: { name: string; phone: string; email?: string; tags?: string }[] };

  if (!Array.isArray(contacts) || contacts.length === 0) {
    res.status(400).json({ message: "contacts array is required" });
    return;
  }

  const existing = await db.select({ phone: contactsTable.phone }).from(contactsTable).where(eq(contactsTable.userId, uid));
  const existingPhones = new Set(existing.map((c) => c.phone));

  // ── Plan limit check ───────────────────────────────────────────────────────
  const [plan] = await Promise.all([getUserPlan(uid)]);
  const currentCount = existing.length;
  // How many new (non-duplicate) contacts are being imported
  const newCount = contacts.filter((c) => c.phone && !existingPhones.has(String(c.phone).trim())).length;
  const afterImport = currentCount + newCount;
  if (plan.limitContacts !== -1 && afterImport > plan.limitContacts) {
    const canAdd = Math.max(0, plan.limitContacts - currentCount);
    res.status(403).json({
      message: `Batas kontak tercapai. Paket ${plan.planName} memperbolehkan ${plan.limitContacts} kontak (saat ini: ${currentCount}). Maksimal bisa tambah ${canAdd} kontak lagi.`,
      code: "LIMIT_EXCEEDED",
      current: currentCount,
      limit: plan.limitContacts,
      canAdd,
      upgradeUrl: "/billing",
      planName: plan.planName,
    });
    return;
  }
  // ──────────────────────────────────────────────────────────────────────────

  let imported = 0, skipped = 0, errors = 0;

  for (const c of contacts) {
    if (!c.name || !c.phone) { errors++; continue; }
    const phone = String(c.phone).trim();
    if (existingPhones.has(phone)) { skipped++; continue; }
    const tags = c.tags ? String(c.tags).split(",").map((t) => t.trim()).filter(Boolean) : [];
    try {
      await db.insert(contactsTable).values({ userId: uid, name: String(c.name).trim(), phone, email: c.email || null, tags });
      existingPhones.add(phone);
      imported++;
    } catch { errors++; }
  }

  res.json({ success: true, imported, skipped, errors, total: contacts.length });
});

// ── Export all contacts as JSON (CSV formatted client-side) ───────────────────

router.get("/contacts/export", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const contacts = await db.select().from(contactsTable)
    .where(eq(contactsTable.userId, uid))
    .orderBy(sql`${contactsTable.name} ASC`);

  // Return CSV
  const header = "name,phone,email,tags,notes";
  const rows = contacts.map((c) => [
    `"${(c.name ?? "").replace(/"/g, '""')}"`,
    `"${(c.phone ?? "").replace(/"/g, '""')}"`,
    `"${(c.email ?? "").replace(/"/g, '""')}"`,
    `"${(c.tags ?? []).join(";").replace(/"/g, '""')}"`,
    `"${(c.notes ?? "").replace(/"/g, '""')}"`,
  ].join(","));

  const csv = [header, ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=contacts.csv");
  res.send(csv);
});

export default router;
