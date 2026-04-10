import { pgTable, serial, integer, timestamp } from "drizzle-orm/pg-core";

export const resellerSubUsersTable = pgTable("reseller_sub_users", {
  id: serial("id").primaryKey(),
  resellerId: integer("reseller_id").notNull(),
  subUserId: integer("sub_user_id").notNull().unique(),
  allocatedDevices: integer("allocated_devices").notNull().default(2),
  allocatedMessagesPerDay: integer("allocated_messages_per_day").notNull().default(1000),
  allocatedContacts: integer("allocated_contacts").notNull().default(5000),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type ResellerSubUser = typeof resellerSubUsersTable.$inferSelect;
