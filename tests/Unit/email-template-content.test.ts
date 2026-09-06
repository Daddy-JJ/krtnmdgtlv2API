import assert from 'node:assert/strict';
import test from 'node:test';
import { defaults, renderEmail, templateKeys, validateContent } from '../../src/modules/email/templates/template-content.ts';

test('all seven transactional templates have a complete safe default',()=>{
  assert.equal(templateKeys.length,7);
  for(const key of templateKeys)assert.doesNotThrow(()=>validateContent(key,defaults(key)));
});

test('Starter template renders an editable welcome and keeps required secure actions',()=>{
  const rendered=renderEmail('starter.management',defaults('starter.management'),{fullName:'Dewi <Admin>',cardUrl:'https://kartunamadigital.id/AbCdEfG',manageUrl:'https://kartunamadigital.id/starter/manage/?publicId=x#token=secret'},'https://kartunamadigital.id');
  assert.match(rendered.plainText,/Selamat datang/);
  assert.match(rendered.plainText,/Dewi <Admin>/);
  assert.match(rendered.html,/Dewi &lt;Admin&gt;/);
  assert.match(rendered.plainText,/24 jam/);
  assert.match(rendered.plainText,/token=secret/);
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
