import assert from 'node:assert/strict';
import test from 'node:test';
import express, { type Request, type Response } from 'express';
import type { AddressInfo } from 'node:net';
import nodemailer, { type SendMailOptions, type Transporter } from 'nodemailer';
import { CpanelSmtpMailer } from '../../src/modules/email/cpanel-smtp-mailer.ts';
import { createLogoRouter } from '../../src/modules/uploads/logo/logo-router.ts';
import type { LogoController } from '../../src/modules/uploads/logo/logo-controller.ts';
import { createResumeRequestRouter } from '../../src/modules/resume-service/routes/resume-router.ts';
import type { ResumeController } from '../../src/modules/resume-service/controllers/resume-controller.ts';
import type { ResumeFileController } from '../../src/modules/resume-service/files/resume-file-controller.ts';
import { errorHandler } from '../../src/shared/http/error-handler.ts';

const smtp = {
  host: 'mail.example.test', port: 465, encryption: 'ssl' as const,
  username: 'sender@example.test', password: 'test-only-not-a-secret',
  fromAddress: 'sender@example.test', fromName: 'Kartunama Digital',
  replyToAddress: 'support@example.test', timeoutSeconds: 15, verifyPeer: true,
};

test('updated SMTP transport preserves certificate checks, STARTTLS, auth and timeouts without connecting', t => {
  const options: Array<Record<string, unknown>> = [];
  t.mock.method(nodemailer, 'createTransport', (value: unknown) => {
    options.push(value as Record<string, unknown>);
    return {} as Transporter;
  });
  new CpanelSmtpMailer(smtp);
  new CpanelSmtpMailer({ ...smtp, port: 587, encryption: 'tls' });
  assert.equal(options[0]?.secure, true);
  assert.equal(options[1]?.secure, false);
  assert.equal(options[1]?.requireTLS, true);
  for (const option of options) {
    assert.deepEqual(option.tls, { rejectUnauthorized: true });
    assert.deepEqual(option.auth, { user: smtp.username, pass: smtp.password });
    assert.equal(option.connectionTimeout, 15000);
    assert.equal(option.socketTimeout, 15000);
  }
});

test('updated real Nodemailer renders OTP, reset, notification and multipart templates only in memory', async () => {
  const stream = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' });
  const rendered: string[] = [];
  const transport = { sendMail: async (value: SendMailOptions) => {
    const result = await stream.sendMail(value);
    rendered.push(result.message.toString());
    assert.deepEqual(result.envelope.to, ['recipient@example.test']);
    return result;
  } } as unknown as Transporter;
  const mailer = new CpanelSmtpMailer(smtp, transport);
  try {
    await mailer.sendRegistrationOtp('recipient@example.test', '123456', 10);
    await mailer.sendPasswordReset('recipient@example.test', 'https://example.test/reset-password/#token=test-only');
    await mailer.sendNotification('recipient@example.test', 'Notification', 'Safe notification');
    await mailer.sendRendered('recipient@example.test', 'Template', 'Plain fallback', '<p>Safe HTML</p>');
    assert.equal(rendered.length, 4);
    for (const message of rendered) {
      assert.match(message, /From: Kartunama Digital <sender@example\.test>/);
      assert.match(message, /Reply-To: support@example\.test/);
      assert.doesNotMatch(message, /test-only-not-a-secret/);
    }
    assert.match(rendered[0]!, /123456/);
    const decodedReset = rendered[1]!.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(Number.parseInt(hex, 16)));
    assert.match(decodedReset, /https:\/\/example\.test\/reset-password\/#token=test-only/);
    assert.match(rendered[3]!, /multipart\/alternative/);
    assert.match(rendered[3]!, /Plain fallback/);
    assert.match(rendered[3]!, /Safe HTML/);
  } finally { stream.close(); }
});

test('updated real Multer preserves logo/resume upload limits and rejects malformed multipart before handlers', async () => {
  let hits = 0;
  const upload = (req: Request, res: Response) => {
    hits++;
    assert.equal(req.file?.originalname, 'fixture.bin');
    assert.equal(req.file?.buffer.toString(), 'fixture');
    res.json({ ok: true });
  };
  const noop = (_req: Request, res: Response) => { res.end(); };
  const app = express();
  app.use('/logos', createLogoRouter({ upload } as unknown as LogoController));
  app.use('/resumes', createResumeRequestRouter({ list: noop, create: noop, detail: noop, revision: noop } as unknown as ResumeController,
    { upload, download: noop, downloadFile: noop } as unknown as ResumeFileController));
  app.use(errorHandler({ info() {}, error() {} }, false));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for (const [path, limit, code] of [
      ['/logos/card/logo', 5 * 1024 * 1024, 'UPLOAD_TOO_LARGE'],
      ['/resumes/request/files', 10 * 1024 * 1024, 'RESUME_FILE_TOO_LARGE'],
    ] as const) {
      const form = new FormData();
      form.set('file', new Blob(['fixture']), 'fixture.bin');
      if (path.startsWith('/resumes')) form.set('role', 'SOURCE_RESUME');
      assert.equal((await fetch(base + path, { method: 'POST', body: form })).status, 200);
      const before = hits;
      const large = new FormData();
      large.set('file', new Blob([new Uint8Array(limit + 1)]), 'fixture.bin');
      const tooLarge = await fetch(base + path, { method: 'POST', body: large });
      assert.equal(tooLarge.status, 413);
      assert.equal((await tooLarge.json() as { code: string }).code, code);
      const duplicate = new FormData();
      duplicate.append('file', new Blob(['fixture']), 'fixture.bin');
      duplicate.append('file', new Blob(['fixture']), 'fixture.bin');
      assert.equal((await fetch(base + path, { method: 'POST', body: duplicate })).status, 413);
      const fields = new FormData();
      fields.set('file', new Blob(['fixture']), 'fixture.bin');
      fields.set('unexpected', 'value'); fields.set('other', 'value');
      assert.equal((await fetch(base + path, { method: 'POST', body: fields })).status, 413);
      const malformed = await fetch(base + path, { method: 'POST', headers: { 'content-type': 'multipart/form-data; boundary=fixture' }, body: '--fixture\r\nContent-Disposition: form-data; name="file"; filename="fixture.bin"\r\n\r\nunterminated' });
      assert.equal(malformed.status, 413);
      assert.doesNotMatch(await malformed.text(), /stack|node_modules|Unexpected end/);
      assert.equal(hits, before);
    }
    assert.equal(hits, 2);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
});
