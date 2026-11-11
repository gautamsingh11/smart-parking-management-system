import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import request from 'supertest';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-only-secret-which-is-over-thirty-two-bytes';
const { createApp } = await import('../src/app.js');
const { User } = await import('../src/models/User.js');
const { AuthCredential } = await import('../src/models/AuthCredential.js');
const { ParkingLocation } = await import('../src/models/ParkingLocation.js');
const { ParkingSlot } = await import('../src/models/ParkingSlot.js');
const { Booking } = await import('../src/models/Booking.js');
const { ReservationClaim } = await import('../src/models/ReservationClaim.js');

let mongo;
const app = createApp();
const origin = 'http://localhost:5173';
const password = 'A longer passphrase 2026';
const openEveryDay = Array.from({ length: 7 }, (_, day) => ({ day, closed: false, openAt: '00:00', closeAt: '24:00' }));

async function createUser(email, role = 'customer') {
  const user = new User({ name: email.split('@')[0], email, role });
  await user.setPassword(password);
  await user.save();
  return user;
}

async function login(email) {
  const session = request.agent(app);
  const response = await session.post('/api/v1/auth/login').set('Origin', origin).send({ email, password });
  assert.equal(response.status, 200);
  return session;
}

async function createLocation(session, overrides = {}) {
  const response = await session.post('/api/v1/locations').set('Origin', origin).send({
    name: 'Harbor Center Parking',
    description: 'Secure covered spaces near the waterfront.',
    address: { line1: '15 Harbor Road', line2: '', city: 'Mumbai', state: 'Maharashtra', postalCode: '400001', country: 'India' },
    coordinates: { latitude: 19.076, longitude: 72.8777 },
    timezone: 'Asia/Kolkata',
    operatingHours: openEveryDay,
    ...overrides,
  });
  assert.equal(response.status, 201, JSON.stringify(response.body));
  return response.body.location;
}

async function createSlot(session, locationId, values = {}) {
  const response = await session.post(`/api/v1/locations/${locationId}/slots`).set('Origin', origin).send({ slotNumber: 'C-01', vehicleType: 'car', hourlyPricePaise: 12500, ...values });
  return response;
}

async function futureWindow(durationMinutes = 60) {
  const startAt = new Date(Math.ceil((Date.now() + 48 * 60 * 60 * 1000) / 60_000) * 60_000);
  return { startAt, endAt: new Date(startAt.getTime() + durationMinutes * 60_000) };
}

async function createBooking(session, locationId, slotId, window, extra = {}) {
  return session.post('/api/v1/bookings').set('Origin', origin).send({
    locationId,
    slotId,
    startAt: window.startAt.toISOString(),
    endAt: window.endAt.toISOString(),
    ...extra,
  });
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), AuthCredential.init(), ParkingLocation.init(), ParkingSlot.init(), Booking.init(), ReservationClaim.init()]);
});

afterEach(async () => {
  await Promise.all([
    User.deleteMany({}), AuthCredential.deleteMany({}), ParkingLocation.deleteMany({}),
    ParkingSlot.deleteMany({}), Booking.deleteMany({}), ReservationClaim.deleteMany({}),
  ]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo?.stop();
});

test('parking owners can create, update, and archive their locations', async () => {
  await createUser('owner@example.com', 'parking_owner');
  const owner = await login('owner@example.com');
  const location = await createLocation(owner);
  const update = await owner.patch(`/api/v1/locations/${location.id}`).send({ name: 'Harbor Point Garage', coordinates: { latitude: 19.08, longitude: 72.88 } });
  const archive = await owner.delete(`/api/v1/locations/${location.id}`);
  const publicDetail = await request(app).get(`/api/v1/locations/${location.id}`);

  assert.equal(update.status, 200);
  assert.equal(update.body.location.name, 'Harbor Point Garage');
  assert.deepEqual(update.body.location.coordinates, { longitude: 72.88, latitude: 19.08 });
  assert.equal(archive.status, 204);
  assert.equal((await ParkingLocation.findById(location.id)).status, 'archived');
  assert.equal(publicDetail.status, 404);
});

test('owners cannot modify another owner location; administrators can manage all locations', async () => {
  await createUser('owner-a@example.com', 'parking_owner');
  await createUser('owner-b@example.com', 'parking_owner');
  await createUser('admin@example.com', 'admin');
  const ownerA = await login('owner-a@example.com');
  const ownerB = await login('owner-b@example.com');
  const admin = await login('admin@example.com');
  const locationB = await createLocation(ownerB);

  assert.equal((await ownerA.patch(`/api/v1/locations/${locationB.id}`).send({ name: 'Unauthorized Change' })).status, 403);
  assert.equal((await ownerA.delete(`/api/v1/locations/${locationB.id}`)).status, 403);
  assert.equal((await createSlot(ownerA, locationB.id)).status, 403);
  assert.equal((await admin.patch(`/api/v1/locations/${locationB.id}`).send({ status: 'inactive' })).status, 200);
  const adminLocation = await createLocation(admin, { name: 'Admin Managed Site' });
  assert.equal(adminLocation.ownerId, (await User.findOne({ email: 'admin@example.com' })).id);
  assert.equal((await admin.get('/api/v1/owner/locations')).body.locations.length, 2);
});

test('slot numbers are unique per location and unauthorized slot edits are denied', async () => {
  await createUser('owner-a@example.com', 'parking_owner');
  await createUser('owner-b@example.com', 'parking_owner');
  const ownerA = await login('owner-a@example.com');
  const ownerB = await login('owner-b@example.com');
  const location = await createLocation(ownerB);
  const created = await createSlot(ownerB, location.id, { slotNumber: ' ev-07 ', vehicleType: 'electric_vehicle', hourlyPricePaise: 22000 });
  const duplicate = await createSlot(ownerB, location.id, { slotNumber: 'EV-07' });
  const changed = await ownerA.patch(`/api/v1/locations/${location.id}/slots/${created.body.slot.id}`).send({ status: 'maintenance' });

  assert.equal(created.status, 201);
  assert.equal(created.body.slot.slotNumber, 'EV-07');
  assert.equal(created.body.slot.vehicleType, 'electric_vehicle');
  assert.equal(created.body.slot.hourlyPricePaise, 22000);
  assert.equal(duplicate.status, 409);
  assert.equal(changed.status, 403);
});

test('location search filters city, vehicle type, and maximum hourly price', async () => {
  await createUser('owner@example.com', 'parking_owner');
  const owner = await login('owner@example.com');
  const mumbai = await createLocation(owner);
  const pune = await createLocation(owner, { name: 'Pune East Lot', address: { line1: '8 Station Road', line2: '', city: 'Pune', state: 'Maharashtra', postalCode: '411001', country: 'India' } });
  await createSlot(owner, mumbai.id, { slotNumber: 'CAR-1', vehicleType: 'car', hourlyPricePaise: 12000 });
  await createSlot(owner, mumbai.id, { slotNumber: 'BIKE-1', vehicleType: 'motorcycle', hourlyPricePaise: 5000 });
  await createSlot(owner, pune.id, { slotNumber: 'EV-1', vehicleType: 'electric_vehicle', hourlyPricePaise: 25000 });

  const search = await request(app).get('/api/v1/locations?city=Mumbai&vehicleType=motorcycle&maxHourlyPricePaise=6000');
  assert.equal(search.status, 200);
  assert.equal(search.body.locations.length, 1);
  assert.equal(search.body.locations[0].id, mumbai.id);
  assert.equal(search.body.locations[0].totalSlots, 1);
  assert.equal(search.body.locations[0].availableSlots, 1);
});

test('availability reflects claims for the requested time window', async () => {
  await createUser('owner@example.com', 'parking_owner');
  await createUser('customer@example.com');
  const owner = await login('owner@example.com');
  const customer = await login('customer@example.com');
  const location = await createLocation(owner);
  const createdSlot = await createSlot(owner, location.id);
  const window = await futureWindow();
  const before = await request(app).get(`/api/v1/locations/${location.id}/availability?startAt=${encodeURIComponent(window.startAt.toISOString())}&endAt=${encodeURIComponent(window.endAt.toISOString())}`);
  const booking = await createBooking(customer, location.id, createdSlot.body.slot.id, window);
  const after = await request(app).get(`/api/v1/locations/${location.id}/availability?startAt=${encodeURIComponent(window.startAt.toISOString())}&endAt=${encodeURIComponent(window.endAt.toISOString())}`);

  assert.equal(before.body.availableCount, 1);
  assert.equal(booking.status, 201);
  assert.equal(after.body.availableCount, 0);
  assert.equal(after.body.slots[0].available, false);
});

test('booking price comes from slot inventory and client cannot set price or booking status', async () => {
  await createUser('owner@example.com', 'parking_owner');
  await createUser('customer@example.com');
  const owner = await login('owner@example.com');
  const customer = await login('customer@example.com');
  const location = await createLocation(owner);
  const slot = await createSlot(owner, location.id, { hourlyPricePaise: 19900 });
  const window = await futureWindow(61);
  const booking = await createBooking(customer, location.id, slot.body.slot.id, window);
  const tampered = await createBooking(customer, location.id, slot.body.slot.id, { startAt: new Date(window.endAt.getTime() + 60_000), endAt: new Date(window.endAt.getTime() + 120_000) }, { hourlyPricePaise: 1, amountPaise: 1, status: 'cancelled' });

  assert.equal(booking.status, 201);
  assert.equal(booking.body.booking.hourlyPricePaise, 19900);
  assert.equal(booking.body.booking.amountPaise, 39800);
  assert.equal(booking.body.price.billableHours, 2);
  assert.equal(tampered.status, 400);
  assert.equal(await Booking.countDocuments({}), 1);
});

test('overlapping and simultaneous booking requests cannot double-book a slot', async () => {
  await createUser('owner@example.com', 'parking_owner');
  await createUser('customer-a@example.com');
  await createUser('customer-b@example.com');
  const owner = await login('owner@example.com');
  const customerA = await login('customer-a@example.com');
  const customerB = await login('customer-b@example.com');
  const location = await createLocation(owner);
  const slot = await createSlot(owner, location.id);
  const window = await futureWindow(120);
  const concurrent = await Promise.all([
    createBooking(customerA, location.id, slot.body.slot.id, window),
    createBooking(customerB, location.id, slot.body.slot.id, window),
  ]);
  const statuses = concurrent.map((response) => response.status).sort();
  const overlap = await createBooking(customerB, location.id, slot.body.slot.id, { startAt: new Date(window.startAt.getTime() + 60_000), endAt: window.endAt });

  assert.deepEqual(statuses, [201, 409]);
  assert.equal(overlap.status, 409);
  assert.equal(await Booking.countDocuments({}), 1);
  assert.equal(await ReservationClaim.countDocuments({ active: true }), 120);
});

test('customers can cancel future bookings, freeing inventory, but cannot cancel started bookings', async () => {
  await createUser('owner@example.com', 'parking_owner');
  await createUser('customer@example.com');
  const owner = await login('owner@example.com');
  const customer = await login('customer@example.com');
  const location = await createLocation(owner);
  const slot = await createSlot(owner, location.id);
  const window = await futureWindow();
  const booking = await createBooking(customer, location.id, slot.body.slot.id, window);
  const cancelled = await customer.post(`/api/v1/bookings/${booking.body.booking.id}/cancel`);
  const replacement = await createBooking(customer, location.id, slot.body.slot.id, window);

  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.booking.status, 'cancelled');
  assert.ok(cancelled.body.booking.cancelledAt);
  assert.equal(await ReservationClaim.countDocuments({ active: true }), 60);
  assert.equal(replacement.status, 201);

  await Booking.updateOne({ _id: replacement.body.booking.id }, { $set: { startAt: new Date(Date.now() - 60_000) } });
  const started = await customer.post(`/api/v1/bookings/${replacement.body.booking.id}/cancel`);
  assert.equal(started.status, 409);
  assert.equal(started.body.error.code, 'BOOKING_CANNOT_BE_CANCELLED');
});

test('customers only see, read, or cancel their own booking data', async () => {
  await createUser('owner@example.com', 'parking_owner');
  await createUser('customer-a@example.com');
  await createUser('customer-b@example.com');
  const owner = await login('owner@example.com');
  const customerA = await login('customer-a@example.com');
  const customerB = await login('customer-b@example.com');
  const location = await createLocation(owner);
  const slot = await createSlot(owner, location.id);
  const secondSlot = await createSlot(owner, location.id, { slotNumber: 'C-02' });
  const bookingA = await createBooking(customerA, location.id, slot.body.slot.id, await futureWindow());
  const bookingB = await createBooking(customerB, location.id, secondSlot.body.slot.id, await futureWindow());
  const listA = await customerA.get('/api/v1/bookings');
  const readOther = await customerA.get(`/api/v1/bookings/${bookingB.body.booking.id}`);
  const cancelOther = await customerA.post(`/api/v1/bookings/${bookingB.body.booking.id}/cancel`);

  assert.equal(bookingA.status, 201);
  assert.equal(bookingB.status, 201);
  assert.equal(listA.body.bookings.length, 1);
  assert.equal(listA.body.bookings[0].id, bookingA.body.booking.id);
  assert.equal(readOther.status, 404);
  assert.equal(cancelOther.status, 404);
  assert.equal((await Booking.findById(bookingB.body.booking.id)).status, 'confirmed');
});
