import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { z } from 'zod';

const booleanValue = z.preprocess((value) => {
  if (typeof value !== 'string') return value;
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  return value;
}, z.boolean());

const optionalString = z.preprocess(
  (value) => (value === '' || value === undefined ? undefined : value),
  z.string().min(1).optional(),
);

const environmentSchema = z.object({
  APP_ENV: z.enum(['local', 'testing', 'staging', 'production']).default('local'),
  APP_DEBUG: booleanValue.default(false),
  APP_URL: z.url().default('http://127.0.0.1:8080'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_SOCKET: optionalString,
  DB_DATABASE: z.string().min(1),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string().default(''),
  DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  CORS_ALLOWED_ORIGINS: z.string().default(''),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  RESUME_CLAMSCAN_PATH: optionalString,
  JWT_PRIVATE_KEY_PATH: z.string().min(1).default('storage/private/jwt-private.pem'),
  JWT_PUBLIC_KEY_PATH: z.string().min(1).default('storage/private/jwt-public.pem'),
  JWT_ISSUER: z.string().min(1).default('kartunamadigital.id'),
  JWT_AUDIENCE: z.string().min(1).default('kartunamadigital-web'),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().min(300).max(3600).default(900),
  REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(90).default(30),
  CSRF_HMAC_KEY: z.string().min(32),
  COOKIE_SECURE: booleanValue.default(false),
  COOKIE_SAMESITE: z.enum(['Lax', 'Strict', 'None']).default('Lax'),
  COOKIE_DOMAIN: optionalString,
  OTP_HMAC_KEY: z.string().min(32),
  OTP_EXPIRY_MINUTES: z.coerce.number().int().min(1).max(30).default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(10).default(5),
  OTP_RESEND_COOLDOWN_SECONDS: z.coerce.number().int().min(30).max(600).default(60),
  OTP_SEND_LIMIT_PER_HOUR: z.coerce.number().int().min(1).max(20).default(5),
  PAYMENT_PROVIDER: z.literal('duitku').default('duitku'),
  PAYMENT_CHECKOUT_ENABLED: booleanValue.default(false),
  DUITKU_SANDBOX_ALLOWED_USER_PUBLIC_IDS: z.string().max(4000).default(''),
  DUITKU_ENABLED: booleanValue.default(false),
  DUITKU_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  DUITKU_SANDBOX_MERCHANT_CODE: z.string().default(''),
  DUITKU_SANDBOX_API_KEY: z.string().default(''),
  DUITKU_SANDBOX_CALLBACK_URL: optionalString,
  DUITKU_SANDBOX_RETURN_URL: optionalString,
  DUITKU_PRODUCTION_MERCHANT_CODE: z.string().default(''),
  DUITKU_PRODUCTION_API_KEY: z.string().default(''),
  DUITKU_PRODUCTION_CALLBACK_URL: optionalString,
  DUITKU_PRODUCTION_RETURN_URL: optionalString,
  DUITKU_HTTP_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(30).default(10),
  DUITKU_EXPIRY_MINUTES: z.coerce.number().int().min(5).max(1440).default(60),
  MAIL_HOST: z.string().min(1).default('mail.kartunamadigital.id'),
  MAIL_PORT: z.coerce.number().int().min(1).max(65535).default(465),
  MAIL_ENCRYPTION: z.enum(['ssl', 'tls']).default('ssl'),
  MAIL_USERNAME: z.string().default(''),
  MAIL_PASSWORD: z.string().default(''),
  MAIL_FROM_ADDRESS: z.string().default('no-reply@kartunamadigital.id'),
  MAIL_FROM_NAME: z.string().default('Kartunama Digital'),
  MAIL_REPLY_TO_ADDRESS: z.string().default('support@kartunamadigital.id'),
  MAIL_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(120).default(15),
  MAIL_VERIFY_PEER: booleanValue.default(true),
  EMAIL_TEMPLATES_ENABLED: booleanValue.default(false),
}).superRefine((value, context) => {
  const invalid = (field: string) => context.addIssue({ code:'custom', path:[field], message:'Payment configuration is invalid.' });
  const sandboxUsers = value.DUITKU_SANDBOX_ALLOWED_USER_PUBLIC_IDS.split(',').map(id => id.trim()).filter(Boolean);
  if (sandboxUsers.some(id => !z.uuid().safeParse(id).success) || sandboxUsers.length > 100
    || (value.PAYMENT_CHECKOUT_ENABLED && value.DUITKU_ENV === 'sandbox' && !sandboxUsers.length)) {
    invalid('DUITKU_SANDBOX_ALLOWED_USER_PUBLIC_IDS');
  }
  if (value.PAYMENT_CHECKOUT_ENABLED && !value.DUITKU_ENABLED) invalid('PAYMENT_CHECKOUT_ENABLED');
  for (const mode of ['SANDBOX','PRODUCTION'] as const) {
    const code = value[`DUITKU_${mode}_MERCHANT_CODE`], key = value[`DUITKU_${mode}_API_KEY`];
    const callback = value[`DUITKU_${mode}_CALLBACK_URL`], returnUrl = value[`DUITKU_${mode}_RETURN_URL`];
    const required = value.DUITKU_ENABLED && (value.DUITKU_ENV.toUpperCase() === mode || !!code || !!key);
    if (!required) continue;
    if (!/^[A-Za-z0-9_-]{1,50}$/.test(code)) invalid(`DUITKU_${mode}_MERCHANT_CODE`);
    if (!key.trim()) invalid(`DUITKU_${mode}_API_KEY`);
    for (const [suffix, url] of [['CALLBACK_URL',callback],['RETURN_URL',returnUrl]] as const) {
      try {
        const u = new URL(url ?? '');
        if ((url?.length??0)>255 || u.username || u.password || u.hash || !['http:','https:'].includes(u.protocol) || (mode === 'PRODUCTION' && u.protocol !== 'https:')
          || (suffix === 'CALLBACK_URL' && (u.pathname !== '/api/v1/payments/duitku/callback' || u.search))) throw new Error();
      } catch { invalid(`DUITKU_${mode}_${suffix}`); }
    }
  }
  if (value.DUITKU_ENABLED && value.DUITKU_SANDBOX_MERCHANT_CODE && value.DUITKU_SANDBOX_MERCHANT_CODE === value.DUITKU_PRODUCTION_MERCHANT_CODE) invalid('DUITKU_PRODUCTION_MERCHANT_CODE');
  for (const origin of value.CORS_ALLOWED_ORIGINS.split(',').map(item => item.trim()).filter(Boolean)) {
    let valid = false;
    try {
      const url = new URL(origin);
      valid = url.origin === origin && ['http:', 'https:'].includes(url.protocol)
        && (value.APP_ENV !== 'production' || url.protocol === 'https:');
    } catch { /* Rejected below without echoing configuration values. */ }
    if (!valid) context.addIssue({ code: 'custom', path: ['CORS_ALLOWED_ORIGINS'], message: 'CORS entries must be exact HTTP(S) origins; production requires HTTPS.' });
  }
  if (value.APP_ENV !== 'production') return;
  if (!value.COOKIE_SECURE) context.addIssue({ code: 'custom', path: ['COOKIE_SECURE'], message: 'Production cookies must be Secure.' });
  if (!value.APP_URL.startsWith('https://')) context.addIssue({ code: 'custom', path: ['APP_URL'], message: 'Production APP_URL must use HTTPS.' });
  if (value.MAIL_USERNAME.trim() === '') context.addIssue({ code: 'custom', path: ['MAIL_USERNAME'], message: 'Production SMTP username is required.' });
  if (value.MAIL_PASSWORD === '') context.addIssue({ code: 'custom', path: ['MAIL_PASSWORD'], message: 'Production SMTP password is required.' });
  if (!value.MAIL_VERIFY_PEER) context.addIssue({ code: 'custom', path: ['MAIL_VERIFY_PEER'], message: 'Production SMTP peer verification is required.' });
});

export type Environment = z.infer<typeof environmentSchema>;

export function parseEnvironment(values: NodeJS.ProcessEnv): Environment {
  const result = environmentSchema.safeParse(values);

  if (!result.success) {
    const fields = result.error.issues.map((issue) => issue.path.join('.') || 'environment');
    throw new Error(`Invalid environment configuration: ${[...new Set(fields)].join(', ')}`);
  }

  if (result.data.DUITKU_ENABLED && values.NODE_TLS_REJECT_UNAUTHORIZED === '0') {
    throw new Error('Invalid environment configuration: NODE_TLS_REJECT_UNAUTHORIZED');
  }
  return result.data;
}

export function loadEnvironment(): Environment {
  const environmentFile = resolve(import.meta.dirname, '../../.env');
  if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
  return parseEnvironment(process.env);
}
