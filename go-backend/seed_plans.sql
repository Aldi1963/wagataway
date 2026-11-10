-- Seed 5 paket WaGataway (idempotent: aman dijalankan berulang)
-- price dalam rupiah, duration dalam hari, max_messages per hari, monthly_message_limit per bulan (0 = unlimited)

INSERT INTO plans (name, slug, description, price, duration, max_devices, max_messages, monthly_message_limit, max_contacts, max_auto_reply, max_bulk, features, is_active, sort_order, created_at, updated_at)
VALUES
('Free', 'free',
 'Paket gratis untuk mencoba semua fitur dasar WaGataway.',
 0, 30, 1, 1000, 3000, 500, 5, 100,
 '["Kirim personal","Pesan terjadwal","Pesan berulang","Template pesan","Autoreply keyword","Webhook","REST API"]',
 true, 1, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO plans (name, slug, description, price, duration, max_devices, max_messages, monthly_message_limit, max_contacts, max_auto_reply, max_bulk, features, is_active, sort_order, created_at, updated_at)
VALUES
('Lite', 'lite',
 'Untuk personal dan UMKM yang baru mulai otomatisasi WhatsApp.',
 25000, 30, 2, 1000, 15000, 500, 5, 100,
 '["Semua fitur Free","Kirim attachment","Broadcast & CSV","Notifikasi device","Live chat","Prioritas antrean"]',
 true, 2, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO plans (name, slug, description, price, duration, max_devices, max_messages, monthly_message_limit, max_contacts, max_auto_reply, max_bulk, features, is_active, sort_order, created_at, updated_at)
VALUES
('Regular', 'regular',
 'Untuk bisnis yang butuh volume pesan lebih besar dan kampanye terjadwal.',
 66000, 30, 3, 10000, 100000, 500, 5, 100,
 '["Semua fitur Lite","Drip campaign","Kalender jadwal","Analitik pengiriman","Grup kontak"]',
 true, 3, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO plans (name, slug, description, price, duration, max_devices, max_messages, monthly_message_limit, max_contacts, max_auto_reply, max_bulk, features, is_active, sort_order, created_at, updated_at)
VALUES
('Pro', 'pro',
 'Untuk tim dan agensi dengan banyak device dan kebutuhan webhook lanjutan.',
 110000, 30, 5, 25000, 300000, 500, 5, 100,
 '["Semua fitur Regular","Multi device random","Webhook retry","Template unlimited","Support prioritas"]',
 true, 4, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;

INSERT INTO plans (name, slug, description, price, duration, max_devices, max_messages, monthly_message_limit, max_contacts, max_auto_reply, max_bulk, features, is_active, sort_order, created_at, updated_at)
VALUES
('Master', 'master',
 'Untuk enterprise dengan kebutuhan pesan tanpa batas dan support dedicated.',
 175000, 30, 10, 1000000, 0, 500, 5, 100,
 '["Semua fitur Pro","Pesan tanpa batas","API limit tinggi","Dedicated support"]',
 true, 5, NOW(), NOW())
ON CONFLICT (slug) DO NOTHING;
