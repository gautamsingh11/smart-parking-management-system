import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-only-secret-which-is-over-thirty-two-bytes';
process.env.RAZORPAY_MODE = 'test';
process.env.RAZORPAY_KEY_ID = 'rzp_test_123456';
process.env.RAZORPAY_KEY_SECRET = 'test_razorpay_secret_for_testing';
process.env.RAZORPAY_WEBHOOK_SECRET = 'test_razorpay_webhook_secret';
const [{ createApp }, { User }, { ParkingLocation }, { Booking }, { Payment }, { AccessCredential }, { PaymentWebhookEvent }] = await Promise.all([
  import('../src/app.js'), import('../src/models/User.js'), import('../src/models/ParkingLocation.js'), import('../src/models/Booking.js'), import('../src/models/Payment.js'), import('../src/models/AccessCredential.js'), import('../src/models/PaymentWebhookEvent.js'),
]);

let orderSequence = 0; let latestOrderId;
const razorpayClient = { orders: { create: async (payload) => { latestOrderId = `order_test_${++orderSequence}`; return { id: latestOrderId, amount: payload.amount, currency: payload.currency, created_at: Math.floor(Date.now() / 1000) }; } }, payments: { fetch: async (id) => ({ id, order_id: latestOrderId, amount: 12000, currency: 'INR', status: 'captured' }) } };
const app = createApp({ razorpayClient });
const origin = 'http://localhost:5173';
const password = 'A longer passphrase 2026';
let mongo;
let customer, owner, otherOwner, admin, location, booking;

async function makeUser(email, role) { const user = new User({ name: email.split('@')[0], email, role }); await user.setPassword(password); return user.save(); }
async function login(email) { const agent = request.agent(app); const r = await agent.post('/api/v1/auth/login').set('Origin', origin).send({ email, password }); assert.equal(r.status, 200, JSON.stringify(r.body)); return agent; }
async function resetFixture() {
  await Promise.all([User.deleteMany({}), ParkingLocation.deleteMany({}), Booking.deleteMany({}), Payment.deleteMany({}), AccessCredential.deleteMany({}), PaymentWebhookEvent.deleteMany({})]);
  customer = await makeUser('customer@phase4.test', 'customer'); owner = await makeUser('owner@phase4.test', 'parking_owner'); otherOwner = await makeUser('other@phase4.test', 'parking_owner'); admin = await makeUser('admin@phase4.test', 'admin');
  location = await ParkingLocation.create({ ownerId: owner.id, name: 'Phase 4 Garage', address: { line1: '1 Test Way', city: 'Mumbai', state: 'Maharashtra', postalCode: '400001', country: 'India' }, point: { type: 'Point', coordinates: [72.8, 19.0] }, operatingHours: Array.from({ length: 7 }, (_, day) => ({ day, closed: false, openAt: '00:00', closeAt: '24:00' })) });
  booking = await Booking.create({ customerId: customer.id, ownerId: owner.id, locationId: location.id, slotId: new mongoose.Types.ObjectId(), startAt: new Date(Date.now() - 60_000), endAt: new Date(Date.now() + 2 * 60 * 60_000), hourlyPricePaise: 6000, amountPaise: 12000, status: 'confirmed', paymentStatus: 'pending' });
}

before(async () => { mongo = await MongoMemoryServer.create(); await mongoose.connect(mongo.getUri()); await Promise.all([User.init(), ParkingLocation.init(), Booking.init(), Payment.init(), AccessCredential.init(), PaymentWebhookEvent.init()]); await resetFixture(); });
afterEach(async () => { await resetFixture(); });
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

test('repeated payment order requests reuse the same provider order', async () => {
  const customerSession = await login(customer.email);
  const first = await customerSession.post(`/api/v1/payments/bookings/${booking.id}/order`).send({ amount: 1 });
  const second = await customerSession.post(`/api/v1/payments/bookings/${booking.id}/order`).send({});
  assert.equal(first.status, 201); assert.equal(second.status, 200); assert.equal(first.body.checkout.orderId, second.body.checkout.orderId); assert.equal(first.body.checkout.amount, booking.amountPaise);
});

test('concurrent payment order requests never create two payment attempts', async () => {
  const customerSession = await login(customer.email);
  const [first, second] = await Promise.all([
    customerSession.post(`/api/v1/payments/bookings/${booking.id}/order`).send({}),
    customerSession.post(`/api/v1/payments/bookings/${booking.id}/order`).send({}),
  ]);
  assert.ok([201, 200, 409].includes(first.status)); assert.ok([201, 200, 409].includes(second.status));
  assert.equal(await Payment.countDocuments({ bookingId: booking.id }), 1);
});

test('payment verification rejects invalid signature and requires captured provider record', async () => {
  const customerSession = await login(customer.email);
  const created = await customerSession.post(`/api/v1/payments/bookings/${booking.id}/order`).send({}); const orderId = created.body.checkout.orderId;
  const invalid = await customerSession.post('/api/v1/payments/verify').send({ razorpay_order_id: orderId, razorpay_payment_id: 'pay_bad', razorpay_signature: 'bad' });
  assert.equal(invalid.status, 400); assert.equal(invalid.body.error.code, 'INVALID_PAYMENT_SIGNATURE');
  const signature = crypto.createHmac('sha256', process.env.RAZORPAY_KEY_SECRET).update(`${orderId}|pay_test_1`).digest('hex');
  const valid = await customerSession.post('/api/v1/payments/verify').send({ razorpay_order_id: orderId, razorpay_payment_id: 'pay_test_1', razorpay_signature: signature });
  assert.equal(valid.status, 200); assert.equal((await Booking.findById(booking.id)).paymentStatus, 'paid');
});

test('payment order cannot be created by another customer', async () => {
  const another = await makeUser('another@phase4.test', 'customer'); const session = await login(another.email);
  const response = await session.post(`/api/v1/payments/bookings/${booking.id}/order`).send({});
  assert.equal(response.status, 404);
});

test('cancelled Checkout attempts are recorded and may be retried', async () => {
  const customerSession = await login(customer.email);
  const order = await customerSession.post(`/api/v1/payments/bookings/${booking.id}/order`).send({});
  const cancelled = await customerSession.post(`/api/v1/payments/${order.body.payment.id}/cancel`).send({});
  const retry = await customerSession.post(`/api/v1/payments/bookings/${booking.id}/order`).send({});
  assert.equal(cancelled.body.payment.status, 'cancelled'); assert.equal(retry.status, 201); assert.equal(await Payment.countDocuments({ bookingId: booking.id }), 2);
});

test('webhook validates signature and duplicate delivery is idempotent', async () => {
  const customerSession = await login(customer.email); const created = await customerSession.post(`/api/v1/payments/bookings/${booking.id}/order`).send({});
  const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_webhook_1', order_id: created.body.checkout.orderId, amount: 12000, currency: 'INR', status: 'captured' } } } });
  const sign = crypto.createHmac('sha256', process.env.RAZORPAY_WEBHOOK_SECRET).update(body).digest('hex');
  const bad = await request(app).post('/api/v1/payments/webhook').set('Content-Type', 'application/json').set('x-razorpay-event-id', 'evt-bad').set('x-razorpay-signature', '00').send(body); assert.equal(bad.status, 400);
  const send = () => request(app).post('/api/v1/payments/webhook').set('Content-Type', 'application/json').set('x-razorpay-event-id', 'evt-captured-1').set('x-razorpay-signature', sign).send(body);
  const first = await send(); const duplicate = await send(); assert.equal(first.status, 200); assert.equal(duplicate.body.duplicate, true); assert.equal(await PaymentWebhookEvent.countDocuments(), 1); assert.equal((await Booking.findById(booking.id)).paymentStatus, 'paid');
});

test('QR tickets are one-use, owner-scoped and record entry then exit', async () => {
  booking.paymentStatus = 'paid'; await booking.save();
  const customerSession = await login(customer.email); const staff = await login(owner.email); const unauthorized = await login(otherOwner.email);
  const ticket = await customerSession.post(`/api/v1/bookings/${booking.id}/access-ticket`).send({}); assert.equal(ticket.status, 200);
  const storedTicket = await AccessCredential.findOne({ bookingId: booking.id }).select('+tokenHash'); assert.equal(storedTicket.tokenHash, crypto.createHash('sha256').update(ticket.body.ticket.credential).digest('hex'));
  const denied = await unauthorized.post('/api/v1/bookings/access/verify').send({ credential: ticket.body.ticket.credential, action: 'entry' }); assert.equal(denied.status, 403);
  const entry = await staff.post('/api/v1/bookings/access/verify').send({ credential: ticket.body.ticket.credential, action: 'entry' }); assert.equal(entry.status, 200); assert.equal(entry.body.accessState, 'entered');
  const reused = await staff.post('/api/v1/bookings/access/verify').send({ credential: ticket.body.ticket.credential, action: 'entry' }); assert.equal(reused.status, 404);
  const exitTicket = await customerSession.post(`/api/v1/bookings/${booking.id}/access-ticket`).send({}); assert.equal(exitTicket.body.ticket.purpose, 'exit');
  const exit = await staff.post('/api/v1/bookings/access/verify').send({ credential: exitTicket.body.ticket.credential, action: 'exit' }); assert.equal(exit.status, 200); assert.equal(exit.body.accessState, 'exited');
  const saved = await Booking.findById(booking.id); assert.equal(saved.accessHistory.length, 2); assert.ok(saved.entryAt); assert.ok(saved.exitAt);
});

test('expired QR credential is rejected without recording entry', async () => {
  booking.paymentStatus = 'paid'; await booking.save(); const raw = crypto.randomBytes(32).toString('base64url');
  await AccessCredential.create({ bookingId: booking.id, customerId: customer.id, tokenHash: crypto.createHash('sha256').update(raw).digest('hex'), purpose: 'entry', expiresAt: new Date(Date.now() - 1000), issuedAt: new Date(), lastIssuedBy: customer.id });
  const staff = await login(owner.email); const result = await staff.post('/api/v1/bookings/access/verify').send({ credential: raw, action: 'entry' });
  assert.equal(result.status, 410); assert.equal((await Booking.findById(booking.id)).accessState, 'not_entered');
});

test('customers cannot use staff access verification endpoint', async () => {
  const customerSession = await login(customer.email); const result = await customerSession.post('/api/v1/bookings/access/verify').send({ credential: 'x'.repeat(40), action: 'entry' }); assert.equal(result.status, 403);
});
