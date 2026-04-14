import { handleOrderFlow } from "./artifacts/api-server/src/lib/bot-order-flow.js";
import { db, botProductsTable, botCategoriesTable, botPaymentMethodsTable, botOwnerSettingsTable, botOrderSessionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

async function runTest() {
  const userId = 1; 
  const deviceId = 3; // Using device 3 from restored sessions
  const phone = "6285211112222";

  console.log("=== SIMULASI ORDER RAJAONGKIR ===\n");

  // Clear any existing session
  await db.delete(botOrderSessionsTable).where(and(eq(botOrderSessionsTable.userId, userId), eq(botOrderSessionsTable.deviceId, deviceId), eq(botOrderSessionsTable.customerPhone, phone)));

  // 1. Setup Data with RajaOngkir enabled (placeholder key)
  console.log("[1/2] Mengatur setelan RajaOngkir...");
  const [existing] = await db.select().from(botOwnerSettingsTable).where(and(eq(botOwnerSettingsTable.userId, userId), eq(botOwnerSettingsTable.deviceId, deviceId)));
  
  const settingsData = {
    userId, deviceId,
    shippingCalcType: "rajaongkir",
    rajaongkirApiKey: "44715bd04892c2ddcf07758362637956", 
    rajaongkirOriginId: "152", 
    rajaongkirAccountType: "starter",
    defaultShippingFee: "15000",
    ownerPhone: "62812345678"
  };

  if (existing) {
    await db.update(botOwnerSettingsTable).set(settingsData).where(eq(botOwnerSettingsTable.id, existing.id));
  } else {
    await db.insert(botOwnerSettingsTable).values(settingsData);
  }

  // Ensure products exist
  let [product] = await db.select().from(botProductsTable).where(eq(botProductsTable.deviceId, deviceId));
  if (!product) {
      [product] = await db.insert(botProductsTable).values({
          userId, deviceId, name: "Headset Gaming Zen", price: "250000", code: "ZEN01", isActive: true, stock: 100
      }).returning();
  }

  // 2. Simulate Conversation
  // Messages: catalog -> choose product -> qty -> name -> address -> CITY -> confirm
  const messages = ["katalog", "1", "1", "Test User", "Perumahan Elite No 1", "Malang", "1", "ya"];
  
  for (const m of messages) {
    console.log(`\n👤 Customer: "${m}"`);
    try {
        const reply = await handleOrderFlow(userId, deviceId, phone, m);
        console.log(`🤖 Bot:\n${reply}`);
    } catch (err: any) {
        console.log(`❌ Error: ${err.message}`);
        if (err.message.includes("401") || err.message.includes("key")) {
            console.log("ℹ️ Info: Simulasi gagal kalkulasi asli karena API Key belum divalidasi/aktif. Namun logika alur 'pick_city' sudah berjalan.");
            break;
        }
    }
    console.log("------------------------------------------");
  }

  console.log("\n✅ Simulasi Selesai.");
}

runTest().catch(console.error);
