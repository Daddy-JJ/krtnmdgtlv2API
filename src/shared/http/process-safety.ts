import { writeSync } from 'node:fs';
import type { Server } from 'node:http';
import type { Logger } from '../logging/logger.ts';

/** Fatal exceptions must not leave the process accepting requests in corrupt state. */
export function installProcessSafety(server: Server, closeDatabase: () => Promise<void>, logger: Logger): void {
  let stopping = false;
  const fatal = (event: string): never => {
    // Never serialize the exception: it can contain SQL, passwords or tokens.
    try { writeSync(2, `${JSON.stringify({ level: 'error', event })}\n`); } finally { process.exit(1); }
  };
  process.on('uncaughtException', () => fatal('process.uncaught-exception'));
  process.on('unhandledRejection', () => fatal('process.unhandled-rejection'));
  const stop = (signal: string): void => {
    if (stopping) return;
    stopping = true;
    logger.info('server.stopping', { signal });
    const deadline = setTimeout(() => process.exit(1), 10_000);
    deadline.unref();
    server.close(() => {
      void closeDatabase().then(() => { clearTimeout(deadline); process.exit(0); }, () => fatal('process.shutdown-failed'));
    });
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}
