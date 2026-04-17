/**
 * authRoutes.js
 * 🔐 Authentication with login flow (Optional feature — Medium difficulty)
 *
 * Endpoints:
 *   POST /auth/register   { username, password }  → 201 { user }
 *   POST /auth/login      { username, password }  → 200 { token, expiresAt }
 *   POST /auth/logout     (X-Session-Token header) → 204
 *   GET  /auth/me         (X-Session-Token header) → 200 { user }
 *
 * Security:
 *   - Passwords hashed with PBKDF2-SHA256 (100 000 iterations) + random salt
 *   - Tokens are 32-byte cryptographically random hex strings
 *   - Tokens expire after TOKEN_EXPIRY_MS (default: 1 hour)
 *   - Token also delivered via HttpOnly cookie (Set-Cookie: sessionToken=…)
 */

'use strict';

const crypto = require('crypto');
const { serializeResponse } = require('../shared/httpParser');
const { makeResponse, makeEmptyResponse } = require('./responseHelpers');

// ─── Constants ────────────────────────────────────────────────────────────────

const PBKDF2_SALT_LEN   = 16;          // bytes
const PBKDF2_ITERATIONS = 100_000;
const PBKDF2_KEY_LEN    = 32;          // bytes
const PBKDF2_DIGEST     = 'sha256';
const TOKEN_EXPIRY_MS   = 60 * 60 * 1000; // 1 hour

// ─── In-memory stores ─────────────────────────────────────────────────────────

/** @type {{ id: number, username: string, passwordHash: string }[]} */
let userStore = [];
let nextUserId = 1;

/**
 * Session map: token (hex) → { userId: number, expiresAt: number (ms) }
 */
const sessionStore = new Map();

// ─── Password utilities ───────────────────────────────────────────────────────

/**
 * Hashes a password using PBKDF2.
 * @param {string} password
 * @param {string} [salt] - hex string. Generated randomly if omitted.
 * @returns {string} `"<salt_hex>:<hash_hex>"`
 */
function hashPassword(password, salt = crypto.randomBytes(PBKDF2_SALT_LEN).toString('hex')) {
  const hash = crypto
    .pbkdf2Sync(password, salt, PBKDF2_ITERATIONS, PBKDF2_KEY_LEN, PBKDF2_DIGEST)
    .toString('hex');
  return `${salt}:${hash}`;
}

/**
 * Verifies a plain-text password against a stored PBKDF2 hash.
 * Uses timing-safe comparison to prevent timing attacks.
 * @param {string} password
 * @param {string} storedHash - `"<salt_hex>:<hash_hex>"`
 * @returns {boolean}
 */
function verifyPassword(password, storedHash) {
  const [salt] = storedHash.split(':');
  const expected = hashPassword(password, salt);
  // Constant-time comparison
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(storedHash));
  } catch {
    return false;
  }
}

// ─── Token utilities ──────────────────────────────────────────────────────────

/** Removes all expired tokens from the session store. */
function purgeExpiredTokens() {
  const now = Date.now();
  for (const [token, session] of sessionStore) {
    if (session.expiresAt < now) sessionStore.delete(token);
  }
}

/**
 * Creates a new session token for a user.
 * @param {number} userId
 * @returns {{ token: string, expiresAt: string }} ISO 8601 expiry string
 */
function createToken(userId) {
  purgeExpiredTokens();
  const token = crypto.randomBytes(32).toString('hex');
  const expiresAtMs = Date.now() + TOKEN_EXPIRY_MS;
  sessionStore.set(token, { userId, expiresAt: expiresAtMs });
  return { token, expiresAt: new Date(expiresAtMs).toISOString() };
}

/**
 * Validates a session token.
 * @param {string|null} token
 * @returns {{ userId: number, expiresAt: number } | null}
 */
function validateToken(token) {
  if (!token) return null;
  const session = sessionStore.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessionStore.delete(token);
    return null;
  }
  return session;
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
  if (userStore.find((u) => u.username === username)) {
    return makeResponse(409, 'Conflict', { error: `Username "${username}" is already taken` });
  }

  const user = { id: nextUserId++, username, passwordHash: hashPassword(password) };
  userStore.push(user);
  return makeResponse(201, 'Created', { success: true, user: { id: user.id, username: user.username } });
}

function loginUser(body) {
  let data;
  try { data = JSON.parse(body); }
  catch { return makeResponse(400, 'Bad Request', { error: 'Invalid JSON body' }); }

  const { username, password } = data;
  if (!username || !password) {
    return makeResponse(422, 'Unprocessable Entity', { error: '"username" and "password" are required' });
  }

  const user = userStore.find((u) => u.username === username);
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

  // Return token both in body AND as an HttpOnly cookie
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
  if (token) sessionStore.delete(token);
  return makeEmptyResponse(204, 'No Content', {
    'Set-Cookie': 'sessionToken=; HttpOnly; Path=/; Max-Age=0',
  });
}

function getCurrentUser(token) {
  const session = validateToken(token);
  if (!session) {
    return makeResponse(401, 'Unauthorized', { error: 'Invalid or expired session token' });
  }
  const user = userStore.find((u) => u.id === session.userId);
  if (!user) return makeResponse(404, 'Not Found', { error: 'User not found' });
  return makeResponse(200, 'OK', { success: true, user: { id: user.id, username: user.username } });
}

// ─── Cookie helper ────────────────────────────────────────────────────────────

function extractTokenFromCookie(cookieHeader) {
  if (!cookieHeader) return null;
  const match = cookieHeader.match(/(?:^|;\s*)sessionToken=([^;]+)/);
  return match ? match[1] : null;
}

// ─── Router ───────────────────────────────────────────────────────────────────

function authRouter(parsedReq) {
  const { method, path: reqPath, body, headers } = parsedReq;
  const cleanPath = reqPath.split('?')[0];

  const sessionToken =
    headers['x-session-token'] ||
    extractTokenFromCookie(headers['cookie']);

  if (cleanPath === '/auth/register' && method === 'POST') return registerUser(body);
  if (cleanPath === '/auth/login'    && method === 'POST') return loginUser(body);
  if (cleanPath === '/auth/logout'   && method === 'POST') return logoutUser(sessionToken);
  if (cleanPath === '/auth/me'       && method === 'GET')  return getCurrentUser(sessionToken);

  return null;
}

module.exports = { authRouter, validateToken, sessionStore };
