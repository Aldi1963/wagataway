import { db, botProductsTable, botOrdersTable, botOrderSessionsTable, botCategoriesTable, botPaymentMethodsTable, botOwnerSettingsTable, plansTable, subscriptionsTable } from "@workspace/db";
import { eq, and, sql } from "drizzle-orm";
import { RajaOngkirService } from "./rajaongkir";

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

  const categories = await db.select().from(botCategoriesTable).where(
    and(eq(botCategoriesTable.userId, userId), eq(botCategoriesTable.deviceId, deviceId))
  );

  const catMap = new Map(categories.map(c => [c.id, c.name]));

  // Group products by category
  const grouped: Record<string, typeof products> = { "Lainnya": [] };
  products.forEach(p => {
    const catName = p.categoryId ? (catMap.get(p.categoryId) ?? "Lainnya") : "Lainnya";
    if (!grouped[catName]) grouped[catName] = [];
    grouped[catName]!.push(p);
  });

  let catalogText = `✨ *OFFICIAL CATALOG* ✨\n`;
  catalogText += `───────────────────\n\n`;
  let globalIndex = 1;

  for (const [catName, prodList] of Object.entries(grouped)) {
    if (prodList.length === 0) continue;
    catalogText += `🔱 *${catName.toUpperCase()}*\n`;
    prodList.forEach(p => {
       const stock = p.stock !== null ? (Number(p.stock) > 0 ? `(Stok: ${p.stock})` : ` *HABIS*`) : "";
       catalogText += `${globalIndex++}. *${p.name}* [${p.code}]\n   💰 ${formatRp(p.price)} ${stock}\n\n`;
    });
  }

  catalogText += `───────────────────\n`;
  return catalogText + `💡 _Ketik Nama, Kode, atau Nomor untuk memesan._`;
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

  const catalogTriggers = [
    "katalog", "lihat produk", "daftar produk", "menu produk",
    "mau pesan", "mau beli", "mau order", "ingin pesan", "ingin beli", "ingin order",
    "cara pesan", "cara order", "cara beli",
    "order sekarang", "beli sekarang",
  ];
  const cancelTriggers = ["batal", "cancel", "keluar"];
  const trackTriggers = ["cek pesanan", "status pesanan", "cek order", "lacak pesanan"];

  const session = await getSession(userId, deviceId, phone);

  if (session && session.step !== "idle") {
    const updatedAt = new Date(session.updatedAt).getTime();
    if ((Date.now() - updatedAt) / 1000 / 60 > 60) {
      await clearSession(userId, deviceId, phone);
    }
  }

  const freshSession = await getSession(userId, deviceId, phone);
  const step = freshSession?.step ?? "idle";

  if (cancelTriggers.some((t) => lower.includes(t)) && step !== "idle") {
    await clearSession(userId, deviceId, phone);
    return "❌ Pemesanan dibatalkan. Ketik *katalog* untuk melihat produk kembali.";
  }

  // --- ORDER TRACKING ---
  if (trackTriggers.some(t => lower.startsWith(t)) || (step === "idle" && lower.startsWith("status"))) {
     const parts = lower.split(' ');
     const orderId = parts.length > 1 ? parts[parts.length - 1].replace('#', '') : null;
     
     if (orderId && /^\d+$/.test(orderId)) {
        const [order] = await db.select().from(botOrdersTable).where(and(eq(botOrdersTable.id, parseInt(orderId, 10)), eq(botOrdersTable.userId, userId)));
        if (!order) return `Maaf, pesanan dengan ID #${orderId} tidak ditemukan.`;
        
        const statusMap:any = { pending: "⏱️ Menunggu", confirmed: "✅ Dikonfirmasi", processing: "⚙️ Diproses", shipped: "🚚 Dikirim", done: "🏁 Selesai", cancelled: "❌ Dibatalkan" };
        return (
          `📋 *STATUS PESANAN #${order.id}*\n` +
          `───────────────────\n\n` +
          `🛍️ *Produk*: ${order.productName}\n` +
          `📦 *Status*: ${statusMap[order.status] || order.status}\n` +
          `💳 *Pembayaran*: ${order.paymentStatus === 'paid' ? '✅ Lunas' : '⚠️ Belum Bayar'}\n` +
          `📍 *Alamat*: ${order.customerAddress}\n\n` +
          `───────────────────\n` +
          `_Terima kasih telah mempercayai kami!_`
        );
     }
     return "Untuk cek pesanan, ketik: *cek pesanan [ID_ORDER]*\nContoh: _cek pesanan 123_";
  }

  if (step === "idle") {
    if (catalogTriggers.some((t) => lower.includes(t))) {
      // ── FEATURE GATING CHECK ──────────────────────────────────────────────
      const [sub] = await db.select().from(subscriptionsTable).where(eq(subscriptionsTable.userId, userId));
      const [plan] = await db.select().from(plansTable).where(eq(plansTable.slug, sub?.planId || "free"));
      
      if (!plan || !plan.commerceEnabled) {
         return "⚠️ *Fitur Commerce Premium*\n\nMaaf, sistem pemesanan otomatis dan cek ongkir hanya tersedia untuk pengguna *Enterprise*.\n\nSilakan upgrade paket Anda di dashboard billing untuk mengaktifkan fitur ini! 🚀";
      }

      await upsertSession(userId, deviceId, phone, { step: "pick_product" });
      const catalog = await buildCatalog(userId, deviceId);
      return catalog + "\n\n_Ketik *batal* kapan saja untuk membatalkan._";
    }
    return null;
  }

  if (step === "pick_product") {
    const products = await db.select().from(botProductsTable).where(
      and(eq(botProductsTable.userId, userId), eq(botProductsTable.deviceId, deviceId), eq(botProductsTable.isActive, true))
    );
    if (!products.length) {
      await clearSession(userId, deviceId, phone);
      return "Maaf, belum ada produk tersedia saat ini.";
    }

    let chosen = null;
    if (/^\d+$/.test(trimmed)) {
      const idx = parseInt(trimmed, 10) - 1;
      if (idx >= 0 && idx < products.length) chosen = products[idx];
    }
    if (!chosen) {
      chosen = products.find((p) => p.code.toLowerCase() === trimmed.toLowerCase());
    }
    if (!chosen) {
      chosen = products.find((p) => p.name.toLowerCase().includes(lower));
    }

    if (!chosen) {
      return `Produk tidak ditemukan. Ketik nomor urut atau kode produk.\n\n${await buildCatalog(userId, deviceId)}`;
    }

    if (chosen.stock !== null && Number(chosen.stock) <= 0) {
      return `Maaf, *${chosen.name}* sedang habis stok. Pilih produk lain.`;
    }

    const nextStep = chosen.variants ? "pick_variant" : "pick_qty";
    const variantsList = chosen.variants ? JSON.parse(chosen.variants) : [];
    
    await upsertSession(userId, deviceId, phone, {
      step: nextStep,
      productId: chosen.id,
      productName: chosen.name,
      productPrice: chosen.price,
      variantOptions: chosen.variants, 
    });

    if (nextStep === "pick_variant") {
       const v = variantsList[0];
       return `✅ Produk: *${chosen.name}*\n\nSilakan pilih *${v.name}*:\n` + v.options.split(',').map((o:string, i:number) => `${i+1}. ${o.trim()}`).join('\n');
    }

    return `✅ Produk: *${chosen.name}*\n💰 Harga: ${formatRp(chosen.price)}\n\nBerapa *jumlah* yang ingin dipesan?`;
  }

  if (step === "pick_variant") {
     const variants = JSON.parse(freshSession?.variantOptions ?? '[]');
     const v = variants[0];
     const options = v.options.split(',').map((o:string) => o.trim());
     let picked = null;

     if (/^\d+$/.test(trimmed)) {
        const idx = parseInt(trimmed, 10) - 1;
        if (idx >= 0 && idx < options.length) picked = options[idx];
     } else {
        picked = options.find((o:string) => o.toLowerCase() === lower);
     }

     if (!picked) {
        return `Pilihan tidak valid. Silakan pilih *${v.name}*:\n` + options.map((o:string, i:number) => `${i+1}. ${o}`).join('\n');
     }

     await upsertSession(userId, deviceId, phone, { step: "pick_qty", variantOptions: picked });
     return `Sip! *${picked}* terpilih.\n\nBerapa *jumlah* yang ingin dipesan?`;
  }

  if (step === "pick_qty") {
    const qty = parseInt(trimmed, 10);
    if (isNaN(qty) || qty <= 0) return "Masukkan jumlah yang valid (angka).";

    if (freshSession?.productId) {
      const [product] = await db.select().from(botProductsTable).where(eq(botProductsTable.id, freshSession.productId));
      if (product?.stock !== null && qty > Number(product?.stock)) {
        return `Stok tidak cukup. Tersisa *${product?.stock}* unit.`;
      }
    }

    await upsertSession(userId, deviceId, phone, { step: "ask_name", qty });
    const total = formatRp(Number(freshSession?.productPrice ?? 0) * qty);
    return `📦 *${freshSession?.productName}*${freshSession?.variantOptions ? ` (${freshSession.variantOptions})` : ''} × ${qty} = *${total}*\n\nMasukkan *nama lengkap* Anda:`;
  }

  if (step === "ask_name") {
    if (trimmed.length < 2) return "Masukkan nama lengkap Anda.";
    await upsertSession(userId, deviceId, phone, { step: "ask_address", customerName: trimmed });
    return `Halo *${trimmed}*! Masukkan *alamat pengiriman* lengkap:`;
  }

  if (step === "ask_address") {
    if (trimmed.length < 5) return "Masukkan alamat lengkap.";
    
    const [settings] = await db.select().from(botOwnerSettingsTable).where(and(eq(botOwnerSettingsTable.userId, userId), eq(botOwnerSettingsTable.deviceId, deviceId)));
    
    if (settings?.shippingCalcType === 'rajaongkir' && settings.rajaongkirApiKey) {
      await upsertSession(userId, deviceId, phone, { step: "pick_city", customerAddress: trimmed });
      return `Bisa info di *kota/kabupaten* mana Anda berada? agar saya bisa hitung ongkir otomatis.`;
    }

    const shippingFee = Number(settings?.defaultShippingFee ?? 0);
    await upsertSession(userId, deviceId, phone, { step: "confirm", customerAddress: trimmed, shippingFee });

    const s = await getSession(userId, deviceId, phone);
    const subtotal = Number(s?.productPrice ?? 0) * (s?.qty ?? 1);
    const total = subtotal + shippingFee;

    return (
      `📋 *KONFIRMASI PESANAN*\n\n` +
      `🛍️ Produk: ${s?.productName}${s?.variantOptions ? ` (${s.variantOptions})` : ''}\n` +
      `📦 Qty: ${s?.qty}\n` +
      `💰 Subtotal: ${formatRp(subtotal)}\n` +
      `🚚 Ongkir: ${formatRp(shippingFee)}\n` +
      `✨ *Total Bayar: ${formatRp(total)}*\n\n` +
      `👤 Nama: ${s?.customerName}\n` +
      `📍 Alamat: ${trimmed}\n\n` +
      `Balas *YA* untuk konfirmasi.`
    );
  }

  if (step === "pick_city") {
    const [settings] = await db.select().from(botOwnerSettingsTable).where(and(eq(botOwnerSettingsTable.userId, userId), eq(botOwnerSettingsTable.deviceId, deviceId)));
    if (!settings?.rajaongkirApiKey) return "Maaf, terjadi kesalahan konfigurasi ongkir.";

    const service = new RajaOngkirService(settings.rajaongkirApiKey, (settings.rajaongkirAccountType as any) ?? "starter");
    const cities = await service.getCities();
    
    // Simple filter
    const matches = cities.filter(c => c.city_name.toLowerCase().includes(lower) || lower.includes(c.city_name.toLowerCase()));

    if (matches.length === 0) return `Kota *${trimmed}* tidak ditemukan. Bisa tulis nama kotanya saja? (contoh: Jakarta Selatan)`;
    
    if (matches.length > 5) return `Ditemukan terlalu banyak kota (${matches.length}). Bisa lebih spesifik?`;

    if (matches.length > 1 && !/^\d+$/.test(trimmed)) {
       return `Ditemukan beberapa kecocokan. Pilih nomornya:\n` + matches.map((m, i) => `${i+1}. ${m.type} ${m.city_name} (${m.province})`).join('\n');
    }

    let selected = matches[0];
    if (/^\d+$/.test(trimmed)) {
       const idx = parseInt(trimmed, 10) - 1;
       if (idx >= 0 && idx < matches.length) selected = matches[idx];
    }

    // Now calculate cost
    const costs = await service.calculateCost(settings.rajaongkirOriginId!, selected.city_id, 1000, 'jne');
    if (!costs.length) return "Maaf, tidak ada layanan pengiriman tersedia untuk kota ini.";

    const option = costs[0].cost[0]; // Take first service
    const shippingFee = option.value;

    await upsertSession(userId, deviceId, phone, { 
      step: "confirm", 
      cityId: selected.city_id, 
      shippingFee,
      shippingCourier: 'JNE',
      shippingService: costs[0].service
    });

    const s = await getSession(userId, deviceId, phone);
    const subtotal = Number(s?.productPrice ?? 0) * (s?.qty ?? 1);
    const total = subtotal + shippingFee;

    return (
      `📋 *KONFIRMASI PESANAN*\n\n` +
      `🛍️ Produk: ${s?.productName}${s?.variantOptions ? ` (${s.variantOptions})` : ''}\n` +
      `📦 Qty: ${s?.qty}\n` +
      `💰 Subtotal: ${formatRp(subtotal)}\n` +
      `🚚 Ongkir (JNE): ${formatRp(shippingFee)}\n` +
      `✨ *Total Bayar: ${formatRp(total)}*\n\n` +
      `👤 Nama: ${s?.customerName}\n` +
      `📍 Alamat: ${s?.customerAddress}\n` +
      `🏙️ Kota: ${selected.type} ${selected.city_name}\n\n` +
      `Balas *YA* untuk konfirmasi.`
    );
  }

  if (step === "confirm") {
    if (!["ya", "yes", "ok", "oke", "siap"].includes(lower)) return `Balas *YA* untuk konfirmasi pesanan.`;

    const s = await getSession(userId, deviceId, phone);
    if (!s || !s.productId) {
      await clearSession(userId, deviceId, phone);
      return "Sesi hilang. Ketik *katalog* untuk mulai baru.";
    }

    const qty = s.qty ?? 1;
    const shippingFee = Number(s.shippingFee ?? 0);
    const total = (Number(s.productPrice ?? 0) * qty) + shippingFee;

    const [order] = await db.insert(botOrdersTable).values({
      userId, deviceId, productId: s.productId, productName: s.productName ?? "",
      productPrice: String(s.productPrice ?? 0), qty, totalPrice: String(total),
      shippingFee: String(shippingFee),
      variantOptions: s.variantOptions, customerPhone: phone,
      customerName: s.customerName ?? "", customerAddress: s.customerAddress ?? "",
      status: "pending", paymentStatus: "unpaid"
    }).returning();

    const [product] = await db.select().from(botProductsTable).where(eq(botProductsTable.id, s.productId));
    if (product?.stock !== null) {
      await db.update(botProductsTable).set({ stock: Math.max(0, Number(product.stock) - qty) }).where(eq(botProductsTable.id, s.productId));
    }

    // --- Owner Settings check ---
    const [settings] = await db.select().from(botOwnerSettingsTable).where(and(eq(botOwnerSettingsTable.userId, userId), eq(botOwnerSettingsTable.deviceId, deviceId)));
    
    // Alert Owner conceptual (logs)
    if (product?.stock !== null && (Number(product.stock) - qty) <= (product.minStock ?? 0) && settings?.stockAlertEnabled) {
      console.log(`[ALERT] Stock Low/Empty for ${product.name}. Owner: ${settings.ownerPhone}`);
    }

    // --- Payment Instructions ---
    let paymentNote = "";
    if (settings?.paymentInstructionEnabled) {
      const pm = await db.select().from(botPaymentMethodsTable).where(and(eq(botPaymentMethodsTable.userId, userId), eq(botPaymentMethodsTable.deviceId, deviceId), eq(botPaymentMethodsTable.isActive, true)));
      if (pm.length > 0) {
        paymentNote = "\n\n💳 *INSTRUKSI PEMBAYARAN:*\n" + pm.map(p => `- *${p.provider}* (${p.accountName})\n  ${p.accountNumber}${p.instructions ? `\n  _${p.instructions}_` : ''}`).join('\n\n');
      }
    }

    await upsertSession(userId, deviceId, phone, { step: "await_proof", orderId: order.id });

    return (
      `✅ *PESANAN #${order.id} BERHASIL!*\n\n` +
      `🛍️ ${order.productName} × ${qty}\n` +
      `💰 Total: *${formatRp(total)}*${paymentNote}\n\n` +
      `Silakan upload/kirim *FOTO BUKTI TRANSFER* di sini untuk mempercepat verifikasi. 🙏`
    );
  }

  if (step === "await_proof") {
     if (lower.includes("http") || lower.includes("image_reception_placeholder")) {
        const orderId = freshSession?.orderId;
        if (orderId) {
          await db.update(botOrdersTable).set({ proofImageUrl: trimmed }).where(eq(botOrdersTable.id, orderId));
          await clearSession(userId, deviceId, phone);
          return "✅ Bukti transfer telah diterima! Kami akan segera memverifikasi pesanan Anda. Terima kasih! 🙏";
        }
     }
     return "Menunggu bukti transfer... Silakan kirimkan foto bukti pembayaran Anda.";
  }

  return null;
}
