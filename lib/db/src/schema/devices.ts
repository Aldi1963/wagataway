import { pgTable, text, serial, timestamp, boolean, integer } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const devicesTable = pgTable("devices", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  name: text("name").notNull(),
  phone: text("phone"),
  // ── Connection Settings ───────────────────────────────────────────────────
  provider: text("provider").notNull().default("baileys"), // 'baileys' | 'official'
  officialPhoneId: text("official_phone_id"),
  officialBusinessAccountId: text("official_business_account_id"),
  officialAccessToken: text("official_access_token"),

  status: text("status").notNull().default("disconnected"),
  battery: integer("battery").default(100),
  lastSeen: timestamp("last_seen", { withTimezone: true }),
  autoReconnect: boolean("auto_reconnect").notNull().default(true),
  messagesSent: integer("messages_sent").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),

  // ── Anti-Banned Settings ────────────────────────────────────────────────────
  antiBannedEnabled: boolean("anti_banned_enabled").notNull().default(true),
  minDelay: integer("min_delay").notNull().default(3),
  maxDelay: integer("max_delay").notNull().default(10),
  typingSimulation: boolean("typing_simulation").notNull().default(true),
  typingDuration: integer("typing_duration").notNull().default(2),
  readSimulation: boolean("read_simulation").notNull().default(false),
  warmupMode: boolean("warmup_mode").notNull().default(false),
  warmupCurrentLimit: integer("warmup_current_limit").notNull().default(20),
  warmupIncrement: integer("warmup_increment").notNull().default(10),
  warmupMaxLimit: integer("warmup_max_limit").notNull().default(200),
  dailyLimit: integer("daily_limit").notNull().default(0),
  warmupLastUpdated: timestamp("warmup_last_updated", { withTimezone: true }),

  // ── Presence & Read Settings ────────────────────────────────────────────────
  autoRead: boolean("auto_read").notNull().default(false),
  autoOnline: boolean("auto_online").notNull().default(false),

  // ── Notification Settings ───────────────────────────────────────────────────
  notifyOnDisconnect: boolean("notify_on_disconnect").notNull().default(true),
  notifyOnConnect: boolean("notify_on_connect").notNull().default(false),

  // ── Rotation Settings ────────────────────────────────────────────────────────
  rotationEnabled: boolean("rotation_enabled").notNull().default(false),
  rotationWeight: integer("rotation_weight").notNull().default(1),
  rotationGroup: text("rotation_group").default("default"),
});

export const insertDeviceSchema = createInsertSchema(devicesTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertDevice = z.infer<typeof insertDeviceSchema>;
export type Device = typeof devicesTable.$inferSelect;
