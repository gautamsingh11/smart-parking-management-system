import { before, after, afterEach, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import { io as createClient } from 'socket.io-client';
import { MongoMemoryServer } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-only-secret-which-is-over-thirty-two-bytes';
process.env.MONGOMS_DOWNLOAD_DIR ??= fileURLToPath(new URL('../../node_modules/.cache/mongodb-memory-server', import.meta.url));
const { createApp } = await import('../src/app.js');
const { attachAvailabilitySocket } = await import('../src/realtime/availability.socket.js');
const { publishAvailability } = await import('../src/realtime/availability.js');
const { createAccessToken } = await import('../src/modules/auth/auth.tokens.js');
const { User } = await import('../src/models/User.js');
const { ParkingLocation } = await import('../src/models/ParkingLocation.js');

let mongo;
let httpServer;
let socketServer;
let baseUrl;

function waitFor(socket, event, timeoutMs = 3000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for socket event ${event}`)), timeoutMs);
    socket.once(event, (value) => { clearTimeout(timer); resolve(value); });
  });
}

function connect(options = {}) {
  return createClient(baseUrl, { path: '/api/v1/socket.io', transports: ['websocket'], reconnection: false, ...options });
}

before(async () => {
  mongo = await MongoMemoryServer.create();
  await mongoose.connect(mongo.getUri());
  await Promise.all([User.init(), ParkingLocation.init()]);
  httpServer = createServer(createApp());
  socketServer = attachAvailabilitySocket(httpServer);
  await new Promise((resolve) => httpServer.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${httpServer.address().port}`;
});

afterEach(async () => {
  await Promise.all([User.deleteMany({}), ParkingLocation.deleteMany({})]);
});

after(async () => {
  if (socketServer) await new Promise((resolve) => socketServer.close(resolve));
  await mongoose.disconnect();
  await mongo?.stop();
});

test('Socket.IO rejects an invalid access cookie during handshake', async () => {
  const client = connect({ extraHeaders: { Cookie: 'sp_access=invalid.token.value' } });
  const error = await waitFor(client, 'connect_error');
  client.disconnect();
  assert.match(error.message, /Authentication required/);
});

test('authenticated customers can subscribe to location availability updates', async () => {
  const user = new User({ name: 'Socket Driver', email: 'socket@example.com', role: 'customer' });
  await user.setPassword('A longer passphrase 2026');
  await user.save();
  const location = await ParkingLocation.create({
    ownerId: user.id,
    name: 'Socket Test Parking',
    address: { line1: '1 Main Road', city: 'Mumbai', state: 'Maharashtra', postalCode: '400001', country: 'India' },
    point: { type: 'Point', coordinates: [72.88, 19.07] },
    timezone: 'Asia/Kolkata',
    operatingHours: Array.from({ length: 7 }, (_, day) => ({ day, closed: false, openAt: '00:00', closeAt: '24:00' })),
  });
  const token = createAccessToken(user);
  const client = connect({ extraHeaders: { Cookie: `sp_access=${token}` } });
  const connected = waitFor(client, 'connect');
  await connected;
  const joined = await new Promise((resolve) => client.emit('availability:subscribe', { locationId: location.id }, resolve));
  const updateReceived = waitFor(client, 'availability:update');
  publishAvailability(location.id, { slotId: 'slot-123', startAt: new Date().toISOString(), available: false });
  const update = await updateReceived;
  const invalidRoom = await new Promise((resolve) => client.emit('availability:subscribe', { locationId: 'invalid-id' }, resolve));

  assert.deepEqual(joined, { ok: true });
  assert.equal(update.locationId, location.id);
  assert.equal(update.slotId, 'slot-123');
  assert.equal(update.available, false);
  assert.equal(invalidRoom.ok, false);
  client.disconnect();
});
