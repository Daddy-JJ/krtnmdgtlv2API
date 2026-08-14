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
  APP_URL: z.url().default('http://localhost:3000'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  DB_HOST: z.string().min(1).default('127.0.0.1'),
  DB_PORT: z.coerce.number().int().min(1).max(65535).default(3306),
  DB_SOCKET: optionalString,
  DB_DATABASE: z.string().min(1),
  DB_USERNAME: z.string().min(1),
  DB_PASSWORD: z.string().default(''),
  DB_CONNECTION_LIMIT: z.coerce.number().int().min(1).max(100).default(10),
  CORS_ALLOWED_ORIGINS: z.string().default(''),
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
  MIDTRANS_ENABLED: booleanValue.default(false),
  MIDTRANS_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  MIDTRANS_SERVER_KEY: z.string().default(''),
  MIDTRANS_CLIENT_KEY: z.string().default(''),
  MIDTRANS_MERCHANT_ID: z.string().default(''),
  MIDTRANS_NOTIFICATION_URL: optionalString,
  MIDTRANS_FINISH_URL: optionalString,
  MIDTRANS_UNFINISH_URL: optionalString,
  MIDTRANS_ERROR_URL: optionalString,
  MIDTRANS_HTTP_TIMEOUT_SECONDS: z.coerce.number().int().min(1).max(60).default(10),
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
}).superRefine((value, context) => {
  if (value.MIDTRANS_ENABLED) {
    for (const field of ['MIDTRANS_SERVER_KEY', 'MIDTRANS_CLIENT_KEY', 'MIDTRANS_MERCHANT_ID'] as const) {
      if (value[field].trim() === '') context.addIssue({ code: 'custom', path: [field], message: `${field} is required when Midtrans is enabled.` });
    }
    for (const field of ['MIDTRANS_NOTIFICATION_URL', 'MIDTRANS_FINISH_URL', 'MIDTRANS_UNFINISH_URL', 'MIDTRANS_ERROR_URL'] as const) {
      const url = value[field];
      if (!url || !URL.canParse(url) || (value.APP_ENV === 'production' && !url.startsWith('https://'))) context.addIssue({ code: 'custom', path: [field], message: `${field} must be a valid${value.APP_ENV === 'production' ? ' HTTPS' : ''} URL.` });
    }
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

  return result.data;
}

export function loadEnvironment(): Environment {
  const environmentFile = resolve(import.meta.dirname, '../../../.env');
  if (existsSync(environmentFile)) process.loadEnvFile(environmentFile);
  return parseEnvironment(process.env);
}
