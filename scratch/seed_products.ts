
import { db, usersTable, devicesTable, botProductsTable, botCategoriesTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function seed() {
  console.log("Seeding temporary products...");

  const [user] = await db.select().from(usersTable).limit(1);
  if (!user) {
    console.error("No user found to seed products for.");
    return;
  }

  const [device] = await db.select().from(devicesTable).where(eq(devicesTable.userId, user.id)).limit(1);
  if (!device) {
    console.error(`No device found for user ${user.id}.`);
    return;
  }

  console.log(`Using UserID: ${user.id}, DeviceID: ${device.id}`);

  // Create Category
  const [category] = await db.insert(botCategoriesTable).values({
    userId: user.id,
    deviceId: device.id,
    name: "Makanan & Minuman",
    description: "Koleksi menu lezat kami."
  }).returning();

  console.log(`Created Category: ${category.name}`);

  // Create Products
  const products = [
    {
      userId: user.id,
      deviceId: device.id,
      categoryId: category.id,
      name: "Kopi Susu Gula Aren",
      description: "Kopi robusta dengan susu segar dan gula aren asli.",
      price: "15000",
      stock: 100,
      code: "KOPI-01",
      imageUrl: "https://images.unsplash.com/photo-1541167760496-162955ed219b?w=400"
    },
    {
      userId: user.id,
      deviceId: device.id,
      categoryId: category.id,
      name: "Roti Bakar Cokelat",
      description: "Roti panggang dengan topping cokelat lumer.",
      price: "12000",
      stock: 50,
      code: "ROTI-01",
      imageUrl: "https://images.unsplash.com/photo-1484723091739-30a097e8f929?w=400"
    },
    {
      userId: user.id,
      deviceId: device.id,
      categoryId: category.id,
      name: "Es Teh Manis",
      description: "Segarnya teh melati dingin.",
      price: "5000",
      stock: 200,
      code: "TEH-01",
      imageUrl: "https://images.unsplash.com/photo-1556679343-c7306c1976bc?w=400"
    }
  ];

  for (const p of products) {
    await db.insert(botProductsTable).values(p);
    console.log(`Inserted Product: ${p.name}`);
  }

  console.log("Seeding completed successfully!");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seed error:", err);
  process.exit(1);
});
