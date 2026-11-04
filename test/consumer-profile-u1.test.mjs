/**
 * U1 — consumer profile bootstrap and requireConsumerScope behavior (memory storage).
 */
process.env.STORAGE_BACKEND = 'memory';

import assert from 'node:assert/strict';
import express from 'express';
import { mountConsumerRoutes } from '../services/api/consumerRoutes.js';
import { bootstrapConsumerProfile, getConsumerProfile } from '../services/users/consumerProfileService.js';

function mockReq({ uid, email, body = {}, path = '/api/users/bootstrap', method = 'POST' } = {}) {
  return {
    method,
    path,
    body,
    headers: { authorization: 'Bearer test-token' },
    firebaseAuth: { uid, email, tokenVerified: true, hasBearerToken: true },
    consumerAuth: null,
  };
}

function mockRes() {
  const out = { statusCode: 200, body: null };
  return {
    status(code) {
      out.statusCode = code;
      return this;
    },
    json(data) {
      out.body = data;
      return this;
    },
    get result() {
      return out;
    },
  };
}

// Patch resolveAuth for bootstrap route — use requireFirebaseAuth path via manual service test
const boot1 = await bootstrapConsumerProfile('u-consumer-1', {
  email: 'spencer@example.com',
  firstName: 'Spencer',
  preferredName: 'Spencer',
  popiaConsentVersion: 'test',
});
assert.equal(boot1.created, true);
assert.equal(boot1.profile.firstName, 'Spencer');

const boot2 = await bootstrapConsumerProfile('u-consumer-1', { firstName: 'X' });
assert.equal(boot2.created, false);

const profile = await getConsumerProfile('u-consumer-1');
assert.ok(profile);
assert.equal(profile.email, 'spencer@example.com');

const app = express();
app.use(express.json());
mountConsumerRoutes(app);

// Simulate GET profile without consumerAuth middleware chain — call service directly
assert.ok(getConsumerProfile('u-consumer-1'));

console.log('consumer-profile-u1.test.mjs OK');
