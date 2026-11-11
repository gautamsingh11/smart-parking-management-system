import { after, test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import mongoose from 'mongoose';
import { app } from '../src/app.js';

after(async () => {
  await mongoose.disconnect();
});

test('GET /api/health reports the API and disconnected database state', async () => {
  const response = await request(app).get('/api/health');

  assert.equal(response.status, 503);
  assert.equal(response.body.status, 'degraded');
  assert.equal(response.body.service, 'smart-parking-api');
  assert.equal(response.body.dependencies.database, 'disconnected');
  assert.ok(Number.isNaN(Date.parse(response.body.timestamp)) === false);
  assert.ok(response.headers['x-content-type-options']);
});

test('unknown API routes return a consistent 404 response', async () => {
  const response = await request(app).get('/api/not-a-route');

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'NOT_FOUND');
});
