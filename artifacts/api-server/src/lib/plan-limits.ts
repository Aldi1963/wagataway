import { db, subscriptionsTable, plansTable, devicesTable, messagesTable, contactsTable } from "@workspace/db";
import { eq, and, gte, count } from "drizzle-orm";

export interface PlanLimits {
  planId: string;
  planName: string;
  limitDevices: number;
  limitMessagesPerDay: number;
  limitContacts: number;
  limitApiCallsPerDay: number;
  limitBulkRecipients: number;
  limitScheduledMessages: number;
  limitAutoReplies: number;
}

export async function getUserPlan(userId: number): Promise<PlanLimits> {
  const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId));
  const planId = sub?.planId ?? "free";
  const [plan] = await db.select().from(plansTable).where(eq(plansTable.slug, planId));
  return {
    planId,
    planName: plan?.name ?? planId,
    limitDevices: plan?.limitDevices ?? 1,
    limitMessagesPerDay: plan?.limitMessagesPerDay ?? 100,
    limitContacts: plan?.limitContacts ?? 100,
    limitApiCallsPerDay: plan?.limitApiCallsPerDay ?? 1000,
    limitBulkRecipients: plan?.limitBulkRecipients ?? 100,
    limitScheduledMessages: plan?.limitScheduledMessages ?? 10,
    limitAutoReplies: plan?.limitAutoReplies ?? 5,
  };
}

export async function countUserDevices(userId: number): Promise<number> {
  const [{ cnt }] = await db.select({ cnt: count() }).from(devicesTable).where(eq(devicesTable.userId, userId));
  return Number(cnt);
}

export async function countTodayMessages(userId: number): Promise<number> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const [{ cnt }] = await db.select({ cnt: count() })
    .from(messagesTable)
    .where(and(eq(messagesTable.userId, userId), gte(messagesTable.createdAt, today)));
  return Number(cnt);
}

export async function countUserContacts(userId: number): Promise<number> {
  const [{ cnt }] = await db.select({ cnt: count() }).from(contactsTable).where(eq(contactsTable.userId, userId));
  return Number(cnt);
}

export function limitError(current: number, limit: number, label: string) {
  if (limit === -1) return null;
  if (current >= limit) {
    return {
      message: `Batas ${label} tercapai (${current}/${limit}). Upgrade paket untuk menambah lebih banyak.`,
      code: "LIMIT_EXCEEDED",
      current,
      limit,
      upgradeUrl: "/billing",
    };
  }
  return null;
}
