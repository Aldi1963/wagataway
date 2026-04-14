import { handleOrderFlow } from "./artifacts/api-server/src/lib/bot-order-flow.js";
import { db, botProductsTable, botCategoriesTable, botPaymentMethodsTable, botOwnerSettingsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

async function runTest() {
  const userId = 1; // Assuming default user
  const deviceId = 1; // Assuming first device
  const phone = "6285200000000";

  console.log("=== SIMULASI ORDER BOT ===\n");

  // 1. Setup Data if empty
  console.log("[1/3] Menyiapkan data produk & pembayaran...");
  let [category] = await db.select().from(botCategoriesTable).limit(1);
  if (!category) {
    [category] = await db.insert(botCategoriesTable).values({
      userId, deviceId, name: "Fashion", description: "Baju dan aksesoris"
    }).returning();
  }

  let [product] = await db.select().from(botProductsTable).where(eq(botProductsTable.code, "TSHIRT01"));
  if (!product) {
    [product] = await db.insert(botProductsTable).values({
      userId, deviceId, categoryId: category.id,
      name: "Kaos Polos Premium", code: "TSHIRT01",
      price: "150000", stock: 10, minStock: 2,
      variants: JSON.stringify([{ name: "Ukuran", options: "M, L, XL" }]),
      isActive: true
    }).returning();
  }

  let [pm] = await db.select().from(botPaymentMethodsTable).limit(1);
  if (!pm) {
    await db.insert(botPaymentMethodsTable).values({
      userId, deviceId, provider: "Bank BCA", accountName: "PT Gateway Pro", accountNumber: "1234567890", isActive: true
    });
  }

  await db.insert(botOwnerSettingsTable).values({
      userId, deviceId, ownerPhone: "62812345678", stockAlertEnabled: true, paymentInstructionEnabled: true
  }).onConflictDoNothing();

  // 2. Simulate Conversation
  const messages = ["katalog", "1", "1", "2", "Budi Santoso", "Jl. Sudirman No. 10, Jakarta", "ya"];
  
  for (const m of messages) {
    console.log(`\n👤 Customer: "${m}"`);
    const reply = await handleOrderFlow(userId, deviceId, phone, m);
    console.log(`🤖 Bot:\n${reply}`);
    console.log("------------------------------------------");
  }

  console.log("\n✅ Simulasi Selesai. Silakan cek tab 'Pesanan' di dashboard untuk melihat pesanan Budi.");
}

runTest().catch(console.error);
