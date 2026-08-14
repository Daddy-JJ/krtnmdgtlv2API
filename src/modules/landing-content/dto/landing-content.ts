import { z } from 'zod';

export const landingContentDefaults = {
  heroEyebrow: 'Identitas Profesional Digital',
  heroTitle: 'Satu Link untuk Membuat Anda Lebih Dikenal, Dihubungi, dan Diingat',
  heroLead: 'KartuNamaDigital.id membantu profesional dan usaha membagikan informasi kontak dengan lebih praktis melalui satu halaman digital.',
  heroPrimaryCta: 'Mulai Gratis',
  heroSecondaryCta: 'Lihat Cara Kerja',
  moreKicker: 'Profil yang bekerja lebih jauh',
  moreTitle: 'Lebih dari Sekadar Kartu Nama',
  moreBody: 'Tampilkan profil profesional, layanan, media sosial, katalog, lokasi, dan berbagai informasi penting lainnya dalam satu halaman yang selalu terbaru.',
  socialKicker: 'Dari ditemukan menjadi terhubung',
  socialTitle: 'Jadikan Profil LinkedIn Anda Lebih Mudah Dihubungi',
  socialQuote: 'LinkedIn membantu orang menemukan Anda. KartuNamaDigital.id membantu mereka menghubungi Anda.',
  socialBody: 'Tambahkan satu link profesional pada profil, pesan, atau unggahan Anda agar calon klien, rekan kerja, dan mitra dapat langsung melihat informasi penting serta menyimpan kontak Anda.',
  stepsKicker: 'Empat langkah sederhana',
  stepsTitle: 'Cara Kerja',
  plansKicker: 'Keanggotaan fleksibel',
  plansTitle: 'Pilih Sesuai Kebutuhan Anda',
  plansBody: 'Mulai sederhana, lalu gunakan kemampuan yang lebih lengkap ketika kebutuhan Anda berkembang.',
  securityKicker: 'Perlindungan berlapis',
  securityTitle: 'Keamanan sebagai Fondasi',
  securityBody: 'Akses publik dibuat mudah, sementara proses pengelolaan dan operasi sensitif tetap dipisahkan serta diverifikasi oleh server.',
  finalKicker: 'Siap memulai?',
  finalTitle: 'Siap Meningkatkan Profesionalitas Anda?',
  finalBody: 'Buat Kartu Nama Digital Anda sekarang dan mulai bagikan identitas profesional Anda.',
  finalPrimaryCta: 'Mulai Gratis',
  finalSecondaryCta: 'Pelajari Lebih Lanjut',
};

export type LandingContent = typeof landingContentDefaults;

const plainText = (max: number) => z.string().trim().min(1).max(max).refine((value) => !/[<>\u0000]/.test(value), 'Only plain text is allowed.');

export const landingContentSchema = z.object({
  heroEyebrow: plainText(80), heroTitle: plainText(180), heroLead: plainText(500), heroPrimaryCta: plainText(60), heroSecondaryCta: plainText(60),
  moreKicker: plainText(80), moreTitle: plainText(180), moreBody: plainText(500),
  socialKicker: plainText(80), socialTitle: plainText(180), socialQuote: plainText(400), socialBody: plainText(500),
  stepsKicker: plainText(80), stepsTitle: plainText(120), plansKicker: plainText(80), plansTitle: plainText(180), plansBody: plainText(500),
  securityKicker: plainText(80), securityTitle: plainText(180), securityBody: plainText(500),
  finalKicker: plainText(80), finalTitle: plainText(180), finalBody: plainText(500), finalPrimaryCta: plainText(60), finalSecondaryCta: plainText(60),
}).strict();

export const landingContentUpdateSchema = z.object({ content: landingContentSchema, reason: z.string().trim().min(10).max(300) }).strict();
