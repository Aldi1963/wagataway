import { pgTable, text, serial, timestamp, boolean, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botProductsTable = pgTable("bot_products", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  name: text("name").notNull(),
  description: text("description").default(""),
  price: numeric("price", { precision: 12, scale: 0 }).notNull().default("0"),
  stock: integer("stock"),
  imageUrl: text("image_url").default(""),
  code: text("code").notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const botOrdersTable = pgTable("bot_orders", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  productId: integer("product_id").notNull(),
  productName: text("product_name").notNull(),
  productPrice: numeric("product_price", { precision: 12, scale: 0 }).notNull(),
  qty: integer("qty").notNull().default(1),
  totalPrice: numeric("total_price", { precision: 14, scale: 0 }).notNull(),
  customerPhone: text("customer_phone").notNull(),
  customerName: text("customer_name").default(""),
  customerAddress: text("customer_address").default(""),
  notes: text("notes").default(""),
  status: text("status").notNull().default("pending"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const botOrderSessionsTable = pgTable("bot_order_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  customerPhone: text("customer_phone").notNull(),
  step: text("step").notNull().default("idle"),
  productId: integer("product_id"),
  productName: text("product_name").default(""),
  productPrice: numeric("product_price", { precision: 12, scale: 0 }),
  qty: integer("qty"),
  customerName: text("customer_name").default(""),
  customerAddress: text("customer_address").default(""),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBotProductSchema = createInsertSchema(botProductsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBotProduct = z.infer<typeof insertBotProductSchema>;
export type BotProduct = typeof botProductsTable.$inferSelect;
export type BotOrder = typeof botOrdersTable.$inferSelect;
export type BotOrderSession = typeof botOrderSessionsTable.$inferSelect;
