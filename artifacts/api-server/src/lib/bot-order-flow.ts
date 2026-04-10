import { db, botProductsTable, botOrdersTable, botOrderSessionsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";

// Format currency IDR
function formatRp(amount: string | number): string {
  return `Rp${Number(amount).toLocaleString("id-ID")}`;
}

// Build product catalog text
async function buildCatalog(userId: number, deviceId: number): Promise<string> {
  const products = await db.select().from(botProductsTable).where(
    and(eq(botProductsTable.userId, userId), eq(botProductsTable.deviceId, deviceId), eq(botProductsTable.isActive, true))
  );
  if (!products.length) return "Belum ada produk yang tersedia.";

  const lines = products.map((p, i) => {
    const stock = p.stock !== null ? (Number(p.stock) > 0 ? `(stok: ${p.stock})` : `❌ habis`) : "";
    return `*${i + 1}. ${p.name}* [${p.code}]\n   ${p.description || "Tanpa deskripsi"}\n   💰 ${formatRp(p.price)} ${stock}`;
  });

  return `📦 *Katalog Produk*\n\n${lines.join("\n\n")}\n\n_Ketik kode produk atau nomor urut untuk memesan_`;
}

// Get or create order session
async function getSession(userId: number, deviceId: number, phone: string) {
  const [session] = await db.select().from(botOrderSessionsTable).where(
    and(
      eq(botOrderSessionsTable.userId, userId),
      eq(botOrderSessionsTable.deviceId, deviceId),
      eq(botOrderSessionsTable.customerPhone, phone)
    )
  );
  return session ?? null;
}

async function upsertSession(userId: number, deviceId: number, phone: string, data: Record<string, any>) {
  const existing = await getSession(userId, deviceId, phone);
  if (existing) {
    const [updated] = await db.update(botOrderSessionsTable)
      .set({ ...data, updatedAt: new Date() })
      .where(eq(botOrderSessionsTable.id, existing.id))
      .returning();
    return updated;
  } else {
    const [created] = await db.insert(botOrderSessionsTable).values({
      userId, deviceId, customerPhone: phone,
      step: "idle",
      ...data,
    }).returning();
    return created;
  }
}

async function clearSession(userId: number, deviceId: number, phone: string) {
  await db.delete(botOrderSessionsTable).where(
    and(
      eq(botOrderSessionsTable.userId, userId),
      eq(botOrderSessionsTable.deviceId, deviceId),
      eq(botOrderSessionsTable.customerPhone, phone)
    )
  );
}

// Main order flow handler — returns reply string or null (not an order message)
export async function handleOrderFlow(
  userId: number,
  deviceId: number,
  phone: string,
  msg: string
): Promise<string | null> {
  const lower = msg.trim().toLowerCase();
  const trimmed = msg.trim();

  // Trigger keywords — intentionally specific to avoid capturing common conversation words
  // "pesan" alone is NOT a trigger (it means "message" too), use "mau pesan", "mau order", "mau beli"
  const catalogTriggers = [
    "katalog", "lihat produk", "daftar produk", "menu produk",
    "mau pesan", "mau beli", "mau order", "ingin pesan", "ingin beli", "ingin order",
    "cara pesan", "cara order", "cara beli",
    "order sekarang", "beli sekarang",
  ];
  const cancelTriggers = ["batal", "cancel", "keluar"];

  const session = await getSession(userId, deviceId, phone);

  // ── Session timeout: clear sessions older than 60 minutes ────────────────
  if (session && session.step !== "idle") {
    const updatedAt = new Date(session.updatedAt).getTime();
    const now = Date.now();
    const diffMinutes = (now - updatedAt) / 1000 / 60;
    if (diffMinutes > 60) {
      await clearSession(userId, deviceId, phone);
      // Don't return — treat as fresh idle session
    }
  }

  const freshSession = await getSession(userId, deviceId, phone);
  const step = freshSession?.step ?? "idle";

  // Cancel at any step
  if (cancelTriggers.some((t) => lower.includes(t)) && step !== "idle") {
    await clearSession(userId, deviceId, phone);
    return "❌ Pemesanan dibatalkan. Ketik *katalog* untuk melihat produk kembali.";
  }

  // ── IDLE — check if this is a catalog/order trigger ──────────────────────
  if (step === "idle") {
    if (catalogTriggers.some((t) => lower.includes(t))) {
      await upsertSession(userId, deviceId, phone, { step: "pick_product" });
      const catalog = await buildCatalog(userId, deviceId);
      return catalog + "\n\n_Ketik *batal* kapan saja untuk membatalkan._";
    }
    return null; // not an order message
  }

  // ── PICK PRODUCT ──────────────────────────────────────────────────────────
  if (step === "pick_product") {
    const products = await db.select().from(botProductsTable).where(
      and(eq(botProductsTable.userId, userId), eq(botProductsTable.deviceId, deviceId), eq(botProductsTable.isActive, true))
    );
    if (!products.length) {
      await clearSession(userId, deviceId, phone);
      return "Maaf, belum ada produk tersedia saat ini.";
    }

    let chosen = null;

    // Match by number
    if (/^\d+$/.test(trimmed)) {
      const idx = parseInt(trimmed, 10) - 1;
      if (idx >= 0 && idx < products.length) chosen = products[idx];
    }

    // Match by code
    if (!chosen) {
      chosen = products.find((p) => p.code.toLowerCase() === trimmed.toUpperCase());
    }

    // Match by partial name
    if (!chosen) {
      chosen = products.find((p) => p.name.toLowerCase().includes(lower));
    }

    if (!chosen) {
      return `Produk tidak ditemukan. Ketik nomor urut atau kode produk.\n\n${await buildCatalog(userId, deviceId)}`;
    }

    if (chosen.stock !== null && Number(chosen.stock) <= 0) {
      return `Maaf, *${chosen.name}* sedang habis stok. Pilih produk lain.`;
    }

    await upsertSession(userId, deviceId, phone, {
      step: "pick_qty",
      productId: chosen.id,
      productName: chosen.name,
      productPrice: chosen.price,
    });

    return `✅ Produk: *${chosen.name}*\n💰 Harga: ${formatRp(chosen.price)}\n\nBerapa *jumlah* yang ingin dipesan?`;
  }

  // ── PICK QTY ──────────────────────────────────────────────────────────────
  if (step === "pick_qty") {
    const qty = parseInt(trimmed, 10);
    if (isNaN(qty) || qty <= 0) {
      return "Masukkan jumlah yang valid (angka lebih dari 0).";
    }

    // Check stock
    if (freshSession?.productId) {
      const [product] = await db.select().from(botProductsTable).where(eq(botProductsTable.id, freshSession.productId));
      if (product?.stock !== null && qty > Number(product?.stock)) {
        return `Stok tidak cukup. Tersisa *${product?.stock}* unit. Masukkan jumlah yang lebih kecil.`;
      }
    }

    await upsertSession(userId, deviceId, phone, { step: "ask_name", qty });
    const total = formatRp(Number(freshSession?.productPrice ?? 0) * qty);
    return `📦 *${freshSession?.productName}* × ${qty} = *${total}*\n\nSilakan masukkan *nama lengkap* Anda:`;
  }

  // ── ASK NAME ──────────────────────────────────────────────────────────────
  if (step === "ask_name") {
    if (trimmed.length < 2) return "Nama terlalu pendek. Masukkan nama lengkap Anda.";
    await upsertSession(userId, deviceId, phone, { step: "ask_address", customerName: trimmed });
    return `Halo *${trimmed}*! 👋\n\nSekarang masukkan *alamat pengiriman* Anda:`;
  }

  // ── ASK ADDRESS ──────────────────────────────────────────────────────────
  if (step === "ask_address") {
    if (trimmed.length < 5) return "Alamat terlalu pendek. Masukkan alamat lengkap.";
    await upsertSession(userId, deviceId, phone, { step: "confirm", customerAddress: trimmed });

    const s = await getSession(userId, deviceId, phone);
    const total = formatRp(Number(s?.productPrice ?? 0) * (s?.qty ?? 1));

    return (
      `📋 *Konfirmasi Pesanan*\n\n` +
      `🛍️ Produk: ${s?.productName}\n` +
      `📦 Jumlah: ${s?.qty}\n` +
      `💰 Total: *${total}*\n` +
      `👤 Nama: ${s?.customerName}\n` +
      `📍 Alamat: ${trimmed}\n\n` +
      `Balas *YA* untuk konfirmasi atau *BATAL* untuk membatalkan.`
    );
  }

  // ── CONFIRM ───────────────────────────────────────────────────────────────
  if (step === "confirm") {
    if (!["ya", "yes", "ok", "oke", "konfirmasi", "setuju", "lanjut"].includes(lower)) {
      return `Balas *YA* untuk konfirmasi pesanan, atau *BATAL* untuk membatalkan.`;
    }

    const s = await getSession(userId, deviceId, phone);
    if (!s || !s.productId) {
      await clearSession(userId, deviceId, phone);
      return "Sesi pesanan tidak ditemukan. Silakan mulai ulang dengan ketik *katalog*.";
    }

    const qty = s.qty ?? 1;
    const total = Number(s.productPrice ?? 0) * qty;

    // Save order
    const [order] = await db.insert(botOrdersTable).values({
      userId,
      deviceId,
      productId: s.productId,
      productName: s.productName ?? "",
      productPrice: String(s.productPrice ?? 0),
      qty,
      totalPrice: String(total),
      customerPhone: phone,
      customerName: s.customerName ?? "",
      customerAddress: s.customerAddress ?? "",
      status: "pending",
    }).returning();

    // Reduce stock if set
    const [product] = await db.select().from(botProductsTable).where(eq(botProductsTable.id, s.productId));
    if (product?.stock !== null) {
      await db.update(botProductsTable)
        .set({ stock: Math.max(0, Number(product.stock) - qty) })
        .where(eq(botProductsTable.id, s.productId));
    }

    await clearSession(userId, deviceId, phone);

    return (
      `✅ *Pesanan #${order.id} Berhasil Dibuat!*\n\n` +
      `🛍️ ${order.productName} × ${qty}\n` +
      `💰 Total: *${formatRp(total)}*\n\n` +
      `Tim kami akan segera menghubungi Anda untuk konfirmasi pembayaran dan pengiriman. Terima kasih! 🙏`
    );
  }

  return null;
}
