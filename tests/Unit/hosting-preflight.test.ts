import assert from 'node:assert/strict';
import test from 'node:test';
import { assessHostingPreflight, type HostingPreflightInput } from '../../scripts/hosting-preflight.ts';

const validInput: HostingPreflightInput = {
  nodeVersion: 'v22.18.0',
  argon2idAvailable: true,
  packageEngine: '>=22.18 <23',
  environment: {
    APP_ENV: 'staging',
    APP_DEBUG: 'false',
    APP_URL: 'https://staging.kartunamadigital.id',
    DB_HOST: 'localhost',
    DB_DATABASE: 'account_database',
    DB_USERNAME: 'account_user',
    DB_PASSWORD: 'database-secret-value',
    CSRF_HMAC_KEY: '0123456789abcdef0123456789abcdef',
    OTP_HMAC_KEY: 'abcdef0123456789abcdef0123456789',
    COOKIE_SECURE: 'true',
    CORS_ALLOWED_ORIGINS: '',
  },
  files: { startup: true, serverSource: true, jwtPrivateKey: true, jwtPublicKey: true },
  writable: { privateStorage: true, qrCache: true, publicStorage: true },
};

test('hosting preflight accepts only the complete Node.js 22 shared-hosting baseline', () => {
  const result = assessHostingPreflight(validInput);
  assert.equal(result.ready, true);
  assert.equal(result.failed, 0);
  assert.equal(result.passed, 20);
});

test('hosting preflight fails closed for unsupported Node.js 24, missing controls, and wildcard CORS', () => {
  const result = assessHostingPreflight({
    ...validInput,
    nodeVersion: 'v24.18.0',
    argon2idAvailable: false,
    environment: {
      ...validInput.environment,
      APP_DEBUG: 'true',
      APP_URL: 'http://staging.example.test',
      DB_PASSWORD: '',
      CSRF_HMAC_KEY: 'short',
      COOKIE_SECURE: 'false',
      CORS_ALLOWED_ORIGINS: '*',
    },
    files: { ...validInput.files, jwtPrivateKey: false },
  });

  assert.equal(result.ready, false);
  assert.ok(result.failed >= 9);
  assert.equal(result.checks.find((check) => check.id === 'runtime.node22')?.passed, false);
  assert.equal(result.checks.find((check) => check.id === 'env.cors')?.passed, false);
});

test('hosting preflight output never contains environment secret values', () => {
  const serialized = JSON.stringify(assessHostingPreflight(validInput));
  assert.doesNotMatch(serialized, /database-secret-value/);
  assert.doesNotMatch(serialized, /0123456789abcdef/);
  assert.doesNotMatch(serialized, /account_user/);
});
