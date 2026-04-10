import { Router, type IRouter } from "express";
import { db, usersTable, resellerSubUsersTable, devicesTable, messagesTable } from "@workspace/db";
import { eq, and, inArray, sql } from "drizzle-orm";
import { getUserFromToken } from "./auth";
import crypto from "crypto";

const router: IRouter = Router();

const SCRYPT_PARAMS = { N: 16384, r: 8, p: 1 };
const KEY_LEN = 64;

function hashPassword(password: string): string {
  const s = crypto.randomBytes(16).toString("hex");
  const key = crypto.scryptSync(password, s, KEY_LEN, SCRYPT_PARAMS);
  return `scrypt:${s}:${key.toString("hex")}`;
}

function getUser(req: any): number {
  const token = req.headers.authorization?.startsWith("Bearer ")
    ? req.headers.authorization.slice(7)
    : null;
  return (token ? getUserFromToken(token) : null) ?? 0;
}

// ── Guard: must be reseller ───────────────────────────────────────────────────

async function requireReseller(req: any, res: any): Promise<{ id: number } | null> {
  const uid = getUser(req);
  if (!uid) { res.status(401).json({ error: "Unauthorized" }); return null; }
  const [user] = await db.select({ id: usersTable.id, isReseller: usersTable.isReseller, role: usersTable.role })
    .from(usersTable).where(eq(usersTable.id, uid));
  if (!user) { res.status(401).json({ error: "User not found" }); return null; }
  if (!user.isReseller && user.role !== "admin") {
    res.status(403).json({ error: "Akun Anda belum terdaftar sebagai reseller" });
    return null;
  }
  return { id: uid };
}

// ── GET /reseller/profile ─────────────────────────────────────────────────────

router.get("/reseller/profile", async (req, res): Promise<void> => {
  const me = await requireReseller(req, res);
  if (!me) return;

  const subLinks = await db.select().from(resellerSubUsersTable)
    .where(eq(resellerSubUsersTable.resellerId, me.id));
  const subIds = subLinks.map((s) => s.subUserId);

  let subUsers: any[] = [];
  if (subIds.length > 0) {
    const users = await db.select({
      id: usersTable.id,
      name: usersTable.name,
      email: usersTable.email,
      plan: usersTable.plan,
      isSuspended: usersTable.isSuspended,
      createdAt: usersTable.createdAt,
    }).from(usersTable).where(inArray(usersTable.id, subIds));

    subUsers = users.map((u) => {
      const quota = subLinks.find((s) => s.subUserId === u.id);
      return { ...u, quota };
    });
  }

  const totalDevices = subIds.length > 0
    ? await db.select({ count: sql<number>`count(*)` }).from(devicesTable)
        .where(inArray(devicesTable.userId, subIds)).then((r) => Number(r[0]?.count ?? 0))
    : 0;

  const msgToday = subIds.length > 0
    ? await db.select({ count: sql<number>`count(*)` }).from(messagesTable)
        .where(and(
          inArray(messagesTable.userId, subIds),
          sql`${messagesTable.createdAt} >= NOW() - INTERVAL '1 day'`
        )).then((r) => Number(r[0]?.count ?? 0))
    : 0;

  res.json({
    totalSubUsers: subUsers.length,
    totalDevices,
    messagesToday: msgToday,
    subUsers,
  });
});

// ── GET /reseller/sub-users ───────────────────────────────────────────────────

router.get("/reseller/sub-users", async (req, res): Promise<void> => {
  const me = await requireReseller(req, res);
  if (!me) return;

  const subLinks = await db.select().from(resellerSubUsersTable)
    .where(eq(resellerSubUsersTable.resellerId, me.id));
  const subIds = subLinks.map((s) => s.subUserId);

  if (subIds.length === 0) { res.json([]); return; }

  const users = await db.select({
    id: usersTable.id,
    name: usersTable.name,
    email: usersTable.email,
    plan: usersTable.plan,
    isSuspended: usersTable.isSuspended,
    createdAt: usersTable.createdAt,
  }).from(usersTable).where(inArray(usersTable.id, subIds));

  const result = users.map((u) => {
    const quota = subLinks.find((s) => s.subUserId === u.id);
    return { ...u, quota };
  });

  res.json(result);
});

// ── POST /reseller/sub-users — create new sub-account ────────────────────────

router.post("/reseller/sub-users", async (req, res): Promise<void> => {
  const me = await requireReseller(req, res);
  if (!me) return;

  const { name, email, password, allocatedDevices, allocatedMessagesPerDay, allocatedContacts } = req.body;

  if (!name || !email || !password) {
    res.status(400).json({ error: "name, email, dan password wajib diisi" });
    return;
  }

  const existing = await db.select({ id: usersTable.id }).from(usersTable)
    .where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(409).json({ error: "Email sudah terdaftar" });
    return;
  }

  const hashed = hashPassword(password);

  const [newUser] = await db.insert(usersTable).values({
    name,
    email,
    password: hashed,
    plan: "free",
    role: "user",
    parentId: me.id,
  }).returning({ id: usersTable.id });

  await db.insert(resellerSubUsersTable).values({
    resellerId: me.id,
    subUserId: newUser.id,
    allocatedDevices: allocatedDevices ?? 2,
    allocatedMessagesPerDay: allocatedMessagesPerDay ?? 1000,
    allocatedContacts: allocatedContacts ?? 5000,
  });

  res.json({ success: true, subUserId: newUser.id, message: "Sub-akun berhasil dibuat" });
});

// ── PUT /reseller/sub-users/:id — update quota ────────────────────────────────

router.put("/reseller/sub-users/:id", async (req, res): Promise<void> => {
  const me = await requireReseller(req, res);
  if (!me) return;

  const subUserId = parseInt(req.params.id, 10);
  const { allocatedDevices, allocatedMessagesPerDay, allocatedContacts } = req.body;

  const link = await db.select().from(resellerSubUsersTable)
    .where(and(eq(resellerSubUsersTable.resellerId, me.id), eq(resellerSubUsersTable.subUserId, subUserId)));

  if (!link.length) { res.status(404).json({ error: "Sub-user tidak ditemukan" }); return; }

  await db.update(resellerSubUsersTable).set({
    ...(allocatedDevices != null && { allocatedDevices }),
    ...(allocatedMessagesPerDay != null && { allocatedMessagesPerDay }),
    ...(allocatedContacts != null && { allocatedContacts }),
  }).where(and(eq(resellerSubUsersTable.resellerId, me.id), eq(resellerSubUsersTable.subUserId, subUserId)));

  res.json({ success: true });
});

// ── POST /reseller/sub-users/:id/suspend — toggle suspend ─────────────────────

router.post("/reseller/sub-users/:id/suspend", async (req, res): Promise<void> => {
  const me = await requireReseller(req, res);
  if (!me) return;

  const subUserId = parseInt(req.params.id, 10);
  const link = await db.select().from(resellerSubUsersTable)
    .where(and(eq(resellerSubUsersTable.resellerId, me.id), eq(resellerSubUsersTable.subUserId, subUserId)));

  if (!link.length) { res.status(404).json({ error: "Sub-user tidak ditemukan" }); return; }

  const [current] = await db.select({ isSuspended: usersTable.isSuspended })
    .from(usersTable).where(eq(usersTable.id, subUserId));

  const newState = !current?.isSuspended;
  await db.update(usersTable).set({ isSuspended: newState }).where(eq(usersTable.id, subUserId));

  res.json({ success: true, isSuspended: newState, message: newState ? "Sub-user disuspend" : "Sub-user diaktifkan kembali" });
});

// ── DELETE /reseller/sub-users/:id — remove sub-user ─────────────────────────

router.delete("/reseller/sub-users/:id", async (req, res): Promise<void> => {
  const me = await requireReseller(req, res);
  if (!me) return;

  const subUserId = parseInt(req.params.id, 10);

  const link = await db.select().from(resellerSubUsersTable)
    .where(and(eq(resellerSubUsersTable.resellerId, me.id), eq(resellerSubUsersTable.subUserId, subUserId)));

  if (!link.length) { res.status(404).json({ error: "Sub-user tidak ditemukan" }); return; }

  await db.delete(resellerSubUsersTable)
    .where(and(eq(resellerSubUsersTable.resellerId, me.id), eq(resellerSubUsersTable.subUserId, subUserId)));

  await db.update(usersTable).set({ parentId: null as any })
    .where(eq(usersTable.id, subUserId));

  res.json({ success: true, message: "Sub-user berhasil dihapus dari jaringan reseller" });
});

// ── GET /reseller/sub-users/:id/stats ─────────────────────────────────────────

router.get("/reseller/sub-users/:id/stats", async (req, res): Promise<void> => {
  const me = await requireReseller(req, res);
  if (!me) return;

  const subUserId = parseInt(req.params.id, 10);
  const link = await db.select().from(resellerSubUsersTable)
    .where(and(eq(resellerSubUsersTable.resellerId, me.id), eq(resellerSubUsersTable.subUserId, subUserId)));
  if (!link.length) { res.status(404).json({ error: "Sub-user tidak ditemukan" }); return; }

  const deviceCount = await db.select({ count: sql<number>`count(*)` }).from(devicesTable)
    .where(eq(devicesTable.userId, subUserId)).then((r) => Number(r[0]?.count ?? 0));

  const msgToday = await db.select({ count: sql<number>`count(*)` }).from(messagesTable)
    .where(and(
      eq(messagesTable.userId, subUserId),
      sql`${messagesTable.createdAt} >= NOW() - INTERVAL '1 day'`
    )).then((r) => Number(r[0]?.count ?? 0));

  res.json({ deviceCount, messagesToday: msgToday, quota: link[0] });
});

export default router;
