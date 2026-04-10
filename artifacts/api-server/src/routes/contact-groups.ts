import { Router, type IRouter } from "express";
import { db, contactGroupsTable, contactGroupMembersTable, contactsTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getUserFromToken } from "./auth";

const router: IRouter = Router();

function getUser(req: any): number {
  const token = (req.headers.authorization?.startsWith("Bearer ") ? req.headers.authorization.slice(7) : null);
  return (token ? getUserFromToken(token) : null) ?? 1;
}

router.get("/contact-groups", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const groups = await db.select().from(contactGroupsTable)
    .where(eq(contactGroupsTable.userId, uid))
    .orderBy(sql`${contactGroupsTable.createdAt} DESC`);

  const counts = await db.select({
    groupId: contactGroupMembersTable.groupId,
    count: sql<number>`count(*)::int`,
  }).from(contactGroupMembersTable)
    .where(eq(contactGroupMembersTable.userId, uid))
    .groupBy(contactGroupMembersTable.groupId);

  const countMap = Object.fromEntries(counts.map((c) => [c.groupId, c.count]));
  res.json(groups.map((g) => ({ ...g, id: String(g.id), memberCount: countMap[g.id] ?? 0 })));
});

router.post("/contact-groups", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const { name, color, description } = req.body;
  if (!name) { res.status(400).json({ message: "Name required" }); return; }
  const [g] = await db.insert(contactGroupsTable)
    .values({ userId: uid, name, color: color ?? "#3b82f6", description: description ?? null })
    .returning();
  res.status(201).json({ ...g, id: String(g.id), memberCount: 0 });
});

router.put("/contact-groups/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const { name, color, description } = req.body;
  const [g] = await db.update(contactGroupsTable)
    .set({ name, color, description })
    .where(and(eq(contactGroupsTable.id, id), eq(contactGroupsTable.userId, uid)))
    .returning();
  if (!g) { res.status(404).json({ message: "Not found" }); return; }
  res.json({ ...g, id: String(g.id) });
});

router.delete("/contact-groups/:id", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  await db.delete(contactGroupMembersTable).where(and(eq(contactGroupMembersTable.groupId, id), eq(contactGroupMembersTable.userId, uid)));
  await db.delete(contactGroupsTable).where(and(eq(contactGroupsTable.id, id), eq(contactGroupsTable.userId, uid)));
  res.json({ success: true });
});

router.get("/contact-groups/:id/members", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const id = parseInt(req.params.id, 10);
  const members = await db.select({ contact: contactsTable })
    .from(contactGroupMembersTable)
    .innerJoin(contactsTable, eq(contactGroupMembersTable.contactId, contactsTable.id))
    .where(and(eq(contactGroupMembersTable.groupId, id), eq(contactGroupMembersTable.userId, uid)));
  res.json(members.map((m) => ({ ...m.contact, id: String(m.contact.id) })));
});

router.post("/contact-groups/:id/members", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const groupId = parseInt(req.params.id, 10);
  const { contactIds } = req.body as { contactIds: number[] };
  if (!contactIds?.length) { res.status(400).json({ message: "contactIds required" }); return; }

  const existing = await db.select({ contactId: contactGroupMembersTable.contactId })
    .from(contactGroupMembersTable)
    .where(and(eq(contactGroupMembersTable.groupId, groupId), eq(contactGroupMembersTable.userId, uid)));
  const existingSet = new Set(existing.map((e) => e.contactId));
  const newIds = contactIds.filter((id) => !existingSet.has(id));

  if (newIds.length > 0) {
    await db.insert(contactGroupMembersTable)
      .values(newIds.map((contactId) => ({ groupId, contactId, userId: uid })));
  }
  res.json({ added: newIds.length });
});

router.delete("/contact-groups/:id/members/:contactId", async (req, res): Promise<void> => {
  const uid = getUser(req);
  const groupId = parseInt(req.params.id, 10);
  const contactId = parseInt(req.params.contactId, 10);
  await db.delete(contactGroupMembersTable)
    .where(and(eq(contactGroupMembersTable.groupId, groupId), eq(contactGroupMembersTable.contactId, contactId), eq(contactGroupMembersTable.userId, uid)));
  res.json({ success: true });
});

export default router;
