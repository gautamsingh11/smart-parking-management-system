import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-only-secret-which-is-over-thirty-two-bytes';
const { app } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { AuthCredential } = await import('../src/models/AuthCredential.js');
const { authCookieNames } = await import('../src/modules/auth/auth.cookies.js');
const { hashToken } = await import('../src/modules/auth/auth.tokens.js');

let mongo;
let deliveredResetUrl;
const testMailer = {
  configured: true,
  async send(_email, url) { deliveredResetUrl = url; },
};
const authApp = (await import('../src/app.js')).createApp({ passwordResetMailer: testMailer });
const origin = 'http://localhost:5173';
const password = 'A longer passphrase 2026';

async function createUser({ email = 'driver@example.com', role = 'customer', passwordValue = password } = {}) {
  const user = new User({ name: 'Test Driver', email, role });
  await user.setPassword(passwordValue);
  await user.save();
  return user;
}

function agent() { return request.agent(authApp); }
function cookieValue(response, name) {
  const cookie = response.headers['set-cookie']?.find((value) => value.startsWith(`${name}=`));
  return cookie?.split(';', 1)[0];
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await User.init();
  await AuthCredential.init();
});

afterEach(async () => {
  deliveredResetUrl = undefined;
  await Promise.all([User.deleteMany({}), AuthCredential.deleteMany({})]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('registration hashes the password, sets secure cookies, and returns a safe customer profile', async () => {
  const response = await request(authApp).post('/api/v1/auth/register').set('Origin', origin).send({ name: 'Avery Driver', email: 'Avery@Example.com', password });

  assert.equal(response.status, 201);
  assert.equal(response.body.user.email, 'avery@example.com');
  assert.equal(response.body.user.role, 'customer');
  assert.equal('passwordHash' in response.body.user, false);
  assert.equal('accessToken' in response.body, false);
  assert.equal('refreshToken' in response.body, false);
  assert.match(response.headers['set-cookie'].join(';'), /HttpOnly/);
  const saved = await User.findOne({ email: 'avery@example.com' }).select('+passwordHash');
  assert.notEqual(saved.passwordHash, password);
  assert.equal(await saved.verifyPassword(password), true);
});

test('duplicate emails are rejected case-insensitively and requested roles cannot be self-assigned', async () => {
  await createUser();
  const duplicate = await request(authApp).post('/api/v1/auth/register').set('Origin', origin).send({ name: 'Other Driver', email: 'DRIVER@example.com', password });
  const privileged = await request(authApp).post('/api/v1/auth/register').set('Origin', origin).send({ name: 'Admin', email: 'admin@example.com', password, role: 'admin' });

  assert.equal(duplicate.status, 409);
  assert.equal(duplicate.body.error.code, 'EMAIL_ALREADY_REGISTERED');
  assert.equal(privileged.status, 400);
  assert.equal(await User.countDocuments({ email: 'admin@example.com' }), 0);
});

test('login succeeds for valid credentials and uses a generic response for invalid credentials', async () => {
  await createUser();
  const valid = await request(authApp).post('/api/v1/auth/login').set('Origin', origin).send({ email: 'DRIVER@example.com', password });
  const invalid = await request(authApp).post('/api/v1/auth/login').set('Origin', origin).send({ email: 'driver@example.com', password: 'incorrect password' });

  assert.equal(valid.status, 200);
  assert.equal(valid.body.user.email, 'driver@example.com');
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.error.code, 'INVALID_CREDENTIALS');
});

test('profile route requires authentication and role middleware enforces server-side roles', async () => {
  const customer = await createUser();
  await createUser({ email: 'owner@example.com', role: 'parking_owner' });
  await createUser({ email: 'admin@example.com', role: 'admin' });
  const anonymous = await request(authApp).get('/api/v1/auth/me');
  const customerAgent = agent();
  const ownerAgent = agent();
  const adminAgent = agent();
  await customerAgent.post('/api/v1/auth/login').set('Origin', origin).send({ email: customer.email, password });
  await ownerAgent.post('/api/v1/auth/login').set('Origin', origin).send({ email: 'owner@example.com', password });
  await adminAgent.post('/api/v1/auth/login').set('Origin', origin).send({ email: 'admin@example.com', password });

  assert.equal(anonymous.status, 401);
  assert.equal((await customerAgent.get('/api/v1/auth/me')).body.user.role, 'customer');
  assert.equal((await customerAgent.get('/api/v1/auth/test/owner-access')).status, 403);
  assert.equal((await ownerAgent.get('/api/v1/auth/test/owner-access')).status, 200);
  assert.equal((await ownerAgent.get('/api/v1/auth/test/admin-access')).status, 403);
  assert.equal((await adminAgent.get('/api/v1/auth/test/admin-access')).status, 200);
});

test('expired and invalid access and refresh tokens are rejected', async () => {
  const user = await createUser();
  const expired = jwt.sign({ sub: user.id, role: user.role }, process.env.JWT_ACCESS_SECRET, { expiresIn: -1, issuer: 'smart-parking-api', audience: 'smart-parking-client' });
  const invalid = jwt.sign({ sub: user.id }, 'a-different-secret-value-of-over-32-bytes');
  const expiredAccess = await request(authApp).get('/api/v1/auth/me').set('Cookie', `${authCookieNames.access}=${expired}`);
  const invalidAccess = await request(authApp).get('/api/v1/auth/me').set('Cookie', `${authCookieNames.access}=${invalid}`);
  const expiredRefresh = 'expired-refresh-credential-token';
  await AuthCredential.create({ userId: user.id, purpose: 'refresh', tokenHash: hashToken(expiredRefresh), expiresAt: new Date(Date.now() - 1000) });
  const invalidRefresh = await request(authApp).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', `${authCookieNames.refresh}=not-a-valid-token`);
  const expiredRefreshResult = await request(authApp).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', `${authCookieNames.refresh}=${expiredRefresh}`);

  assert.equal(expiredAccess.status, 401);
  assert.equal(invalidAccess.status, 401);
  assert.equal(invalidRefresh.status, 401);
  assert.equal(expiredRefreshResult.status, 401);
});

test('refresh tokens rotate and logout revokes the current refresh session', async () => {
  const registered = await request(authApp).post('/api/v1/auth/register').set('Origin', origin).send({ name: 'Avery Driver', email: 'avery@example.com', password });
  const originalCookie = cookieValue(registered, authCookieNames.refresh);
  const refreshBefore = originalCookie?.split('=')[1];
  const refreshed = await request(authApp).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', originalCookie);
  const nextCookie = cookieValue(refreshed, authCookieNames.refresh);

  assert.equal(refreshed.status, 200);
  assert.notEqual(nextCookie?.split('=')[1], refreshBefore);
  assert.equal((await request(authApp).post('/api/v1/auth/logout').set('Origin', origin).set('Cookie', nextCookie)).status, 204);
  const replay = await request(authApp).post('/api/v1/auth/refresh').set('Origin', origin).set('Cookie', `${authCookieNames.refresh}=${refreshBefore}`);
  assert.equal(replay.status, 401);
});

test('password reset emails a one-time token, expires, changes the password, and rejects replay', async () => {
  await createUser();
  const requestReset = await request(authApp).post('/api/v1/auth/password/forgot').send({ email: 'driver@example.com' });
  const resetToken = new URL(deliveredResetUrl).searchParams.get('token');
  const reset = await request(authApp).post('/api/v1/auth/password/reset').send({ token: resetToken, password: 'A brand new passphrase 2027' });
  const replay = await request(authApp).post('/api/v1/auth/password/reset').send({ token: resetToken, password: 'Another new passphrase 2028' });
  const newLogin = await request(authApp).post('/api/v1/auth/login').set('Origin', origin).send({ email: 'driver@example.com', password: 'A brand new passphrase 2027' });
  const oldLogin = await request(authApp).post('/api/v1/auth/login').set('Origin', origin).send({ email: 'driver@example.com', password });

  assert.equal(requestReset.status, 202);
  assert.ok(resetToken);
  assert.equal(requestReset.body.message.includes('driver@example.com'), false);
  assert.equal(reset.status, 200);
  assert.equal(replay.status, 400);
  assert.equal(newLogin.status, 200);
  assert.equal(oldLogin.status, 401);
});

test('expired password reset tokens and unknown email requests are handled safely', async () => {
  const user = await createUser();
  const token = 'expired-password-reset-token-value-123456';
  await AuthCredential.create({ userId: user.id, purpose: 'password_reset', tokenHash: hashToken(token), expiresAt: new Date(Date.now() - 1000) });
  const expired = await request(authApp).post('/api/v1/auth/password/reset').send({ token, password });
  const unknown = await request(authApp).post('/api/v1/auth/password/forgot').send({ email: 'nobody@example.com' });

  assert.equal(expired.status, 400);
  assert.equal(expired.body.error.code, 'INVALID_OR_EXPIRED_RESET_TOKEN');
  assert.equal(unknown.status, 202);
  assert.equal(unknown.body.message, 'If an account exists for that email, password reset instructions will be sent.');
});

test('profile updates accept only safe editable fields', async () => {
  const session = agent();
  await session.post('/api/v1/auth/register').set('Origin', origin).send({ name: 'Avery Driver', email: 'avery@example.com', password });
  const update = await session.patch('/api/v1/auth/me').send({ name: 'Avery Updated', phone: '+1 555 0100' });
  const roleEscalation = await session.patch('/api/v1/auth/me').send({ role: 'admin' });

  assert.equal(update.status, 200);
  assert.equal(update.body.user.name, 'Avery Updated');
  assert.equal(update.body.user.phone, '+1 555 0100');
  assert.equal(roleEscalation.status, 400);
  assert.equal((await User.findOne({ email: 'avery@example.com' })).role, 'customer');
});
