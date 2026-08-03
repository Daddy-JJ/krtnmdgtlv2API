import assert from 'node:assert/strict';
import test from 'node:test';
import type { Transporter } from 'nodemailer';
import { CpanelSmtpMailer } from '../../src/modules/email/cpanel-smtp-mailer.ts';

test('SMTP adapter verifies the transport and sends server-owned safe fields', async () => {
  let verified = false;
  const messages: unknown[] = [];
  const transporter = {
    verify: async () => { verified = true; return true; },
    sendMail: async (message: unknown) => { messages.push(message); return {}; },
  } as unknown as Transporter;
  const mailer = new CpanelSmtpMailer({
    host: 'mail.kartunamadigital.id', port: 465, encryption: 'ssl', username: 'no-reply@kartunamadigital.id',
    password: 'not-logged', fromAddress: 'no-reply@kartunamadigital.id', fromName: 'Kartunama "Digital"',
    replyToAddress: 'support@kartunamadigital.id', timeoutSeconds: 15, verifyPeer: true,
  }, transporter);

  await mailer.verifyConnection();
  await mailer.sendRegistrationOtp('recipient@example.test', '123456', 10);
  assert.equal(verified, true);
  assert.equal(messages.length, 1);
  assert.match(JSON.stringify(messages[0]), /no-reply@kartunamadigital\.id/);
  assert.match(JSON.stringify(messages[0]), /support@kartunamadigital\.id/);
  assert.doesNotMatch(JSON.stringify(messages[0]), /not-logged/);
});
