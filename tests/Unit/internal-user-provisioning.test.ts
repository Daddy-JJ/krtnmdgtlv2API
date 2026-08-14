import assert from 'node:assert/strict';
import test from 'node:test';
import { internalAccounts, parseProvisioningInput } from '../../scripts/provision-internal-users.ts';

const validEnvironment = Object.freeze({
  KND_PROVISION_CONFIRM: 'PROVISION_INTERNAL_USERS',
  KND_SUPER_ADMIN_PASSWORD: 'Admin-Unique-2026!',
  KND_CV_SPECIALIST_PASSWORD: 'Specialist-Unique-2026!',
});

test('internal account identities and least-privilege roles are fixed', () => {
  assert.deepEqual(
    internalAccounts.map(({ email, role }) => ({ email, role })),
    [
      { email: 'admin@kartunamadigital.id', role: 'super_admin' },
      { email: 'cv-specialist@kartunamadigital.id', role: 'cv_specialist' },
    ],
  );
});

test('provisioning requires an explicit confirmation phrase', () => {
  assert.throws(
    () => parseProvisioningInput({ ...validEnvironment, KND_PROVISION_CONFIRM: 'no' }),
    /KND_PROVISION_CONFIRM/,
  );
});

test('provisioning rejects weak and reused passwords without echoing their values', () => {
  const weak = 'weak-password';
  assert.throws(
    () => parseProvisioningInput({ ...validEnvironment, KND_SUPER_ADMIN_PASSWORD: weak }),
    (error: unknown) => error instanceof Error && !error.message.includes(weak),
  );
  assert.throws(
    () => parseProvisioningInput({
      ...validEnvironment,
      KND_CV_SPECIALIST_PASSWORD: validEnvironment.KND_SUPER_ADMIN_PASSWORD,
    }),
    /different passwords/,
  );
});

test('valid provisioning input maps secrets only in memory', () => {
  const result = parseProvisioningInput(validEnvironment);
  assert.equal(result.length, 2);
  assert.equal(result[0]?.role, 'super_admin');
  assert.equal(result[1]?.role, 'cv_specialist');
});
