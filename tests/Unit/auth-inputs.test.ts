import assert from 'node:assert/strict';
import test from 'node:test';
import {
  loginInputSchema,
  registerInputSchema,
  resetPasswordInputSchema,
  verifyOtpInputSchema,
} from '../../src/modules/auth/dto/auth-inputs.ts';
import { starterCardInputSchema } from '../../src/modules/auth/dto/starter-input.ts';

test('auth DTOs normalize email and reject unknown or weak input', () => {
  assert.deepEqual(registerInputSchema.parse({ email: ' User@Example.COM ', password: 'password-strong' }), {
    email: 'user@example.com',
    password: 'password-strong',
  });
  assert.equal(registerInputSchema.safeParse({ email: 'user@example.com', password: 'short' }).success, false);
  assert.equal(loginInputSchema.safeParse({ email: 'user@example.com', password: 'x', role: 'admin' }).success, false);
  assert.equal(verifyOtpInputSchema.safeParse({ email: 'user@example.com', code: '12345' }).success, false);
  assert.equal(resetPasswordInputSchema.safeParse({ token: 'short', password: 'password-strong' }).success, false);
});

test('Starter DTO rejects slug/theme injection and unsafe URL protocols', () => {
  const contact = {
    fullName: 'Arwan',
    jobTitle: 'Developer',
    organization: 'KND',
    officePhone: '',
    mobilePhone: '081234567890',
    email: 'arwan@example.com',
    websiteUrl: 'https://example.com',
    addressText: 'Jakarta',
  };

  assert.equal(starterCardInputSchema.safeParse({ contact }).success, true);
  assert.equal(starterCardInputSchema.safeParse({ contact, slug: 'owned-by-client' }).success, false);
  assert.equal(starterCardInputSchema.safeParse({ contact: { ...contact, websiteUrl: 'javascript:alert(1)' } }).success, false);
});
