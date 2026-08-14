-- +migrate Up

INSERT INTO website_settings(setting_key,setting_group,value_text,classification,is_editable,created_at,updated_at)
VALUES(
  'landing_page.wording',
  'landing_page',
  '{"heroEyebrow":"Identitas Profesional Digital","heroTitle":"Satu Link untuk Membuat Anda Lebih Dikenal, Dihubungi, dan Diingat","heroLead":"KartuNamaDigital.id membantu profesional dan usaha membagikan informasi kontak dengan lebih praktis melalui satu halaman digital.","heroPrimaryCta":"Mulai Gratis","heroSecondaryCta":"Lihat Cara Kerja","moreKicker":"Profil yang bekerja lebih jauh","moreTitle":"Lebih dari Sekadar Kartu Nama","moreBody":"Tampilkan profil profesional, layanan, media sosial, katalog, lokasi, dan berbagai informasi penting lainnya dalam satu halaman yang selalu terbaru.","socialKicker":"Dari ditemukan menjadi terhubung","socialTitle":"Jadikan Profil LinkedIn Anda Lebih Mudah Dihubungi","socialQuote":"LinkedIn membantu orang menemukan Anda. KartuNamaDigital.id membantu mereka menghubungi Anda.","socialBody":"Tambahkan satu link profesional pada profil, pesan, atau unggahan Anda agar calon klien, rekan kerja, dan mitra dapat langsung melihat informasi penting serta menyimpan kontak Anda.","stepsKicker":"Empat langkah sederhana","stepsTitle":"Cara Kerja","plansKicker":"Keanggotaan fleksibel","plansTitle":"Pilih Sesuai Kebutuhan Anda","plansBody":"Mulai sederhana, lalu gunakan kemampuan yang lebih lengkap ketika kebutuhan Anda berkembang.","securityKicker":"Perlindungan berlapis","securityTitle":"Keamanan sebagai Fondasi","securityBody":"Akses publik dibuat mudah, sementara proses pengelolaan dan operasi sensitif tetap dipisahkan serta diverifikasi oleh server.","finalKicker":"Siap memulai?","finalTitle":"Siap Meningkatkan Profesionalitas Anda?","finalBody":"Buat Kartu Nama Digital Anda sekarang dan mulai bagikan identitas profesional Anda.","finalPrimaryCta":"Mulai Gratis","finalSecondaryCta":"Pelajari Lebih Lanjut"}',
  'PUBLIC',
  1,
  UTC_TIMESTAMP(),
  UTC_TIMESTAMP()
)
ON DUPLICATE KEY UPDATE updated_at=updated_at;

-- +migrate Down

DELETE scl FROM setting_change_logs scl
JOIN website_settings ws ON ws.id=scl.setting_id
WHERE ws.setting_key='landing_page.wording';
DELETE FROM website_settings WHERE setting_key='landing_page.wording';
