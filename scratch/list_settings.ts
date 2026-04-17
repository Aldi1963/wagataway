import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function checkRajaOngkir() {
  console.log("Checking RajaOngkir Settings...");
  const [rajaKey] = await db.select().from(settingsTable).where(eq(settingsTable.key, "rajaongkir_api_key"));
  const [rajaType] = await db.select().from(settingsTable).where(eq(settingsTable.key, "rajaongkir_account_type"));
  
  console.log("-----------------------------------");
  console.log("API Key:", rajaKey?.value ? (rajaKey.value.slice(0, 5) + "...") : "NOT SET");
  console.log("Account Type:", rajaType?.value || "NOT SET");
  console.log("-----------------------------------");
  
  if (!rajaKey?.value) {
    console.error("Error: RajaOngkir API Key is missing!");
    process.exit(1);
  }
}

checkRajaOngkir().catch(console.error);
