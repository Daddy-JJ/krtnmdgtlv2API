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
  const d = definition(key);
  const subject = key === 'starter.management' ? 'Kelola kartu Starter Anda'
    : key === 'auth.registration-otp' ? 'Kode verifikasi Kartunama Digital'
    : key === 'auth.password-reset' ? 'Reset password Kartunama Digital'
    : key === 'resume.completed' ? 'Resume Enhancement Anda siap' : 'Masa unduh Resume Enhancement';
  const starter=key==='starter.management';
  return {
    schemaVersion: 1, locale: 'id', subject, preheader: starter?'Selamat datang. Kartu digital Anda sudah siap.':'', heading: starter?'Selamat datang di KartuNamaDigital.id':'', footer: '',
    blocks: [
      ...(starter?[{type:'paragraph' as const,parts:[{text:'Halo ',emphasis:'normal' as const},{variable:'fullName' as const,emphasis:'strong' as const},{text:', kartu digital Anda sudah berhasil dibuat.',emphasis:'normal' as const}]}]:[]),
      ...(key === 'resume.completed' ? [{ type: 'paragraph' as const, parts: [{ text: 'Resume Enhancement Anda sudah siap.', emphasis: 'normal' as const }] }] : []),
      ...d.actions.map(targetVariable => ({ type: 'action' as const, targetVariable, label: targetVariable === 'cardUrl' ? 'Kartu Anda' : targetVariable === 'manageUrl' ? 'Kelola kartu' : targetVariable === 'resetUrl' ? 'Reset password' : 'Buka member area' })),
      ...d.systems.map(systemKey => ({ type: 'system' as const, key: systemKey })),
    ],
    style: { logoAssetKey: null, logoAlt: '', backgroundColor: '#ffffff', textColor: '#172033', accentColor: '#006b80' },
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
    if (block.type === 'system') return { type: 'paragraph' as const, parts: [{ text: system(block.key), emphasis: 'normal' as const }] };
    return { type: 'paragraph' as const, parts: block.parts.map(p => ({ text: 'text' in p ? p.text : values.fullName || 'Pengguna', emphasis: p.emphasis })) };
  });
  const textBlocks = document.map(b => b.type === 'action' ? b.label + ': ' + (b.url ?? '[tautan uji nonaktif]') : b.parts.map(p => p.text).join(''));
  const htmlBlocks = document.map(b => b.type === 'action'
    ? '<p><a style="color:' + c.style.accentColor + '"' + (b.url ? ' href="' + escape(b.url) + '"' : '') + '>' + escape(b.label) + '</a></p>'
    : '<p>' + b.parts.map(p => { const text = escape(p.text).replace(/\n/g, '<br>'); return p.emphasis === 'normal' ? text : '<' + p.emphasis + '>' + text + '</' + p.emphasis + '>'; }).join('') + '</p>');
  const banner = test ? 'EMAIL UJI - data contoh, tautan tidak aktif.' : '';
  const plainText = [banner, c.heading, ...textBlocks, c.footer].filter(Boolean).join('\n');
  const logoUrl = c.style.logoAssetKey ? origin + '/assets/kartunama-digital-id.png' : null;
  return {
    subject: (test ? '[UJI] ' : '') + c.subject, plainText,
    document: { heading: c.heading, preheader: c.preheader, blocks: document, footer: c.footer, style: c.style, logoUrl, banner },
    html: '<!doctype html><html lang="id"><body style="background:' + c.style.backgroundColor + ';color:' + c.style.textColor + ';font-family:Arial,sans-serif"><main style="max-width:600px;margin:auto;padding:24px">' +
      (banner ? '<p>' + banner + '</p>' : '') + (logoUrl ? '<img width="160" src="' + escape(logoUrl) + '" alt="' + escape(c.style.logoAlt) + '">' : '') +
      '<span style="display:none">' + escape(c.preheader) + '</span><h1>' + escape(c.heading) + '</h1>' + htmlBlocks.join('') + '<p>' + escape(c.footer).replace(/\n/g, '<br>') + '</p></main></body></html>',
  };
}
export const dummyValues: RenderValues = { fullName: 'Pengguna Contoh', code: '000000', expiryMinutes: 10, retentionExpiresAt: '2030-01-01T00:00:00Z' };
