import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const backendRoot = resolve(import.meta.dirname, '..');
const environmentPath = resolve(backendRoot, '.env');

function parseEnvironment(source: string): Map<string, string> {
  const values = new Map<string, string>();
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/);
    if (!match) continue;
    const [, key, rawValue] = match;
    if (key === undefined || rawValue === undefined) continue;
    values.set(key, rawValue.replace(/^['\"]|['\"]$/g, ''));
  }
  return values;
}

const existing = parseEnvironment(await readFile(environmentPath, 'utf8'));
const value = (key: string, fallback = '') => {
  const configured = existing.get(key)?.trim();
  return configured === '' || configured === undefined ? fallback : configured;
};
const generated = () => randomBytes(48).toString('base64url');
const lines = [
  'APP_NAME="Digital Identity Platform"',
  'APP_ENV=local',
  'APP_DEBUG=true',
  'APP_URL=http://kartunamadigital.test',
  'APP_TIMEZONE=Asia/Jakarta',
  `PORT=${value('PORT', '3000')}`,
  '',
  `DB_HOST=${value('DB_HOST', '127.0.0.1')}`,
  `DB_PORT=${value('DB_PORT', '3306')}`,
  'DB_SOCKET=',
  `DB_DATABASE=${value('DB_DATABASE', value('DB_NAME', 'krtnmdgtlv2'))}`,
  `DB_USERNAME=${value('DB_USERNAME', value('DB_USER', 'root'))}`,
  `DB_PASSWORD=${value('DB_PASSWORD')}`,
  `DB_CONNECTION_LIMIT=${value('DB_CONNECTION_LIMIT', '10')}`,
  '',
  `CORS_ALLOWED_ORIGINS=${value('CORS_ALLOWED_ORIGINS', value('CORS_ORIGIN', 'http://kartunamadigital.test'))}`,
  '',
  'JWT_PRIVATE_KEY_PATH=storage/private/jwt-private.pem',
  'JWT_PUBLIC_KEY_PATH=storage/private/jwt-public.pem',
  'JWT_ISSUER=kartunamadigital.test',
  'JWT_AUDIENCE=kartunamadigital-web',
  'ACCESS_TOKEN_TTL_SECONDS=900',
  'REFRESH_TOKEN_TTL_DAYS=30',
  `CSRF_HMAC_KEY=${value('CSRF_HMAC_KEY', generated())}`,
  `OTP_HMAC_KEY=${value('OTP_HMAC_KEY', generated())}`,
  '',
  'COOKIE_SECURE=false',
  'COOKIE_SAMESITE=Lax',
  'COOKIE_DOMAIN=',
  '',
  'MIDTRANS_ENABLED=false',
  'MIDTRANS_ENV=sandbox',
  'MIDTRANS_SERVER_KEY=',
  'MIDTRANS_CLIENT_KEY=',
  'MIDTRANS_MERCHANT_ID=',
  'MIDTRANS_HTTP_TIMEOUT_SECONDS=10',
  '',
  'MAIL_HOST=mail.kartunamadigital.id',
  'MAIL_PORT=465',
  'MAIL_ENCRYPTION=ssl',
  `MAIL_USERNAME=${value('MAIL_USERNAME')}`,
  `MAIL_PASSWORD=${value('MAIL_PASSWORD')}`,
  'MAIL_FROM_ADDRESS=no-reply@kartunamadigital.id',
  'MAIL_FROM_NAME="Kartunama Digital"',
  'MAIL_REPLY_TO_ADDRESS=support@kartunamadigital.id',
  'MAIL_TIMEOUT_SECONDS=15',
  'MAIL_VERIFY_PEER=true',
  'OTP_EXPIRY_MINUTES=10',
  'OTP_MAX_ATTEMPTS=5',
  'OTP_RESEND_COOLDOWN_SECONDS=60',
  'OTP_SEND_LIMIT_PER_HOUR=5',
  '',
];

await writeFile(environmentPath, lines.join('\n'), { mode: 0o600 });
process.stdout.write('Local environment initialized. Generated secret values were written to .env and were not printed.\n');
