/**
 * authRoutes.js
 * 🔐 Authentication with login flow (SQLite persistence)
 */

'use strict';

const crypto = require('crypto');
const db = require('./db');
const { serializeResponse } = require('../shared/httpParser');
const { makeResponse, makeEmptyResponse } = require('./responseHelpers');

// ─── Constants ────────────────────────────────────────────────────────────────

const PBKDF2_SALT_LEN   = 16;          // bytes
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LEN    = 32;          // bytes
const PBKDF2_DIGEST     = 'sha256';
const TOKEN_EXPIRY_MS   = 60 * 60 * 1000; // 1 hour

// ─── Password utilities ───────────────────────────────────────────────────────

function hashPassword(password, salt = crypto.randomBytes(PBKDF2_SALT_LEN).toString('hex')) {
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, PBKDF2_DIGEST)
    .toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, storedHash) {
  const [salt] = storedHash.split(':');
  const expected = hashPassword(password, salt);
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(storedHash));
  } catch {
    return false;
  }
}

// ─── Token utilities ──────────────────────────────────────────────────────────

function purgeExpiredTokens() {
  const now = Date.now();
  db.prepare('DELETE FROM sessions WHERE expiresAt < ?').run(now);
}

function createToken(userId) {
  purgeExpiredTokens();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAtMs = Date.now() + TOKEN_EXPIRY_MS;
  db.prepare('INSERT INTO sessions (token, userId, expiresAt) VALUES (?, ?, ?)').run(token, userId, expiresAtMs);
  return { token, expiresAt: new Date(expiresAtMs).toISOString() };
}

function validateToken(token) {
  if (!token) return null;
  const session = db.prepare('SELECT userId, expiresAt FROM sessions WHERE token = ?').get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return null;
  }
  return session;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getNextUserId() {
  const ids = db.prepare('SELECT id FROM users ORDER BY id ASC').all().map(r => r.id);
  let nextId = 1;
  for (const id of ids) {
    if (id === nextId) nextId++;
    else break;
  }
  return nextId;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

function registerUser(body) {
  let data;
  try { data = JSON.parse(body); }
  catch { return makeResponse(400, 'Bad Request', { error: 'Invalid JSON body' }); }

  const { username, password } = data;
  if (!username || !password) {
    return makeResponse(422, 'Unprocessable Entity', { error: '"username" and "password" are required' });
  }
  if (password.length < 6) {
    return makeResponse(422, 'Unprocessable Entity', { error: 'Password must be at least 6 characters' });
  }
  
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) {
    return makeResponse(409, 'Conflict', { error: `Username "${username}" is already taken` });
  }

  const newId = getNextUserId();
  const passwordHash = hashPassword(password);
  db.prepare('INSERT INTO users (id, username, passwordHash) VALUES (?, ?, ?)').run(newId, username, passwordHash);
  
  return makeResponse(201, 'Created', { success: true, user: { id: newId, username: username } });
}

function loginUser(body) {
  let data;
  try { data = JSON.parse(body); }
  catch { return makeResponse(400, 'Bad Request', { error: 'Invalid JSON body' }); }

  const { username, password } = data;
  if (!username || !password) {
    return makeResponse(422, 'Unprocessable Entity', { error: '"username" and "password" are required' });
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPassword(password, user.passwordHash)) {
    return makeResponse(401, 'Unauthorized', { error: 'Invalid username or password' });
  }

  const { token, expiresAt } = createToken(user.id);
  const bodyStr = JSON.stringify({
    success: true,
    token,
    expiresAt,
    user: { id: user.id, username: user.username },
  }, null, 2);

  return serializeResponse({
    statusCode: 200,
    statusText: 'OK',
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(bodyStr),
      'Set-Cookie': `sessionToken=${token}; HttpOnly; Path=/; Max-Age=3600; SameSite=Strict`,
      'X-Powered-By': 'usj-http-server/1.0',
    },
    body: bodyStr,
  });
}

function logoutUser(token) {
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  return makeEmptyResponse(204, 'No Content', {
    'Set-Cookie': 'sessionToken=; HttpOnly; Path=/; Max-Age=0',
  });
}

function getCurrentUser(token) {
  const session = validateToken(token);
  if (!session) {
    return makeResponse(401, 'Unauthorized', { error: 'Invalid or expired session token' });
  }
  const user = db.prepare('SELECT id, username FROM users WHERE id = ?').get(session.userId);
  if (!user) return makeResponse(404, 'Not Found', { error: 'User not found' });
  return makeResponse(200, 'OK', { success: true, user: { id: user.id, username: user.username } });
}

// ─── Router ───────────────────────────────────────────────────────────────────

function authRouter(parsedReq) {
  const { method, path: reqPath, body, headers } = parsedReq;
  const cleanPath = reqPath.split('?')[0];

  const sessionToken =
    headers['x-session-token'] ||
    require('./middleware').parseCookies(headers['cookie'])['sessionToken'];

  if (cleanPath === '/auth/register' && method === 'POST') return registerUser(body);
  if (cleanPath === '/auth/login'    && method === 'POST') return loginUser(body);
  if (cleanPath === '/auth/logout'   && method === 'POST') return logoutUser(sessionToken);
  if (cleanPath === '/auth/me'       && method === 'GET')  return getCurrentUser(sessionToken);

  return null;
}

module.exports = { authRouter, validateToken };
