import assert from 'node:assert/strict';
import test from 'node:test';
import { defaults, renderEmail, templateKeys, validateContent } from '../../src/modules/email/templates/template-content.ts';

test('all seven transactional templates have a complete safe default',()=>{
  assert.equal(templateKeys.length,7);
  for(const key of templateKeys)assert.doesNotThrow(()=>validateContent(key,defaults(key)));
});

test('professional defaults use the approved Indonesian subjects and action labels',()=>{
  const expected = {
    'starter.management': ['Kartu digital Anda sudah siap', ['Lihat kartu', 'Kelola kartu']],
    'auth.registration-otp': ['Kode verifikasi akun Anda', []],
    'auth.password-reset': ['Atur ulang password akun Anda', ['Reset password']],
    'resume.completed': ['Resume Anda sudah siap diunduh', ['Buka member area']],
    'resume.retention-30-days': ['Masa unduh resume Anda masih 30 hari', ['Unduh resume']],
    'resume.retention-7-days': ['Pengingat: masa unduh resume berakhir dalam 7 hari', ['Unduh resume']],
    'resume.retention-1-days': ['Penting: masa unduh resume berakhir besok', ['Unduh sekarang']],
  } as const;
  for (const key of templateKeys) {
    const content = defaults(key);
    assert.equal(content.subject, expected[key][0]);
    assert.deepEqual(content.blocks.filter(block => block.type === 'action').map(block => block.type === 'action' ? block.label : ''), expected[key][1]);
    assert.notEqual(content.preheader, '');
    assert.notEqual(content.heading, '');
    assert.notEqual(content.footer, '');
  }
});

test('Starter template renders an editable welcome and keeps required secure actions',()=>{
  const rendered=renderEmail('starter.management',defaults('starter.management'),{fullName:'Dewi <Admin>',cardUrl:'https://kartunamadigital.id/AbCdEfG',manageUrl:'https://kartunamadigital.id/starter/manage/?publicId=x#token=secret'},'https://kartunamadigital.id');
  assert.match(rendered.plainText,/Selamat datang/);
  assert.match(rendered.plainText,/Dewi <Admin>/);
  assert.match(rendered.html,/Dewi &lt;Admin&gt;/);
  assert.match(rendered.plainText,/24 jam/);
  assert.match(rendered.plainText,/token=secret/);
});

test('shared HTML renderer uses an email-safe branded card, CTA button, and security notice',()=>{
  const rendered=renderEmail('starter.management',defaults('starter.management'),{fullName:'Dewi',cardUrl:'https://kartunamadigital.id/AbCdEfG',manageUrl:'https://kartunamadigital.id/starter/manage/?publicId=x#token=secret'},'https://kartunamadigital.id');
  assert.match(rendered.html,/meta name="viewport"/);
  assert.match(rendered.html,/table role="presentation"/);
  assert.match(rendered.html,/KartuNamaDigital\.id/);
  assert.match(rendered.html,/background:#006b80/);
  assert.match(rendered.html,/color:#ffffff;display:inline-block/);
  assert.match(rendered.html,/border-left:4px solid #006b80/);
  assert.doesNotMatch(rendered.html,/<script|tracking|pixel/i);
});

test('OTP renderer presents the code prominently while preserving the safe plain-text fallback',()=>{
  const rendered=renderEmail('auth.registration-otp',defaults('auth.registration-otp'),{code:'123456',expiryMinutes:10},'https://kartunamadigital.id');
  assert.match(rendered.html,/letter-spacing:7px[^>]*>123456</);
  assert.match(rendered.html,/Berlaku selama 10 menit/);
  assert.match(rendered.plainText,/Kode verifikasi Anda: 123456/);
  assert.match(rendered.plainText,/Jangan bagikan kode ini/);
});

test('resume reminder defaults retain event-owned action and mandatory retention notice',()=>{
  for(const key of ['resume.completed','resume.retention-30-days','resume.retention-7-days','resume.retention-1-days'] as const){
    const rendered=renderEmail(key,defaults(key),{requestUrl:'https://kartunamadigital.id/app/resume-enhancement/',retentionExpiresAt:'2030-01-01T00:00:00Z'},'https://kartunamadigital.id');
    assert.match(rendered.html,/href="https:\/\/kartunamadigital\.id\/app\/resume-enhancement\/"/);
    assert.match(rendered.plainText,/Tersedia sampai/);
  }
});

test('templates reject missing required blocks, raw HTML, foreign links and header injection',()=>{
  const starter=defaults('starter.management');
  assert.throws(()=>validateContent('starter.management',{...starter,blocks:[]}));
  assert.throws(()=>validateContent('starter.management',{...starter,subject:'Hello\r\nBcc: victim@example.test'}));
  assert.throws(()=>validateContent('starter.management',{...starter,footer:'<script>alert(1)</script>'}));
  assert.throws(()=>renderEmail('starter.management',starter,{cardUrl:'https://evil.example/card',manageUrl:'https://kartunamadigital.id/manage'},'https://kartunamadigital.id'));
});

test('test preview uses dummy values and never exposes an active action URL',()=>{
  const rendered=renderEmail('auth.password-reset',defaults('auth.password-reset'),{},'https://kartunamadigital.id',true);
  assert.match(rendered.subject,/^\[UJI\]/);
  assert.doesNotMatch(rendered.html,/href=/);
  assert.match(rendered.plainText,/tautan uji nonaktif/);
});
