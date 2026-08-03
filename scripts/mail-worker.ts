import { loadEnvironment } from '../src/config/environment.ts';
import { MySqlAuthRepository } from '../src/modules/auth/repositories/mysql-auth-repository.ts';
import { CpanelSmtpMailer } from '../src/modules/email/cpanel-smtp-mailer.ts';
import { MySqlMailOutboxRepository } from '../src/modules/email/mail-outbox-repository.ts';
import { PasswordResetMailWorker } from '../src/modules/email/password-reset-mail-worker.ts';
import { createDatabasePool } from '../src/shared/database/pool.ts';
import { OpaqueTokenService } from '../src/shared/security/opaque-token.ts';
import { ResumeNotificationMailWorker } from '../src/modules/email/resume-notification-mail-worker.ts';

const environment = loadEnvironment();
const pool = createDatabasePool(environment);
const mailer = new CpanelSmtpMailer({
  host: environment.MAIL_HOST, port: environment.MAIL_PORT, encryption: environment.MAIL_ENCRYPTION,
  username: environment.MAIL_USERNAME, password: environment.MAIL_PASSWORD,
  fromAddress: environment.MAIL_FROM_ADDRESS, fromName: environment.MAIL_FROM_NAME,
  replyToAddress: environment.MAIL_REPLY_TO_ADDRESS, timeoutSeconds: environment.MAIL_TIMEOUT_SECONDS,
  verifyPeer: environment.MAIL_VERIFY_PEER,
});
const worker = new PasswordResetMailWorker({ outbox: new MySqlMailOutboxRepository(pool), auth: new MySqlAuthRepository(pool), tokens: new OpaqueTokenService(), mailer, appUrl: environment.APP_URL });
const resumeWorker=new ResumeNotificationMailWorker({outbox:new MySqlMailOutboxRepository(pool),mailer,appUrl:environment.APP_URL});

try {
  let processed = 0;
  while (processed < 50 && await worker.runOnce()) processed += 1;
  while(processed<50&&await resumeWorker.runOnce())processed+=1;
  process.stdout.write(`Processed ${processed} mail job(s).\n`);
} finally { await pool.end(); }
