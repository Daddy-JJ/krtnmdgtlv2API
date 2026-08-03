import type { AuthRepository } from '../auth/repositories/auth-repository.ts';
import type { OpaqueTokenService } from '../../shared/security/opaque-token.ts';
import type { MailerPort } from './mailer-port.ts';
import type { MySqlMailOutboxRepository } from './mail-outbox-repository.ts';

export class PasswordResetMailWorker {
  readonly #outbox: MySqlMailOutboxRepository;
  readonly #auth: AuthRepository;
  readonly #tokens: OpaqueTokenService;
  readonly #mailer: MailerPort;
  readonly #appUrl: string;

  constructor(dependencies: { outbox: MySqlMailOutboxRepository; auth: AuthRepository; tokens: OpaqueTokenService; mailer: MailerPort; appUrl: string }) {
    this.#outbox = dependencies.outbox;
    this.#auth = dependencies.auth;
    this.#tokens = dependencies.tokens;
    this.#mailer = dependencies.mailer;
    this.#appUrl = dependencies.appUrl;
  }

  async runOnce(): Promise<boolean> {
    const job = await this.#outbox.claimPasswordReset();
    if (!job) return false;
    const issued = this.#tokens.issue();
    const now = new Date();
    try {
      await this.#auth.transaction((transaction) => transaction.insertPasswordReset({ userId: job.userId, tokenHash: issued.hash, expiresAt: new Date(now.getTime() + 30 * 60_000), now }));
      await this.#mailer.sendPasswordReset(job.email, `${this.#appUrl}/reset-password/?token=${encodeURIComponent(issued.plaintext)}`);
      await this.#outbox.markSent(job);
      return true;
    } catch {
      await this.#outbox.markFailed(job);
      return false;
    }
  }
}
