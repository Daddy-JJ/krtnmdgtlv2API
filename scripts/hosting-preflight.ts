import { scrypt } from 'node:crypto';
import { constants, access, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

type Check = Readonly<{
  id: string;
  passed: boolean;
  message: string;
}>;

export type HostingPreflightInput = Readonly<{
  nodeVersion: string;
  scryptAvailable: boolean;
  environment: NodeJS.ProcessEnv;
  packageEngine: string;
  files: Readonly<{
    startup: boolean;
    serverSource: boolean;
    jwtPrivateKey: boolean;
    jwtPublicKey: boolean;
  }>;
  writable: Readonly<{
    privateStorage: boolean;
    qrCache: boolean;
    publicStorage: boolean;
  }>;
}>;

export type HostingPreflightResult = Readonly<{
  ready: boolean;
  passed: number;
  failed: number;
  checks: readonly Check[];
}>;

const present = (value: string | undefined): boolean => typeof value === 'string' && value.length > 0;

function supportedNodeVersion(version: string): boolean {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) return false;
  const major = Number(match[1]);
  const minor = Number(match[2]);
  return major === 22 && minor >= 18;
}

function httpsUrl(value: string | undefined): boolean {
  if (!present(value)) return false;
  try {
    return new URL(value as string).protocol === 'https:';
  } catch {
    return false;
  }
}

export function assessHostingPreflight(input: HostingPreflightInput): HostingPreflightResult {
  const environment = input.environment;
  const checks: Check[] = [];
  const add = (id: string, passed: boolean, message: string): void => {
    checks.push({ id, passed, message });
  };

  add('runtime.node22', supportedNodeVersion(input.nodeVersion), 'Effective application runtime is Node.js >=22.18 and <23.');
  add('runtime.scrypt', input.scryptAvailable, 'The built-in asynchronous scrypt password adapter is available.');
  add('package.engine', input.packageEngine === '>=22.18 <23', 'Package engine matches the locked runtime range.');
  add('file.startup', input.files.startup, 'LiteSpeed Passenger startup file passenger.cjs is readable.');
  add('file.server', input.files.serverSource, 'Backend server source is readable.');
  add('storage.private', input.writable.privateStorage, 'Private storage is writable by the application process.');
  add('storage.qr', input.writable.qrCache, 'QR cache storage is writable by the application process.');
  add('storage.public', input.writable.publicStorage, 'Public upload storage parent is writable by the application process.');
  add('key.private', input.files.jwtPrivateKey, 'JWT private key is readable by the application process.');
  add('key.public', input.files.jwtPublicKey, 'JWT public key is readable by the application process.');
  add('env.mode', environment.APP_ENV === 'staging' || environment.APP_ENV === 'production', 'Application mode is staging or production.');
  add('env.debug', environment.APP_DEBUG === 'false', 'Application debug mode is disabled.');
  add('env.app_url', httpsUrl(environment.APP_URL), 'Public application URL is configured with HTTPS.');
  add('env.database_endpoint', present(environment.DB_HOST) || present(environment.DB_SOCKET), 'Database host or socket is configured.');
  add('env.database_identity', present(environment.DB_DATABASE) && present(environment.DB_USERNAME), 'Database name and least-privilege username are configured.');
  add('env.database_password', present(environment.DB_PASSWORD), 'Database password is configured.');
  add('env.csrf_key', (environment.CSRF_HMAC_KEY?.length ?? 0) >= 32, 'CSRF HMAC key meets the minimum length.');
  add('env.otp_key', (environment.OTP_HMAC_KEY?.length ?? 0) >= 32, 'OTP HMAC key meets the minimum length.');
  add('env.secure_cookie', environment.COOKIE_SECURE === 'true', 'Secure cookies are enabled.');
  add('env.cors', !environment.CORS_ALLOWED_ORIGINS?.split(',').some((origin) => origin.trim() === '*'), 'Credentialed CORS does not contain a wildcard origin.');

  const failed = checks.filter((check) => !check.passed).length;
  return Object.freeze({
    ready: failed === 0,
    passed: checks.length - failed,
    failed,
    checks: Object.freeze(checks),
  });
}

async function readable(path: string): Promise<boolean> {
  try {
    await access(path, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

async function writable(path: string): Promise<boolean> {
  try {
    await access(path, constants.W_OK);
    return true;
  } catch {
    return false;
  }
}

export async function collectHostingPreflight(backendRoot = resolve(import.meta.dirname, '..')): Promise<HostingPreflightResult> {
  let packageEngine = '';
  try {
    const packageJson = JSON.parse(await readFile(resolve(backendRoot, 'package.json'), 'utf8')) as { engines?: { node?: unknown } };
    if (typeof packageJson.engines?.node === 'string') packageEngine = packageJson.engines.node;
  } catch {
    packageEngine = '';
  }

  const [startup, serverSource, jwtPrivateKey, jwtPublicKey, privateStorage, qrCache, publicStorage] = await Promise.all([
    readable(resolve(backendRoot, 'passenger.cjs')),
    readable(resolve(backendRoot, 'src/server.ts')),
    readable(resolve(backendRoot, 'storage/private/jwt-private.pem')),
    readable(resolve(backendRoot, 'storage/private/jwt-public.pem')),
    writable(resolve(backendRoot, 'storage/private')),
    writable(resolve(backendRoot, 'storage/cache/qr')),
    writable(resolve(backendRoot, 'storage/public')),
  ]);

  return assessHostingPreflight({
    nodeVersion: process.version,
    scryptAvailable: typeof scrypt === 'function',
    environment: process.env,
    packageEngine,
    files: { startup, serverSource, jwtPrivateKey, jwtPublicKey },
    writable: { privateStorage, qrCache, publicStorage },
  });
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  const result = await collectHostingPreflight();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  if (!result.ready) process.exitCode = 1;
}
