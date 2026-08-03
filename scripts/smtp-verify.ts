import { loadEnvironment } from '../src/config/environment.ts';
import { CpanelSmtpMailer } from '../src/modules/email/cpanel-smtp-mailer.ts';

try {
  const environment = loadEnvironment();
  const mailer = new CpanelSmtpMailer({
    host: environment.MAIL_HOST, port: environment.MAIL_PORT, encryption: environment.MAIL_ENCRYPTION,
    username: environment.MAIL_USERNAME, password: environment.MAIL_PASSWORD,
    fromAddress: environment.MAIL_FROM_ADDRESS, fromName: environment.MAIL_FROM_NAME,
    replyToAddress: environment.MAIL_REPLY_TO_ADDRESS, timeoutSeconds: environment.MAIL_TIMEOUT_SECONDS,
    verifyPeer: environment.MAIL_VERIFY_PEER,
  });
  await mailer.verifyConnection();
  process.stdout.write(`${JSON.stringify({ smtp: 'available', tlsPeerVerification: environment.MAIL_VERIFY_PEER })}\n`);
} catch {
  process.stderr.write(`${JSON.stringify({ smtp: 'unavailable' })}\n`);
  process.exitCode = 1;
}
