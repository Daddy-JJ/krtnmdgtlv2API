import assert from 'node:assert/strict';
import test from 'node:test';
import { parseEnvironment } from '../../src/config/environment.ts';

test('environment parser validates and coerces the foundation configuration', () => {
  const environment = parseEnvironment({
    DB_DATABASE: 'digital_identity_test',
    DB_USERNAME: 'root',
    CSRF_HMAC_KEY: '0123456789abcdef0123456789abcdef',
    OTP_HMAC_KEY: 'abcdef0123456789abcdef0123456789',
    APP_DEBUG: 'true',
    PORT: '3100',
  });

  assert.equal(environment.APP_ENV, 'local');
  assert.equal(environment.APP_DEBUG, true);
  assert.equal(environment.PORT, 3100);
  assert.equal(environment.DB_PORT, 3306);
  assert.equal(environment.CORS_ALLOWED_ORIGINS, '');
});

test('environment parser reports missing database configuration without secret values', () => {
  assert.throws(
    () => parseEnvironment({ DB_PASSWORD: 'should-never-appear', CSRF_HMAC_KEY: '0123456789abcdef0123456789abcdef', OTP_HMAC_KEY: 'abcdef0123456789abcdef0123456789' }),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /DB_DATABASE/);
      assert.match(error.message, /DB_USERNAME/);
      assert.doesNotMatch(error.message, /should-never-appear/);
      return true;
    },
  );
});

test('production environment requires HTTPS, Secure cookies, and authenticated verified SMTP', () => {
  assert.throws(() => parseEnvironment({
    APP_ENV: 'production',
    APP_URL: 'http://example.com',
    DB_DATABASE: 'digital_identity',
    DB_USERNAME: 'app',
    CSRF_HMAC_KEY: '0123456789abcdef0123456789abcdef',
    OTP_HMAC_KEY: 'abcdef0123456789abcdef0123456789',
    COOKIE_SECURE: 'false',
    MAIL_VERIFY_PEER: 'false',
  }), /APP_URL|COOKIE_SECURE|MAIL_USERNAME|MAIL_PASSWORD|MAIL_VERIFY_PEER/);
});

test('enabled Duitku configuration fails closed without merchant credentials and callback URLs', () => {
  assert.throws(() => parseEnvironment({
    DB_DATABASE: 'digital_identity_test', DB_USERNAME: 'root',
    CSRF_HMAC_KEY: '0123456789abcdef0123456789abcdef', OTP_HMAC_KEY: 'abcdef0123456789abcdef0123456789',
    DUITKU_ENABLED: 'true', DUITKU_SANDBOX_API_KEY: 'must-not-appear-in-error',
  }), (error: unknown) => {
    assert.ok(error instanceof Error);
    assert.match(error.message, /DUITKU_SANDBOX_MERCHANT_CODE|DUITKU_SANDBOX_CALLBACK_URL/);
    assert.doesNotMatch(error.message, /must-not-appear-in-error/);
    return true;
  });
});
