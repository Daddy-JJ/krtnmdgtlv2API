import { z } from 'zod';
import { AppError } from '../../../shared/http/errors.ts';

export const templateKeys = ['starter.management', 'auth.registration-otp', 'auth.password-reset', 'resume.completed', 'resume.retention-30-days', 'resume.retention-7-days', 'resume.retention-1-days'] as const;
export type TemplateKey = typeof templateKeys[number];
export const keySchema = z.enum(templateKeys);
const plain = (max: number, multiline = false) => z.string().max(max).refine(
  value => !(multiline ? /[<>\x00-\x08\x0b-\x1f\x7f]/ : /[<>\x00-\x1f\x7f]/).test(value),
  'HTML and unsafe control characters are not allowed.',
);
const emphasis = z.enum(['normal', 'strong', 'em']);
const partSchema = z.union([
  z.object({ text: plain(2000, true), emphasis }).strict(),
  z.object({ variable: z.literal('fullName'), emphasis }).strict(),
]);
export const contentSchema = z.object({
  schemaVersion: z.literal(1), locale: z.literal('id'),
  subject: plain(160).min(1), preheader: plain(200), heading: plain(160),
  footer: plain(1000, true),
  blocks: z.array(z.discriminatedUnion('type', [
    z.object({ type: z.literal('paragraph'), parts: z.array(partSchema).min(1).max(100) }).strict(),
    z.object({ type: z.literal('action'), targetVariable: z.string(), label: plain(80).min(1) }).strict(),
    z.object({ type: z.literal('system'), key: z.string() }).strict(),
  ])).max(30),
  style: z.object({
    logoAssetKey: z.enum(['brand']).nullable(), logoAlt: plain(160),
    backgroundColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    textColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
    accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
  }).strict(),
}).strict();
export type EmailContent = z.infer<typeof contentSchema>;
export const limits = { subject: 160, preheader: 200, heading: 160, footer: 1000, paragraph: 2000, label: 80, blocks: 30, parts: 100, bodyBytes: 65536 };

export function definition(key: TemplateKey) {
  const starter = key === 'starter.management', otp = key === 'auth.registration-otp', reset = key === 'auth.password-reset';
  return {
    key, label: starter ? 'Welcome / Kelola Kartu Starter' : otp ? 'Verifikasi OTP' : reset ? 'Reset Password' : key === 'resume.completed' ? 'Resume Selesai' : 'Pengingat Unduh Resume ' + key.split('-')[1] + ' Hari',
    actions: starter ? ['cardUrl', 'manageUrl'] : otp ? [] : [reset ? 'resetUrl' : 'requestUrl'],
    systems: [starter ? 'starterAccessNotice' : otp ? 'verificationCode' : reset ? 'passwordResetNotice' : 'resumeRetentionNotice'],
    variables: starter ? [{ name: 'fullName', type: 'text', example: 'Pengguna Contoh', placement: 'paragraph' }] : [],
  };
}
export function defaults(key: TemplateKey): EmailContent {
  const shared = {
    schemaVersion: 1 as const,
    locale: 'id' as const,
    style: { logoAssetKey: null, logoAlt: '', backgroundColor: '#ffffff', textColor: '#172033', accentColor: '#006b80' },
  };
  const paragraph = (text: string): EmailContent['blocks'][number] => ({
    type: 'paragraph',
    parts: [{ text, emphasis: 'normal' }],
  });
  const action = (targetVariable: string, label: string): EmailContent['blocks'][number] => ({ type: 'action', targetVariable, label });
  const system = (systemKey: string): EmailContent['blocks'][number] => ({ type: 'system', key: systemKey });

  if (key === 'starter.management') return {
    ...shared,
    subject: 'Kartu digital Anda sudah siap',
    preheader: 'Kartu Anda telah dibuat dan siap dibagikan.',
    heading: 'Selamat datang di KartuNamaDigital.id',
    footer: 'KartuNamaDigital.id\nIdentitas profesional Anda, lebih mudah dibagikan.',
    blocks: [
      { type: 'paragraph', parts: [
        { text: 'Halo ', emphasis: 'normal' },
        { variable: 'fullName', emphasis: 'strong' },
        { text: ',', emphasis: 'normal' },
      ] },
      paragraph('Kartu digital Anda berhasil dibuat dan sekarang sudah dapat dibagikan. Gunakan tombol berikut untuk melihat tampilan publik kartu Anda.'),
      action('cardUrl', 'Lihat kartu'),
      paragraph('Anda juga dapat melengkapi informasi, mengubah desain, dan mengelola kartu melalui tautan pengelolaan berikut.'),
      action('manageUrl', 'Kelola kartu'),
      system('starterAccessNotice'),
    ],
  };

  if (key === 'auth.registration-otp') return {
    ...shared,
    subject: 'Kode verifikasi akun Anda',
    preheader: 'Gunakan kode ini untuk menyelesaikan pendaftaran akun.',
    heading: 'Verifikasi email Anda',
    footer: 'Jika Anda tidak melakukan pendaftaran, abaikan email ini.\nEmail ini dikirim otomatis. Mohon tidak membalas email ini.',
    blocks: [
      paragraph('Terima kasih telah mendaftar di KartuNamaDigital.id.'),
      paragraph('Masukkan kode berikut pada halaman verifikasi untuk mengaktifkan akun Anda.'),
      system('verificationCode'),
    ],
  };

  if (key === 'auth.password-reset') return {
    ...shared,
    subject: 'Atur ulang password akun Anda',
    preheader: 'Gunakan tautan aman ini untuk membuat password baru.',
    heading: 'Permintaan reset password',
    footer: 'Demi keamanan, jangan meneruskan email atau tautan reset ini kepada siapa pun.',
    blocks: [
      paragraph('Kami menerima permintaan untuk mengatur ulang password akun KartuNamaDigital.id Anda.'),
      paragraph('Klik tombol berikut untuk membuat password baru.'),
      action('resetUrl', 'Reset password'),
      system('passwordResetNotice'),
    ],
  };

  if (key === 'resume.completed') return {
    ...shared,
    subject: 'Resume Anda sudah siap diunduh',
    preheader: 'Hasil Resume Enhancement Anda telah selesai diproses.',
    heading: 'Resume Enhancement Anda sudah siap',
    footer: 'Terima kasih telah menggunakan layanan Resume Enhancement dari KartuNamaDigital.id.',
    blocks: [
      paragraph('Proses penyempurnaan resume Anda telah selesai.'),
      paragraph('Silakan masuk ke member area untuk memeriksa dan mengunduh hasil resume Anda.'),
      action('requestUrl', 'Buka member area'),
      system('resumeRetentionNotice'),
    ],
  };

  const retention = key === 'resume.retention-30-days'
    ? {
        subject: 'Masa unduh resume Anda masih 30 hari',
        preheader: 'Simpan hasil resume sebelum masa penyimpanan berakhir.',
        heading: 'Jangan lupa menyimpan resume Anda',
        paragraphs: [
          'Resume Enhancement Anda masih tersedia di member area.',
          'Anda mempunyai waktu sekitar 30 hari untuk mengunduh dan menyimpan file tersebut ke perangkat atau penyimpanan pribadi Anda.',
        ],
        action: 'Unduh resume',
        footer: 'Jika file sudah tersimpan dengan aman, Anda dapat mengabaikan pengingat ini.',
      }
    : key === 'resume.retention-7-days'
      ? {
          subject: 'Pengingat: masa unduh resume berakhir dalam 7 hari',
          preheader: 'Segera unduh dan simpan hasil resume Anda.',
          heading: 'Tersisa 7 hari untuk mengunduh resume',
          paragraphs: [
            'Masa penyimpanan hasil Resume Enhancement Anda akan segera berakhir.',
            'Kami menyarankan Anda mengunduh file sekarang dan menyimpannya pada perangkat atau penyimpanan cloud pribadi.',
          ],
          action: 'Unduh resume',
          footer: 'Abaikan email ini jika Anda sudah menyimpan file tersebut.',
        }
      : {
          subject: 'Penting: masa unduh resume berakhir besok',
          preheader: 'Ini adalah pengingat terakhir untuk menyimpan resume Anda.',
          heading: 'Pengingat terakhir',
          paragraphs: [
            'Masa unduh hasil Resume Enhancement Anda akan berakhir dalam satu hari.',
            'Segera unduh dan simpan file agar hasil resume Anda tidak hilang setelah periode penyimpanan berakhir.',
          ],
          action: 'Unduh sekarang',
          footer: 'Jika file sudah tersimpan dengan aman, tidak ada tindakan tambahan yang diperlukan.',
        };
  return {
    ...shared,
    subject: retention.subject,
    preheader: retention.preheader,
    heading: retention.heading,
    footer: retention.footer,
    blocks: [
      ...retention.paragraphs.map(paragraph),
      action('requestUrl', retention.action),
      system('resumeRetentionNotice'),
    ],
  };
}
export function validateContent(key: TemplateKey, value: unknown, complete = true): EmailContent {
  if (Buffer.byteLength(JSON.stringify(value) ?? '') > limits.bodyBytes) throw new AppError(413, 'PAYLOAD_TOO_LARGE', 'Template terlalu besar.');
  const parsed = contentSchema.safeParse(value);
  if (!parsed.success) throw new AppError(422, 'VALIDATION_ERROR', 'Template tidak valid.', parsed.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })));
  const c = parsed.data, d = definition(key), seen = new Set<string>();
  for (const block of c.blocks) {
    if (block.type === 'paragraph') {
      if (block.parts.some(p => 'variable' in p && !d.variables.some(v => v.name === p.variable))) throw invalid('blocks', 'Variabel tidak diizinkan.');
      if (block.parts.reduce((n, p) => n + ('text' in p ? p.text.length : 0), 0) > limits.paragraph) throw invalid('blocks', 'Paragraf terlalu panjang.');
      continue;
    }
    const id = block.type === 'action' ? block.targetVariable : block.key;
    if (!(block.type === 'action' ? d.actions : d.systems).includes(id) || seen.has(id)) throw invalid('blocks', 'Blok tidak diizinkan atau duplikat.');
    seen.add(id);
  }
  if (complete && [...d.actions, ...d.systems].some(id => !seen.has(id))) throw invalid('blocks', 'Blok keamanan atau tautan wajib belum lengkap.');
  if (c.style.logoAssetKey && !c.style.logoAlt.trim()) throw invalid('style.logoAlt', 'Teks alternatif logo wajib.');
  return c;
}
function invalid(path: string, message: string) { return new AppError(422, 'VALIDATION_ERROR', 'Template tidak valid.', [{ path, message }]); }
export type RenderValues = { fullName?: string; cardUrl?: string; manageUrl?: string; resetUrl?: string; requestUrl?: string; code?: string; expiryMinutes?: number; retentionExpiresAt?: string };
export type TemplateContext = { key: TemplateKey; values: RenderValues; version?: number | null };
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export function renderEmail(key: TemplateKey, input: EmailContent, values: RenderValues, appUrl: string, test = false) {
  const c = validateContent(key, input), origin = new URL(appUrl).origin;
  function link(value: string | undefined): string {
    if (!value) throw invalid('event', 'Tautan event tidak tersedia.');
    const u = new URL(value);
    if (!['http:', 'https:'].includes(u.protocol) || u.origin !== origin || u.username || u.password) throw invalid('event', 'Origin tautan tidak valid.');
    return u.href;
  }
  function system(id: string): string {
    if (id === 'starterAccessNotice') return 'Tautan pengelolaan berlaku 24 jam dan hanya dapat digunakan sekali. Jangan bagikan tautan ini.';
    if (id === 'passwordResetNotice') return 'Tautan berlaku 30 menit. Jika Anda tidak meminta reset, abaikan email ini.';
    if (id === 'verificationCode') {
      if (!values.code || !Number.isInteger(values.expiryMinutes) || values.expiryMinutes! < 1) throw invalid('event', 'Data OTP tidak lengkap.');
      return 'Kode verifikasi Anda: ' + values.code + '. Kode berlaku ' + values.expiryMinutes + ' menit. Jangan bagikan kode ini.';
    }
    if (!values.retentionExpiresAt || !Number.isFinite(Date.parse(values.retentionExpiresAt))) throw invalid('event', 'Batas unduh tidak tersedia.');
    return 'Tersedia sampai ' + new Date(values.retentionExpiresAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) + ' WIB. ' +
      (key === 'resume.completed' ? 'Unduh melalui member area.' : 'Masa unduh segera berakhir. Segera simpan hasil Anda.');
  }
  const document = c.blocks.map(block => {
    if (block.type === 'action') return { type: 'action' as const, label: block.label, url: test ? null : link(values[block.targetVariable as keyof RenderValues] as string | undefined) };
    if (block.type === 'system') return { type: 'paragraph' as const, parts: [{ text: system(block.key), emphasis: 'normal' as const }], systemKey: block.key };
    return { type: 'paragraph' as const, parts: block.parts.map(p => ({ text: 'text' in p ? p.text : values.fullName || 'Pengguna', emphasis: p.emphasis })) };
  });
  const textBlocks = document.map(b => b.type === 'action' ? b.label + ': ' + (b.url ?? '[tautan uji nonaktif]') : b.parts.map(p => p.text).join(''));
  const htmlBlocks = document.map(b => {
    if (b.type === 'action') return '<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:24px 0"><tr><td bgcolor="' + c.style.accentColor + '" style="border-radius:6px"><a' + (b.url ? ' href="' + escape(b.url) + '"' : '') + ' style="background:' + c.style.accentColor + ';border:1px solid ' + c.style.accentColor + ';border-radius:6px;color:#ffffff;display:inline-block;font-family:Arial,sans-serif;font-size:15px;font-weight:700;line-height:20px;padding:13px 22px;text-decoration:none">' + escape(b.label) + '</a></td></tr></table>';
    const body = b.parts.map(p => { const text = escape(p.text).replace(/\n/g, '<br>'); return p.emphasis === 'normal' ? text : '<' + p.emphasis + '>' + text + '</' + p.emphasis + '>'; }).join('');
    if ('systemKey' in b && b.systemKey === 'verificationCode') {
      return '<div style="background:#eef7f7;border:1px solid #b8d9dc;border-radius:8px;margin:24px 0;padding:20px;text-align:center"><p style="color:#4a5b60;font-size:13px;font-weight:700;letter-spacing:1px;margin:0 0 10px;text-transform:uppercase">Kode verifikasi</p><p style="color:' + c.style.accentColor + ';font-size:30px;font-weight:800;letter-spacing:7px;line-height:38px;margin:0 0 12px">' + escape(values.code ?? '') + '</p><p style="color:#4a5b60;font-size:14px;line-height:21px;margin:0">Berlaku selama ' + escape(String(values.expiryMinutes ?? '')) + ' menit. Jangan bagikan kode ini kepada siapa pun.</p></div>';
    }
    if ('systemKey' in b) return '<div style="background:#f5f7f7;border-left:4px solid ' + c.style.accentColor + ';margin:24px 0;padding:16px 18px"><p style="color:#4a5b60;font-size:14px;line-height:22px;margin:0">' + body + '</p></div>';
    return '<p style="font-size:16px;line-height:25px;margin:0 0 18px">' + body + '</p>';
  });
  const banner = test ? 'EMAIL UJI - data contoh, tautan tidak aktif.' : '';
  const plainText = [banner, c.heading, ...textBlocks, c.footer].filter(Boolean).join('\n\n');
  const logoUrl = c.style.logoAssetKey ? origin + '/assets/kartunama-digital-id.png' : null;
  return {
    subject: (test ? '[UJI] ' : '') + c.subject, plainText,
    document: { heading: c.heading, preheader: c.preheader, blocks: document, footer: c.footer, style: c.style, logoUrl, banner },
    html: '<!doctype html><html lang="id"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="background:#edf1f0;margin:0;padding:0"><span style="display:none!important;font-size:1px;line-height:1px;max-height:0;max-width:0;opacity:0;overflow:hidden">' + escape(c.preheader) + '</span>' +
      '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#edf1f0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:600px"><tr><td style="background:' + c.style.backgroundColor + ';border:1px solid #d9e0df;border-radius:12px;color:' + c.style.textColor + ';font-family:Arial,Helvetica,sans-serif;overflow:hidden"><div style="background:' + c.style.accentColor + ';height:5px;line-height:5px">&nbsp;</div><div style="padding:30px 34px 32px">' +
      (banner ? '<p style="background:#fff3cd;border:1px solid #ead38a;border-radius:6px;color:#6c5512;font-size:13px;font-weight:700;margin:0 0 24px;padding:10px 12px">' + escape(banner) + '</p>' : '') +
      (logoUrl ? '<img width="160" src="' + escape(logoUrl) + '" alt="' + escape(c.style.logoAlt) + '" style="border:0;display:block;height:auto;margin:0 0 24px;max-width:160px">' : '<p style="color:' + c.style.accentColor + ';font-size:13px;font-weight:800;letter-spacing:1.4px;margin:0 0 24px;text-transform:uppercase">KartuNamaDigital.id</p>') +
      '<h1 style="color:' + c.style.textColor + ';font-size:28px;line-height:36px;margin:0 0 24px">' + escape(c.heading) + '</h1>' + htmlBlocks.join('') +
      '<div style="border-top:1px solid #d9e0df;color:#66767a;font-size:13px;line-height:20px;margin-top:30px;padding-top:20px">' + escape(c.footer).replace(/\n/g, '<br>') + '</div></div></td></tr></table></td></tr></table></body></html>',
  };
}
export const dummyValues: RenderValues = { fullName: 'Pengguna Contoh', code: '000000', expiryMinutes: 10, retentionExpiresAt: '2030-01-01T00:00:00Z' };
