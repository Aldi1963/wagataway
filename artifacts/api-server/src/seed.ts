import { db, usersTable, devicesTable, messagesTable, contactsTable, autoRepliesTable, apiKeysTable, subscriptionsTable, scheduledMessagesTable, webhooksTable, pluginsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import crypto from "crypto";

function hashPassword(password: string): string {
  return crypto.createHash("sha256").update(password + "salt_wa_gateway").digest("hex");
}

export async function seedDatabase() {
  try {
    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, "admin@example.com"));
    if (existing) return;

    const periodEnd = new Date();
    periodEnd.setMonth(periodEnd.getMonth() + 1);

    const [user] = await db.insert(usersTable).values({
      name: "Admin Demo",
      email: "admin@example.com",
      password: hashPassword("password123"),
      plan: "pro",
      role: "admin",
    }).returning();

    await db.insert(subscriptionsTable).values({
      userId: user.id,
      planId: "pro",
      planName: "Professional",
      status: "active",
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: false,
    });

    const lastSeen = new Date();

    const [device1] = await db.insert(devicesTable).values({
      userId: user.id,
      name: "WhatsApp Bisnis",
      phone: "628111000001",
      status: "connected",
      battery: 85,
      lastSeen,
      autoReconnect: true,
      messagesSent: 1234,
    }).returning();

    const [device2] = await db.insert(devicesTable).values({
      userId: user.id,
      name: "WhatsApp Marketing",
      phone: "628111000002",
      status: "disconnected",
      battery: 45,
      lastSeen,
      autoReconnect: true,
      messagesSent: 567,
    }).returning();

    const now = new Date();
    await db.insert(messagesTable).values([
      { userId: user.id, deviceId: device1.id, phone: "628123456789", message: "Halo, selamat datang!", status: "sent", createdAt: new Date(now.getTime() - 300000) },
      { userId: user.id, deviceId: device1.id, phone: "628987654321", message: "Pesanan Anda sudah diproses", status: "sent", createdAt: new Date(now.getTime() - 900000) },
      { userId: user.id, deviceId: device1.id, phone: "628111222333", message: "Terima kasih sudah berbelanja!", status: "failed", createdAt: new Date(now.getTime() - 1800000) },
      { userId: user.id, deviceId: device2.id, phone: "628555666777", message: "Promo spesial hari ini!", status: "sent", createdAt: new Date(now.getTime() - 3600000) },
      { userId: user.id, deviceId: device1.id, phone: "628444555666", message: "Pengiriman sedang dalam proses", status: "pending", createdAt: new Date(now.getTime() - 5400000) },
    ]);

    await db.insert(contactsTable).values([
      { userId: user.id, name: "Budi Santoso", phone: "628123456789", email: "budi@example.com", tags: ["pelanggan", "vip"] },
      { userId: user.id, name: "Siti Rahayu", phone: "628987654321", email: "siti@example.com", tags: ["pelanggan"] },
      { userId: user.id, name: "Ahmad Fauzi", phone: "628111222333", tags: ["prospect"] },
      { userId: user.id, name: "Dewi Lestari", phone: "628555666777", email: "dewi@example.com", tags: ["pelanggan", "reseller"] },
      { userId: user.id, name: "Rini Wulandari", phone: "628444555666" },
    ]);

    await db.insert(autoRepliesTable).values([
      { userId: user.id, keyword: "halo", matchType: "contains", reply: "Halo! Selamat datang di layanan kami. Ada yang bisa kami bantu?", isActive: true },
      { userId: user.id, keyword: "order", matchType: "contains", reply: "Untuk melakukan pemesanan, silakan hubungi kami di jam kerja 08.00-17.00 WIB.", isActive: true },
      { userId: user.id, keyword: "harga", matchType: "contains", reply: "Untuk informasi harga, silakan kunjungi website kami atau hubungi CS kami.", isActive: false },
    ]);

    const key1 = `wag_prod_${crypto.randomBytes(20).toString("hex")}`;
    const key2 = `wag_test_${crypto.randomBytes(20).toString("hex")}`;

    await db.insert(apiKeysTable).values([
      { userId: user.id, name: "Production Key", key: key1, prefix: key1.slice(0, 8) },
      { userId: user.id, name: "Testing Key", key: key2, prefix: key2.slice(0, 8) },
    ]);

    const future1 = new Date(now.getTime() + 3600000);
    const future2 = new Date(now.getTime() + 86400000);
    await db.insert(scheduledMessagesTable).values([
      { userId: user.id, deviceId: device1.id, phone: "628123456789", message: "Halo! Pengingat jadwal servis kendaraan Anda besok jam 09.00.", messageType: "text", scheduledAt: future1, status: "pending", repeat: "none" },
      { userId: user.id, deviceId: device1.id, phone: "628987654321", message: "Promo akhir pekan! Diskon 20% untuk semua produk.", messageType: "text", scheduledAt: future2, status: "pending", repeat: "weekly" },
      { userId: user.id, deviceId: device2.id, phone: "628555666777", message: "Terima kasih sudah menjadi pelanggan setia kami!", messageType: "text", scheduledAt: new Date(now.getTime() - 3600000), status: "sent", repeat: "none", sentAt: now },
    ]);

    await db.insert(webhooksTable).values([
      { userId: user.id, deviceId: device1.id, name: "Notifikasi CRM", url: "https://hooks.example.com/crm", events: ["message.received", "message.sent"], secret: crypto.randomBytes(16).toString("hex"), isActive: true, triggerCount: 128 },
      { userId: user.id, name: "Order System", url: "https://hooks.example.com/orders", events: ["message.received"], secret: crypto.randomBytes(16).toString("hex"), isActive: false, triggerCount: 45 },
    ]);

    await db.insert(pluginsTable).values([
      { userId: user.id, type: "openai", name: "OpenAI ChatGPT", config: { apiKey: "sk-demo••••••••", model: "gpt-4o-mini", systemPrompt: "You are a helpful WhatsApp assistant.", maxTokens: 500, triggerKeywords: ["ai", "help", "bot"] }, isActive: true },
    ]);

    console.log("✅ Seed data created successfully");
  } catch (error) {
    console.error("Seed error:", error);
  }
}
