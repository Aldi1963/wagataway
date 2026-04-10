import { Router } from "express";
import { db, notificationsTable, subscriptionsTable, devicesTable, usersTable } from "@workspace/db";
import { eq, and, desc, count } from "drizzle-orm";
import { uid } from "../middlewares/require-auth";
import type { Request, Response } from "express";

const router = Router();

// ── Auto-generate system notifications ───────────────────────────────────────

async function ensureSystemNotifications(userId: number): Promise<void> {
  // Trial expiring soon
  const [sub] = await db
    .select()
    .from(subscriptionsTable)
    .where(eq(subscriptionsTable.userId, userId))
    .orderBy(desc(subscriptionsTable.createdAt))
    .limit(1);

  if (sub && sub.status === "trial" && sub.currentPeriodEnd) {
    const daysLeft = Math.ceil((new Date(sub.currentPeriodEnd).getTime() - Date.now()) / 86400000);
    if (daysLeft <= 3 && daysLeft >= 0) {
      const existing = await db
        .select({ id: notificationsTable.id })
        .from(notificationsTable)
        .where(and(
          eq(notificationsTable.userId, userId),
          eq(notificationsTable.type, "trial_expiry"),
          eq(notificationsTable.isRead, false),
        ))
        .limit(1);

      if (existing.length === 0) {
        const expDate = new Date(sub.currentPeriodEnd).toLocaleDateString("id-ID", { day: "numeric", month: "long", year: "numeric" });
        await db.insert(notificationsTable).values({
          userId,
          type: "trial_expiry",
          title: daysLeft === 0 ? "Trial berakhir hari ini!" : `Trial berakhir dalam ${daysLeft} hari`,
          message: daysLeft === 0
            ? "Segera upgrade paket untuk melanjutkan akses semua fitur."
            : `Trial paket ${sub.planName} berakhir pada ${expDate}. Upgrade sekarang agar tidak kehilangan akses.`,
          link: "/billing",
        });
      }
    }
  }

  // Device disconnected
  const disconnected = await db
    .select({ id: devicesTable.id, name: devicesTable.name })
    .from(devicesTable)
    .where(and(eq(devicesTable.userId, userId), eq(devicesTable.status, "disconnected")));

  if (disconnected.length > 0) {
    const existing = await db
      .select({ id: notificationsTable.id })
      .from(notificationsTable)
      .where(and(
        eq(notificationsTable.userId, userId),
        eq(notificationsTable.type, "device_disconnected"),
        eq(notificationsTable.isRead, false),
      ))
      .limit(1);

    if (existing.length === 0) {
      const names = disconnected.slice(0, 2).map((d) => `"${d.name}"`).join(", ");
      const extra = disconnected.length > 2 ? ` dan ${disconnected.length - 2} perangkat lainnya` : "";
      await db.insert(notificationsTable).values({
        userId,
        type: "device_disconnected",
        title: `${disconnected.length} perangkat terputus`,
        message: `Perangkat ${names}${extra} tidak terhubung. Scan ulang QR code untuk menyambungkan kembali.`,
        link: "/devices",
      });
    }
  }
}

// ── GET /notifications ────────────────────────────────────────────────────────

router.get("/notifications", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(res);
  await ensureSystemNotifications(userId).catch(() => {});

  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);

  const [{ unreadCount }] = await db
    .select({ unreadCount: count() })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));

  res.json({ notifications: rows, unreadCount: Number(unreadCount) });
});

// ── PUT /notifications/read-all ───────────────────────────────────────────────

router.put("/notifications/read-all", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(res);
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));
  res.json({ ok: true });
});

// ── PUT /notifications/:id/read ──────────────────────────────────────────────

router.put("/notifications/:id/read", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(res);
  const id = Number(req.params.id);
  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
  res.json({ ok: true });
});

// ── DELETE /notifications/:id ─────────────────────────────────────────────────

router.delete("/notifications/:id", async (req: Request, res: Response): Promise<void> => {
  const userId = uid(res);
  const id = Number(req.params.id);
  await db
    .delete(notificationsTable)
    .where(and(eq(notificationsTable.id, id), eq(notificationsTable.userId, userId)));
  res.json({ ok: true });
});

// ── POST /notifications/system (admin broadcast) ──────────────────────────────

router.post("/notifications/system", async (req: Request, res: Response): Promise<void> => {
  const { userIds, type = "system", title, message, link } = req.body as {
    userIds?: number[]; type?: string; title: string; message: string; link?: string;
  };
  if (!title || !message) { res.status(400).json({ message: "title dan message wajib diisi" }); return; }

  if (userIds && userIds.length > 0) {
    await db.insert(notificationsTable).values(userIds.map((uid) => ({ userId: uid, type, title, message, link })));
    res.json({ ok: true, sent: userIds.length });
  } else {
    const users = await db.select({ id: usersTable.id }).from(usersTable);
    if (users.length > 0) {
      await db.insert(notificationsTable).values(users.map((u) => ({ userId: u.id, type, title, message, link })));
    }
    res.json({ ok: true, sent: users.length });
  }
});

export { router as notificationsRouter };
