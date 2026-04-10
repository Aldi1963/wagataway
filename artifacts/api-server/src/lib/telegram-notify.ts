import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

async function getSetting(key: string): Promise<string | null> {
  const [row] = await db.select().from(settingsTable).where(eq(settingsTable.key, key));
  return row?.value ?? null;
}

/**
 * Kirim notifikasi ke Telegram. Butuh setting:
 *   telegram_bot_token = token bot Telegram
 *   telegram_chat_id   = chat id / group id
 */
export async function sendTelegramNotification(message: string): Promise<void> {
  try {
    const token = await getSetting("telegram_bot_token");
    const chatId = await getSetting("telegram_chat_id");
    if (!token || !chatId) return;

    await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: message,
        parse_mode: "HTML",
      }),
    });
  } catch {
    // silent — jangan crash jika Telegram gagal
  }
}

/** Format pesan notifikasi device disconnect */
export function fmtDeviceDisconnect(deviceName: string, phone: string): string {
  return `⚠️ <b>Device Terputus</b>\n\nPerangkat <b>${deviceName}</b> (${phone}) baru saja offline.\n\nHarap scan ulang QR Code untuk menyambungkan kembali.`;
}

/** Format pesan notifikasi blast selesai */
export function fmtBlastDone(jobName: string, sent: number, failed: number, total: number): string {
  const pct = total > 0 ? Math.round((sent / total) * 100) : 0;
  return `✅ <b>Blast Selesai</b>\n\n<b>${jobName}</b>\n📤 Terkirim: ${sent}/${total} (${pct}%)\n❌ Gagal: ${failed}`;
}

/** Format pesan notifikasi saldo hampir habis */
export function fmtLowBalance(userName: string, balance: number): string {
  return `💰 <b>Saldo Hampir Habis</b>\n\nUser <b>${userName}</b> memiliki saldo Rp ${balance.toLocaleString("id-ID")}.\n\nSegera isi ulang untuk menghindari layanan terhenti.`;
}
