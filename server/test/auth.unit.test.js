import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerSchema, loginSchema, profileSchema } from '../src/modules/auth/auth.validation.js';
import { hashToken } from '../src/modules/auth/auth.tokens.js';
import { requireRoles } from '../src/modules/auth/auth.middleware.js';

test('registration validation normalizes email and accepts only customer fields', () => {
  const valid = registerSchema.safeParse({ name: '  Avery Driver ', email: ' Avery@Example.com ', password: 'A sufficiently long phrase 2026' });
  const roleEscalation = registerSchema.safeParse({ name: 'Avery Driver', email: 'avery@example.com', password: 'A sufficiently long phrase 2026', role: 'admin' });
  const oversizedBcryptInput = registerSchema.safeParse({ name: 'Avery Driver', email: 'avery@example.com', password: '🚗'.repeat(20) });

  assert.equal(valid.success, true);
  assert.equal(valid.data.name, 'Avery Driver');
  assert.equal(valid.data.email, 'avery@example.com');
  assert.equal(valid.data.phone, '');
  assert.equal(roleEscalation.success, false);
  assert.equal(oversizedBcryptInput.success, false);
});

test('login and profile schemas reject malformed or privileged fields', () => {
  assert.equal(loginSchema.safeParse({ email: 'not-an-email', password: 'x' }).success, false);
  assert.equal(loginSchema.safeParse({ email: 'driver@example.com', password: '🚗'.repeat(20) }).success, false);
  assert.equal(profileSchema.safeParse({ name: 'Updated Driver' }).success, true);
  assert.equal(profileSchema.safeParse({ role: 'admin' }).success, false);
  assert.equal(profileSchema.safeParse({}).success, false);
});

test('refresh/reset token hashing produces a stable one-way digest', () => {
  const rawToken = 'sensitive-random-token-value';
  const first = hashToken(rawToken);

  assert.equal(first, hashToken(rawToken));
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, rawToken);
});

test('role authorization denies missing and disallowed users and allows configured roles', () => {
  function invoke(user, allowedRoles) {
    const response = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    let nextCalled = false;
    requireRoles(...allowedRoles)({ user }, response, () => { nextCalled = true; });
    return { response, nextCalled };
  }

  const anonymous = invoke(undefined, ['admin']);
  const customer = invoke({ role: 'customer' }, ['parking_owner', 'admin']);
  const owner = invoke({ role: 'parking_owner' }, ['parking_owner', 'admin']);

  assert.equal(anonymous.response.statusCode, 401);
  assert.equal(customer.response.statusCode, 403);
  assert.equal(owner.nextCalled, true);
});
