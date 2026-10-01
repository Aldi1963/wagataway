// Fitur 7: Integration Hub — katalog platform + panduan setup per platform.
// INBOX_PLACEHOLDER diganti runtime dengan URL inbox asli.

export interface PlatformCodeBlock {
  title: string;
  language: string;
  code: string;
}

export interface PlatformGuide {
  slug: string;
  name: string;
  desc: string;
  /** Inisial untuk tile kartu (2 huruf) — fallback bila logo gagal dimuat. */
  initials: string;
  /** Warna tile kartu (kelas Tailwind bg) — fallback. */
  tile: string;
  /** Nama file logo asli di ./integration-logos/ (svg/png). */
  logo?: string;
  steps: string[];
  payloadExample: string;
  codes?: PlatformCodeBlock[];
}

export const INBOX_PLACEHOLDER = "INBOX_URL_ANDA";

const genericPayload = `{
  "to": "62812xxxxxxx",
  "message": "Halo dari integrasi! Pesan ini dikirim otomatis."
}`;

export const PLATFORMS: PlatformGuide[] = [
  {
    slug: "google_forms",
    logo: "googleforms.svg",
    name: "Google Forms",
    desc: "Kirim WA otomatis setiap ada responden mengisi form.",
    initials: "GF",
    tile: "bg-violet-600",
    steps: [
      "Buat integrasi Google Forms di halaman ini (pilih perangkat + template opsional), lalu salin URL Inbox.",
      "Buka Google Form → ⋮ (titik tiga) → Script editor (Apps Script).",
      "Tempel kode di bawah, ganti INBOX_URL dengan URL Inbox Anda.",
      "Di Apps Script: Pemicu (Triggers, ikon jam) → Tambah pemicu → pilih fungsi onFormSubmit, sumber kejadian \"Dari formulir\", jenis kejadian \"Saat pengiriman formulir\".",
      "Simpan & izinkan akses saat diminta. Setiap form terisi, pesan WA terkirim otomatis.",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "nama": "Budi",
  "email": "budi@contoh.com",
  "jawaban": "{isi form}"
}`,
    codes: [
      {
        title: "Kode Google Apps Script (siap tempel)",
        language: "javascript",
        code: `function onFormSubmit(e) {
  var r = e.namedValues; // { "Nama": ["Budi"], "Email": ["budi@x.com"], ... }
  var nama = (r["Nama"] || ["-"])[0];
  var email = (r["Email"] || ["-"])[0];
  var payload = {
    to: "62812xxxxxxx", // ganti: nomor tujuan / ambil dari jawaban form
    nama: nama,
    email: email,
    message: "Responden baru: " + nama + " (" + email + ")"
  };
  UrlFetchApp.fetch("INBOX_URL_ANDA", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
}`,
      },
    ],
  },
  {
    slug: "google_sheets",
    logo: "googlesheets.svg",
    name: "Google Sheets",
    desc: "Kirim WA saat baris baru ditambahkan / sel berubah.",
    initials: "GS",
    tile: "bg-emerald-600",
    steps: [
      "Buat integrasi Google Sheets di halaman ini, lalu salin URL Inbox.",
      "Buka spreadsheet → Ekstensi → Apps Script, tempel kode di bawah.",
      "Atur pemicu (ikon jam): fungsi onNewRow, sumber \"Dari spreadsheet\", kejadian \"Saat perubahan\" atau panggil manual per baris.",
      "Format kolom yang disarankan: A = nomor WA (628xx), B = nama, C = pesan/status.",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "nama": "Budi",
  "status": "Lunas"
}`,
    codes: [
      {
        title: "Kode Apps Script — kirim saat baris baru",
        language: "javascript",
        code: `function onNewRow(e) {
  var sheet = e.source.getActiveSheet();
  var row = e.range.getRow();
  if (row === 1) return; // lewati header
  var no = String(sheet.getRange(row, 1).getValue());   // kolom A: nomor WA
  var nama = sheet.getRange(row, 2).getValue();          // kolom B: nama
  var status = sheet.getRange(row, 3).getValue();        // kolom C: status
  UrlFetchApp.fetch("INBOX_URL_ANDA", {
    method: "post",
    contentType: "application/json",
    payload: JSON.stringify({ to: no, nama: nama, status: status }),
    muteHttpExceptions: true
  });
}`,
      },
    ],
  },
  {
    slug: "woocommerce",
    logo: "woocommerce.svg",
    name: "WooCommerce",
    desc: "Notifikasi WA otomatis untuk order baru / status berubah.",
    initials: "WC",
    tile: "bg-indigo-600",
    steps: [
      "Buat integrasi WooCommerce di halaman ini. Pada kolom Template isi misal: \"Order baru #{{id}} dari {{billing.first_name}} (Rp{{total}}) — {{status}}\".",
      "Salin URL Inbox.",
      "Di WordPress: WooCommerce → Settings → Advanced → Webhooks → Add webhook.",
      "Name: \"WaGataway Order\", Status: Active, Topic: \"Order created\" (atau \"Order updated\").",
      "Delivery URL: tempel URL Inbox. Secret: kosongkan. API Version: WP REST API v3. Save.",
      "WooCommerce akan POST data order ke URL itu. Field yang tersedia: id, total, currency, status, billing.{first_name,last_name,phone,email}, line_items[].",
      "Untuk nomor tujuan: isi \"to\" dari field billing.phone via template tidak bisa — gunakan plugin Code Snippets untuk memetakan nomor admin/toko sebagai tujuan, atau minta developer menambahkan custom field.",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "id": 12345,
  "total": "250000",
  "status": "processing",
  "billing": { "first_name": "Budi", "phone": "62812xxxxxxx" }
}`,
  },
  {
    slug: "wordpress",
    logo: "wordpress.svg",
    name: "WordPress",
    desc: "Notifikasi user baru, komentar baru, atau event custom.",
    initials: "WP",
    tile: "bg-sky-700",
    steps: [
      "Buat integrasi WordPress di halaman ini, lalu salin URL Inbox.",
      "Cara termudah: install plugin \"WP Webhooks\" → buat Trigger untuk event (User Created, Comment Posted, dsb) → action \"Send HTTP request\" ke URL Inbox.",
      "Alternatif tanpa plugin: pakai plugin Code Snippets, tempel snippet di bawah.",
      "Sesuaikan \"to\" dengan nomor admin/tim Anda.",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "event": "user_registered",
  "username": "budi123",
  "email": "budi@contoh.com"
}`,
    codes: [
      {
        title: "Snippet PHP (Code Snippets) — user baru & komentar baru",
        language: "php",
        code: `add_action('user_register', function($user_id) {
  $u = get_userdata($user_id);
  wp_remote_post('INBOX_URL_ANDA', [
    'headers' => ['Content-Type' => 'application/json'],
    'body' => json_encode([
      'to' => '62812xxxxxxx', // nomor admin
      'event' => 'user_registered',
      'username' => $u->user_login,
      'email' => $u->user_email,
    ]),
  ]);
});
add_action('comment_post', function($comment_id) {
  $c = get_comment($comment_id);
  wp_remote_post('INBOX_URL_ANDA', [
    'headers' => ['Content-Type' => 'application/json'],
    'body' => json_encode([
      'to' => '62812xxxxxxx',
      'event' => 'comment_posted',
      'author' => $c->comment_author,
      'content' => wp_trim_words($c->comment_content, 20),
    ]),
  ]);
});`,
      },
    ],
  },
  {
    slug: "shopify",
    logo: "shopify.svg",
    name: "Shopify",
    desc: "Notifikasi order baru & pembayaran via Shopify webhooks.",
    initials: "SH",
    tile: "bg-emerald-700",
    steps: [
      "Buat integrasi Shopify di halaman ini. Template contoh: \"Order {{name}} senilai {{total_price}} {{currency}} — {{financial_status}}\".",
      "Salin URL Inbox.",
      "Di Shopify admin: Settings → Notifications → Webhooks → Create webhook.",
      "Event: \"Order creation\" (atau \"Order payment\"), Format: JSON, URL: tempel URL Inbox.",
      "Shopify POST data order (name, total_price, customer.first_name, dll) — variabel template {{path}} bisa dipakai.",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "name": "#1001",
  "total_price": "250000",
  "currency": "IDR",
  "financial_status": "paid"
}`,
  },
  {
    slug: "typeform",
    logo: "typeform.svg",
    name: "Typeform",
    desc: "Kirim WA setiap ada respons Typeform baru.",
    initials: "TF",
    tile: "bg-slate-700",
    steps: [
      "Buat integrasi Typeform di halaman ini, lalu salin URL Inbox.",
      "Di Typeform: buka form → Connect → Webhooks → tambahkan URL Inbox sebagai webhook.",
      "Typeform mengirim event form_response dengan field answers[] — gunakan template mis. \"Respons baru dari {{form_response.definition.title}}\".",
      "Untuk pesan yang rapi, aktifkan \"Include hidden fields\" bila perlu.",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "event": "form_response",
  "form_response": { "definition": { "title": "Form Pendaftaran" } }
}`,
  },
  {
    slug: "tally",
    logo: "tally.png",
    name: "Tally",
    desc: "Webhook Tally → notifikasi WA instan.",
    initials: "TA",
    tile: "bg-blue-700",
    steps: [
      "Buat integrasi Tally di halaman ini, lalu salin URL Inbox.",
      "Di Tally: buka form → Integrations → Webhooks → Connect → tempel URL Inbox.",
      "Tally mengirim event \"FORM_RESPONSE\" berisi fields jawaban — petakan ke template {{...}}.",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "event": "FORM_RESPONSE",
  "data": { "fields": [] }
}`,
  },
  {
    slug: "jotform",
    logo: "jotform.png",
    name: "Jotform",
    desc: "Kirim WA untuk setiap submission Jotform.",
    initials: "JF",
    tile: "bg-orange-600",
    steps: [
      "Buat integrasi Jotform di halaman ini, lalu salin URL Inbox.",
      "Di Jotform: form → Settings → Integrations → Webhooks → Add New Webhook → tempel URL Inbox.",
      "Jotform POST rawRequest berisi jawaban tiap field — gunakan \"message\" atau template.",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "formTitle": "Formulir Order",
  "rawRequest": { "q3_nama": "Budi" }
}`,
  },
  {
    slug: "zapier",
    logo: "zapier.svg",
    name: "Zapier",
    desc: "Hubungkan 7000+ aplikasi Zapier ke WA via Webhooks.",
    initials: "ZA",
    tile: "bg-orange-500",
    steps: [
      "Buat integrasi Zapier di halaman ini, lalu salin URL Inbox.",
      "Di Zapier: buat Zap → Trigger = aplikasi & event pilihan Anda.",
      "Action: pilih \"Webhooks by Zapier\" → \"POST\".",
      "URL: tempel URL Inbox. Payload Type: Json. Data: to = nomor WA, message = teks (bisa pakai field dari trigger).",
      "Test & Publish Zap.",
    ],
    payloadExample: genericPayload,
  },
  {
    slug: "make",
    logo: "make.svg",
    name: "Make (Integromat)",
    desc: "Skenario Make → modul HTTP POST ke inbox.",
    initials: "MK",
    tile: "bg-fuchsia-700",
    steps: [
      "Buat integrasi Make di halaman ini, lalu salin URL Inbox.",
      "Di Make: buat skenario → modul pertama = trigger aplikasi Anda.",
      "Tambah modul \"HTTP\" → \"Make a request\": Method POST, URL = URL Inbox, Body type = Raw, Content type = JSON.",
      "Isi body: { \"to\": \"62812...\", \"message\": \"...\" } — bisa disisipi variabel dari modul sebelumnya.",
      "Jalankan skenario & aktifkan scheduling.",
    ],
    payloadExample: genericPayload,
  },
  {
    slug: "pabbly",
    logo: "pabbly.png",
    name: "Pabbly Connect",
    desc: "Workflow Pabbly → API/Webhook POST.",
    initials: "PB",
    tile: "bg-teal-600",
    steps: [
      "Buat integrasi Pabbly di halaman ini, lalu salin URL Inbox.",
      "Di Pabbly Connect: buat workflow → Trigger aplikasi Anda.",
      "Action: \"API\" → \"POST\" (atau Webhook) → Endpoint URL = URL Inbox.",
      "Body (JSON): { \"to\": \"...\", \"message\": \"...\" } dengan mapping field dari trigger.",
    ],
    payloadExample: genericPayload,
  },
  {
    slug: "ifttt",
    logo: "ifttt.svg",
    name: "IFTTT",
    desc: "Applet IFTTT → Webhooks POST ke WaGataway.",
    initials: "IF",
    tile: "bg-sky-600",
    steps: [
      "Buat integrasi IFTTT di halaman ini, lalu salin URL Inbox.",
      "Di IFTTT: buat Applet → If = trigger pilihan → Then = \"Webhooks\" → \"Make a web request\".",
      "URL: tempel URL Inbox. Method: POST. Content Type: application/json.",
      "Body: { \"to\": \"62812...\", \"message\": \"<<<{{Value1}}>>>\" } — Value1..3 dari trigger.",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "message": "Event IFTTT terpicu!"
}`,
  },
  {
    slug: "stripe",
    logo: "stripe.svg",
    name: "Stripe",
    desc: "Notifikasi pembayaran Stripe berhasil/gagal.",
    initials: "ST",
    tile: "bg-indigo-500",
    steps: [
      "Buat integrasi Stripe di halaman ini. Template: \"Pembayaran {{data.object.amount}} {{data.object.currency}} — {{type}}\".",
      "Salin URL Inbox.",
      "Di Stripe Dashboard: Developers → Webhooks → Add endpoint → tempel URL Inbox.",
      "Pilih event: payment_intent.succeeded (dan .payment_failed bila perlu).",
      "Stripe POST event object — field tersedia di bawah data.object.",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "type": "payment_intent.succeeded",
  "data": { "object": { "amount": 250000, "currency": "idr" } }
}`,
  },
  {
    slug: "midtrans",
    logo: "midtrans.png",
    name: "Midtrans",
    desc: "Notifikasi status transaksi Midtrans.",
    initials: "MT",
    tile: "bg-red-600",
    steps: [
      "Buat integrasi Midtrans di halaman ini. Template: \"Transaksi {{order_id}} {{transaction_status}} (Rp{{gross_amount}})\".",
      "Salin URL Inbox.",
      "Di Midtrans Dashboard: Settings → Configuration → tempel URL Inbox ke kolom Payment Notification URL.",
      "Midtrans POST JSON: order_id, transaction_status, gross_amount, payment_type.",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "order_id": "ORDER-123",
  "transaction_status": "settlement",
  "gross_amount": "250000"
}`,
  },
  {
    slug: "xendit",
    logo: "xendit.png",
    name: "Xendit",
    desc: "Callback invoice & payment Xendit → WA.",
    initials: "XE",
    tile: "bg-cyan-700",
    steps: [
      "Buat integrasi Xendit di halaman ini. Template: \"Invoice {{external_id}} {{status}} (Rp{{amount}})\".",
      "Salin URL Inbox.",
      "Di Xendit Dashboard: Settings → Developers → Webhooks → tempel URL Inbox untuk event Invoice / Payment.",
      "Xendit POST data invoice (external_id, status, amount, payer_email).",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "external_id": "INV-123",
  "status": "PAID",
  "amount": 250000
}`,
  },
  {
    slug: "telegram",
    logo: "telegram.svg",
    name: "Telegram",
    desc: "Teruskan pesan/event bot Telegram ke WA.",
    initials: "TG",
    tile: "bg-sky-500",
    steps: [
      "Buat integrasi Telegram di halaman ini, lalu salin URL Inbox.",
      "Di kode bot Telegram Anda (atau via Bot API setWebhook ke server perantara), teruskan update ke URL Inbox.",
      "Format: { \"to\": \"62812...\", \"message\": message.text }.",
      "Cocok untuk jembatan notifikasi: grup Telegram → WA admin.",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "message": "Pesan dari bot Telegram: stok menipis!"
}`,
  },
  {
    slug: "discord",
    logo: "discord.svg",
    name: "Discord",
    desc: "Webhook Discord → notifikasi WA.",
    initials: "DC",
    tile: "bg-indigo-700",
    steps: [
      "Buat integrasi Discord di halaman ini, lalu salin URL Inbox.",
      "Gunakan bot Discord Anda / automation (mis. via Zapier/Make) untuk POST ke URL Inbox saat event terjadi.",
      "Body: { \"to\": \"62812...\", \"message\": \"...\" }.",
    ],
    payloadExample: genericPayload,
  },
  {
    slug: "slack",
    logo: "slack.svg",
    name: "Slack",
    desc: "Event Slack (Workflow Builder) → WA.",
    initials: "SL",
    tile: "bg-purple-700",
    steps: [
      "Buat integrasi Slack di halaman ini, lalu salin URL Inbox.",
      "Di Slack Workflow Builder: tambah langkah \"Send a webhook\" (atau via app custom) → POST ke URL Inbox.",
      "Body JSON: { \"to\": \"62812...\", \"message\": \"...\" }.",
    ],
    payloadExample: genericPayload,
  },
  {
    slug: "github",
    logo: "github.svg",
    name: "GitHub",
    desc: "Notifikasi push, release, issue, PR ke WA.",
    initials: "GH",
    tile: "bg-slate-800",
    steps: [
      "Buat integrasi GitHub di halaman ini. Template: \"{{repository.full_name}}: {{action}} — {{commits.0.message}}\".",
      "Salin URL Inbox.",
      "Di repo: Settings → Webhooks → Add webhook → Payload URL = URL Inbox, Content type = application/json.",
      "Pilih event: push, releases, issues, pull requests.",
      "GitHub POST payload event — variabel template bisa menjangkau field bertingkat.",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "action": "published",
  "repository": { "full_name": "acme/app" }
}`,
  },
  {
    slug: "trello",
    logo: "trello.svg",
    name: "Trello",
    desc: "Notifikasi kartu Trello dibuat/dipindah.",
    initials: "TR",
    tile: "bg-blue-600",
    steps: [
      "Buat integrasi Trello di halaman ini, lalu salin URL Inbox.",
      "Daftarkan webhook via Trello API (POST /1/webhooks): callbackURL = URL Inbox, idModel = id board/list.",
      "Butuh API key + token Trello — lihat dokumentasi Trello Webhooks.",
      "Event: createCard, updateCard — petakan ke template.",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "action": { "type": "createCard" },
  "message": "Kartu baru: Desain banner"
}`,
  },
  {
    slug: "notion",
    logo: "notion.svg",
    name: "Notion",
    desc: "Automations Notion → kirim WA.",
    initials: "NO",
    tile: "bg-stone-700",
    steps: [
      "Buat integrasi Notion di halaman ini, lalu salin URL Inbox.",
      "Di Notion: buka database → Automations (⚡) → New automation → trigger (mis. properti berubah).",
      "Action: \"Send webhook\" → POST ke URL Inbox dengan body { \"to\": \"...\", \"message\": \"...\" } memakai properti halaman.",
    ],
    payloadExample: genericPayload,
  },
  {
    slug: "airtable",
    logo: "airtable.svg",
    name: "Airtable",
    desc: "Automation Airtable → WA otomatis.",
    initials: "AT",
    tile: "bg-amber-600",
    steps: [
      "Buat integrasi Airtable di halaman ini, lalu salin URL Inbox.",
      "Di Airtable: Automations → trigger (record created/updated) → action \"Run script\" atau kirim via webhook.",
      "Script: fetch(URL_INBOX, { method: \"POST\", body: JSON.stringify({ to, message }) }).",
    ],
    payloadExample: genericPayload,
  },
  {
    slug: "hubspot",
    logo: "hubspot.svg",
    name: "HubSpot",
    desc: "Workflow HubSpot → notifikasi WA untuk deal/kontak.",
    initials: "HS",
    tile: "bg-orange-700",
    steps: [
      "Buat integrasi HubSpot di halaman ini. Template: \"Deal {{dealname}} → {{dealstage}}\".",
      "Salin URL Inbox.",
      "Di HubSpot: Automation → Workflows → buat workflow → action \"Send webhook\" (butuh paket yang mendukung).",
      "Method POST, URL = URL Inbox, body berisi to + properti deal/kontak.",
    ],
    payloadExample: `{
  "to": "62812xxxxxxx",
  "dealname": "Paket Langganan Pro",
  "dealstage": "closedwon"
}`,
  },
];

export function getPlatform(slug: string): PlatformGuide | undefined {
  return PLATFORMS.find((p) => p.slug === slug);
}

// Logo asli tiap platform (di-vendor ke repo agar tidak tergantung CDN).
const logoModules = import.meta.glob<{ default: string }>("./integration-logos/*.{svg,png}", {
  eager: true,
});

export function platformLogoUrl(p: PlatformGuide | undefined): string | undefined {
  if (!p?.logo) return undefined;
  return logoModules[`./integration-logos/${p.logo}`]?.default;
}
