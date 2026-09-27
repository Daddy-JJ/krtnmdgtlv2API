import { loadEnvironment } from '../src/config/environment.ts';
import { MySqlAuthRepository } from '../src/modules/auth/repositories/mysql-auth-repository.ts';
import { CpanelSmtpMailer } from '../src/modules/email/cpanel-smtp-mailer.ts';
import { MySqlMailOutboxRepository } from '../src/modules/email/mail-outbox-repository.ts';
import { PasswordResetMailWorker } from '../src/modules/email/password-reset-mail-worker.ts';
import { createDatabasePool } from '../src/shared/database/pool.ts';
import { OpaqueTokenService } from '../src/shared/security/opaque-token.ts';
import { ResumeNotificationMailWorker } from '../src/modules/email/resume-notification-mail-worker.ts';
import { MySqlEmailTemplateRepository } from '../src/modules/email/templates/mysql-email-template-repository.ts';
import { EmailTemplateDelivery } from '../src/modules/email/templates/email-template-delivery.ts';
import { defaults, type TemplateKey } from '../src/modules/email/templates/template-content.ts';
import { withMailWorkerLock } from '../src/modules/email/mail-worker-lock.ts';

const environment = loadEnvironment();
const pool = createDatabasePool(environment);
const lockPool = createDatabasePool({ ...environment, DB_CONNECTION_LIMIT: 1 });
const mailer = new CpanelSmtpMailer({
  host: environment.MAIL_HOST, port: environment.MAIL_PORT, encryption: environment.MAIL_ENCRYPTION,
  username: environment.MAIL_USERNAME, password: environment.MAIL_PASSWORD,
  fromAddress: environment.MAIL_FROM_ADDRESS, fromName: environment.MAIL_FROM_NAME,
  replyToAddress: environment.MAIL_REPLY_TO_ADDRESS, timeoutSeconds: environment.MAIL_TIMEOUT_SECONDS,
  verifyPeer: environment.MAIL_VERIFY_PEER,
});
const templates=new MySqlEmailTemplateRepository(pool),templateSource=environment.EMAIL_TEMPLATES_ENABLED?templates:{published:async(key:TemplateKey)=>({content:defaults(key),version:null})};
const outbox = new MySqlMailOutboxRepository(pool);

try {
  const ran = await withMailWorkerLock(lockPool, environment.DB_DATABASE, async assertHeld => {
    const delivery = new EmailTemplateDelivery({ repository: templateSource, mailer, appUrl: environment.APP_URL, beforeSend: assertHeld });
    const worker = new PasswordResetMailWorker({ outbox, auth: new MySqlAuthRepository(pool), tokens: new OpaqueTokenService(), delivery, appUrl: environment.APP_URL });
    const resumeWorker = new ResumeNotificationMailWorker({ outbox, delivery, appUrl: environment.APP_URL });
    const recovered = await outbox.requeueStaleProcessing();
    if (recovered > 0) process.stdout.write(`Requeued ${recovered} stale mail job(s).\n`);
    let processed = 0;
    for (const run of [() => worker.runOnce(), () => resumeWorker.runOnce(), () => delivery.workTest()]) {
      while (processed < 50) {
        await assertHeld();
        if (!await run()) break;
        processed += 1;
      }
    }
    process.stdout.write(`Processed ${processed} mail job(s).\n`);
  });
  if (!ran) process.stdout.write('Mail worker already running; skipped.\n');
} catch {
  process.stderr.write('Mail worker stopped: lock or processing unavailable.\n');
  process.exitCode = 1;
} finally { await Promise.all([pool.end(), lockPool.end()]); }
