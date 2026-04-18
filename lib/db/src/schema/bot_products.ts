import { pgTable, text, serial, timestamp, boolean, integer, numeric } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";

export const botCategoriesTable = pgTable("bot_categories", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  name: text("name").notNull(),
  description: text("description").default(""),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const botProductsTable = pgTable("bot_products", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  categoryId: integer("category_id"),
  name: text("name").notNull(),
  description: text("description").default(""),
  price: numeric("price", { precision: 12, scale: 0 }).notNull().default("0"),
  stock: integer("stock"),
  minStock: integer("min_stock").default(0),
  variants: text("variants"), // JSON string: [{name: 'Warna', options: ['Merah', 'Biru']}, {name: 'Ukuran', options: ['S', 'M']}]
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
  shippingFee: numeric("shipping_fee", { precision: 14, scale: 0 }).default("0"),
  proofImageUrl: text("proof_image_url"),
  variantOptions: text("variant_options"), // Selected variants e.g. "Merah, XL"
  customerPhone: text("customer_phone").notNull(),
  customerName: text("customer_name").default(""),
  customerAddress: text("customer_address").default(""),
  notes: text("notes").default(""),
  status: text("status").notNull().default("pending"), // pending, confirmed, processing, shipped, done, cancelled
  paymentStatus: text("payment_status").default("unpaid"), // unpaid, paid
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const botPaymentMethodsTable = pgTable("bot_payment_methods", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  provider: text("provider").notNull(), // BCA, Mandiri, QRIS, etc
  accountName: text("account_name").notNull(),
  accountNumber: text("account_number").notNull(),
  instructions: text("instructions"),
  imageUrl: text("image_url"), // For QRIS
  isActive: boolean("is_active").default(true),
});

export const botOwnerSettingsTable = pgTable("bot_owner_settings", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  ownerPhone: text("owner_phone"),
  stockAlertEnabled: boolean("stock_alert_enabled").default(true),
  paymentInstructionEnabled: boolean("payment_instruction_enabled").default(true),
  defaultShippingFee: text("default_shipping_fee").default("0"),
  shippingInstructions: text("shipping_instructions"),
  shippingCalcType: text("shipping_calc_type").default("flat"), // flat, rajaongkir
  rajaongkirApiKey: text("rajaongkir_api_key"),
  rajaongkirOriginId: text("rajaongkir_origin_id"),
  rajaongkirAccountType: text("rajaongkir_account_type").default("starter"), // starter, basic, pro
});

export const botOrderSessionsTable = pgTable("bot_order_sessions", {
  id: serial("id").primaryKey(),
  userId: integer("user_id").notNull(),
  deviceId: integer("device_id").notNull(),
  customerPhone: text("customer_phone").notNull(),
  step: text("step").notNull().default("idle"), // idle, selecting_product, selecting_variant, input_qty, input_name, input_address, confirm
  productId: integer("product_id"),
  productName: text("product_name").default(""),
  productPrice: numeric("product_price", { precision: 12, scale: 0 }),
  variantOptions: text("variant_options"),
  qty: integer("qty"),
  customerName: text("customer_name").default(""),
  customerAddress: text("customer_address").default(""),
  shippingCourier: text("shipping_courier"),
  shippingService: text("shipping_service"),
  shippingFee: numeric("shipping_fee", { precision: 14, scale: 0 }),
  cityId: text("city_id"), // Dest city ID for RajaOngkir
  weight: integer("weight").default(1000), // Default 1kg
  orderId: integer("order_id"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow().$onUpdate(() => new Date()),
});

export const insertBotCategorySchema = createInsertSchema(botCategoriesTable).omit({ id: true, createdAt: true });
export const insertBotProductSchema = createInsertSchema(botProductsTable).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertBotCategory = z.infer<typeof insertBotCategorySchema>;
export type InsertBotProduct = z.infer<typeof insertBotProductSchema>;
export type BotCategory = typeof botCategoriesTable.$inferSelect;
export type BotProduct = typeof botProductsTable.$inferSelect;
export type BotOrder = typeof botOrdersTable.$inferSelect;
export type BotOrderSession = typeof botOrderSessionsTable.$inferSelect;
