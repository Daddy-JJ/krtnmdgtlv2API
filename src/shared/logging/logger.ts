export type LogContext = Readonly<Record<string, boolean | number | string | null>>;

export interface Logger {
  info(event: string, context?: LogContext): void;
  error(event: string, context?: LogContext): void;
}

function write(level: 'info' | 'error', event: string, context: LogContext = {}): void {
  const record = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...context,
  });

  if (level === 'error') process.stderr.write(`${record}\n`);
  else process.stdout.write(`${record}\n`);
}

export const jsonLogger: Logger = {
  info: (event, context) => write('info', event, context),
  error: (event, context) => write('error', event, context),
};
