/**
 * api.test.js
 * 🧪 Automated Tests — USJ HTTP Project
 *
 * Uses Node.js built-in `node:test` and `node:assert` modules (no extra deps).
 * Tests every endpoint of the raw TCP socket server end-to-end.
 *
 * Prerequisites:
 *   Start the server first:  npm start
 *   Then run tests:          npm test
 */

'use strict';

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');

const { request } = require('../src/client/httpClient');

const SERVER = { host: '127.0.0.1', port: 3000 };
const KEY    = 'supersecret-key-123';

const api = (method, path, body) =>
  request({ ...SERVER, method, path, apiKey: KEY, body });

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseBody(res) {
  try { return JSON.parse(res.body); }
  catch { return null; }
}

// ─── Test Suites ──────────────────────────────────────────────────────────────

describe('HTTP Parser — sanity check', () => {
  test('GET / returns 200 and HTML', async () => {
    const res = await request({ ...SERVER, method: 'GET', path: '/' });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'] || '', /html/);
  });

  test('Unknown path returns 404', async () => {
    const res = await api('GET', '/this-does-not-exist');
    assert.equal(res.statusCode, 404);
  });
});

describe('Authentication', () => {
  test('Missing auth key returns 401 on /api/cats', async () => {
    const res = await request({ ...SERVER, method: 'GET', path: '/api/cats' });
    assert.equal(res.statusCode, 401);
  });

  test('Valid X-API-Key returns 200', async () => {
    const res = await api('GET', '/api/cats');
    assert.equal(res.statusCode, 200);
  });

  test('Register + login flow', async () => {
    const uname = `testuser_${Date.now()}`;

    // Register
    const reg = await api('POST', '/auth/register', JSON.stringify({ username: uname, password: 'Test123' }));
    assert.equal(reg.statusCode, 201);
    const regBody = parseBody(reg);
    assert.ok(regBody.user.id);

    // Login
    const login = await api('POST', '/auth/login', JSON.stringify({ username: uname, password: 'Test123' }));
    assert.equal(login.statusCode, 200);
    const loginBody = parseBody(login);
    assert.ok(loginBody.token);
    assert.ok(loginBody.expiresAt);
  });

  test('Wrong password returns 401', async () => {
    const uname = `wrongpwd_${Date.now()}`;
    await api('POST', '/auth/register', JSON.stringify({ username: uname, password: 'Test123' }));
    const res = await api('POST', '/auth/login', JSON.stringify({ username: uname, password: 'WrongPassword' }));
    assert.equal(res.statusCode, 401);
  });

  test('Duplicate username returns 409', async () => {
    const uname = `dup_${Date.now()}`;
    await api('POST', '/auth/register', JSON.stringify({ username: uname, password: 'Test123' }));
    const res = await api('POST', '/auth/register', JSON.stringify({ username: uname, password: 'Test123' }));
    assert.equal(res.statusCode, 409);
  });
});

describe('Cats CRUD', () => {
  let createdId;

  test('GET /api/cats → 200 with array', async () => {
    const res = await api('GET', '/api/cats');
    assert.equal(res.statusCode, 200);
    const body = parseBody(res);
    assert.ok(Array.isArray(body.data));
    assert.ok(body.count >= 0);
  });

  test('POST /api/cats → 201 with new cat', async () => {
    const res = await api('POST', '/api/cats', JSON.stringify({
      name: 'TestCat', breed: 'Persian', age: 1, color: 'White',
    }));
    assert.equal(res.statusCode, 201);
    const body = parseBody(res);
    assert.equal(body.data.name, 'TestCat');
    createdId = body.data.id;
  });

  test('POST /api/cats missing name → 422', async () => {
    const res = await api('POST', '/api/cats', JSON.stringify({ breed: 'Persian' }));
    assert.equal(res.statusCode, 422);
  });

  test('POST /api/cats bad JSON → 400', async () => {
    const res = await request({ ...SERVER, method: 'POST', path: '/api/cats',
      apiKey: KEY, body: 'NOT JSON', headers: { 'Content-Type': 'application/json' } });
    assert.equal(res.statusCode, 400);
  });

  test('GET /api/cats/:id → 200', async () => {
    const res = await api('GET', `/api/cats/${createdId}`);
    assert.equal(res.statusCode, 200);
    assert.equal(parseBody(res).data.id, createdId);
  });

  test('GET /api/cats/99999 → 404', async () => {
    const res = await api('GET', '/api/cats/99999');
    assert.equal(res.statusCode, 404);
  });

  test('PUT /api/cats/:id → 200 with updated data', async () => {
    const res = await api('PUT', `/api/cats/${createdId}`, JSON.stringify({
      name: 'UpdatedCat', breed: 'Siamese', age: 3, color: 'Blue',
    }));
    assert.equal(res.statusCode, 200);
    assert.equal(parseBody(res).data.name, 'UpdatedCat');
  });

  test('PUT /api/cats/99999 → 404', async () => {
    const res = await api('PUT', '/api/cats/99999', JSON.stringify({ name: 'X', breed: 'Y' }));
    assert.equal(res.statusCode, 404);
  });

  test('DELETE /api/cats/:id → 204 No Content', async () => {
    const res = await api('DELETE', `/api/cats/${createdId}`);
    assert.equal(res.statusCode, 204);
    assert.equal(res.body.trim(), '');
  });

  test('DELETE /api/cats/99999 → 404', async () => {
    const res = await api('DELETE', '/api/cats/99999');
    assert.equal(res.statusCode, 404);
  });

  test('PATCH /api/cats → 405 Method Not Allowed with Allow header', async () => {
    const res = await api('PATCH', '/api/cats');
    assert.equal(res.statusCode, 405);
    assert.ok(res.headers['allow']);
  });
});

describe('Conditional GET (ETag)', () => {
  test('GET /api/cats returns ETag header', async () => {
    const res = await api('GET', '/api/cats');
    assert.ok(res.headers['etag'], 'ETag header should be present');
  });

  test('If-None-Match with matching ETag → 304 Not Modified', async () => {
    const first = await api('GET', '/api/cats');
    const etag  = first.headers['etag'];
    assert.ok(etag);

    const second = await request({
      ...SERVER, method: 'GET', path: '/api/cats', apiKey: KEY,
      headers: { 'If-None-Match': etag },
    });
    if (second.statusCode !== 304) console.log('ETAG DEBUG:', etag, second.statusCode, second.headers); assert.equal(second.statusCode, 304);
  });

  test('If-None-Match with stale ETag → 200', async () => {
    const res = await request({
      ...SERVER, method: 'GET', path: '/api/cats', apiKey: KEY,
      headers: { 'If-None-Match': '"stale-etag-value"' },
    });
    assert.equal(res.statusCode, 200);
  });
});

describe('HEAD requests', () => {
  test('HEAD /api/cats → 200 with no body', async () => {
    const res = await api('HEAD', '/api/cats');
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.trim(), '');
  });
});

describe('Owners CRUD', () => {
  let ownerId;

  test('GET /api/owners → 200', async () => {
    const res = await api('GET', '/api/owners');
    assert.equal(res.statusCode, 200);
    assert.ok(Array.isArray(parseBody(res).data));
  });

  test('POST /api/owners → 201', async () => {
    const res = await api('POST', '/api/owners', JSON.stringify({
      name: 'Test Owner', email: 'test@test.com',
    }));
    assert.equal(res.statusCode, 201);
    ownerId = parseBody(res).data.id;
    assert.ok(ownerId);
  });

  test('GET /api/owners/:id → 200 with cats embedded', async () => {
    const res = await api('GET', `/api/owners/${ownerId}`);
    assert.equal(res.statusCode, 200);
    const body = parseBody(res);
    assert.ok(Array.isArray(body.data.cats));
  });

  test('DELETE /api/owners/:id → 204', async () => {
    const res = await api('DELETE', `/api/owners/${ownerId}`);
    assert.equal(res.statusCode, 204);
  });
});

describe('Static file serving', () => {
  test('GET / returns HTML', async () => {
    const res = await request({ ...SERVER, method: 'GET', path: '/' });
    assert.equal(res.statusCode, 200);
    assert.match(res.headers['content-type'] || '', /html/);
  });

  test('GET /client.html returns HTML', async () => {
    const res = await request({ ...SERVER, method: 'GET', path: '/client.html' });
    assert.equal(res.statusCode, 200);
  });
});
