/**
 * middleware.js
 * 📓 Logging & 🔑 Authentication middleware (plus 🍪 Cookie parsing)
 */

'use strict';

const fs   = require('fs');
const path = require('path');
const db   = require('./db');

const LOG_FILE = path.join(__dirname, '../../logs/access.log');

// Ensure logs directory exists
const logsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// ─── Cookie Parsing ───────────────────────────────────────────────────────────

function parseCookies(cookieHeader) {
  if (!cookieHeader) return {};
  return Object.fromEntries(
    cookieHeader.split(';').map((part) => {
      const eqIdx = part.indexOf('=');
      if (eqIdx === -1) return [part.trim(), ''];
      return [part.slice(0, eqIdx).trim(), part.slice(eqIdx + 1).trim()];
    }),
  );
}

// ─── API Key Validation ───────────────────────────────────────────────────────

function isValidApiKey(key) {
  if (!key) return false;
  const row = db.prepare('SELECT 1 FROM api_keys WHERE key = ?').get(key);
  return !!row;
}

// ─── Logging Middleware ───────────────────────────────────────────────────────

function logRequest(parsedReq, res, remoteAddr = '-') {
  const ts        = new Date().toISOString();
  const method    = parsedReq.method      || '-';
  const reqPath   = parsedReq.path        || '-';
  const http      = parsedReq.httpVersion || 'HTTP/1.1';
  const status    = res.statusCode        || '-';
  const userAgent = parsedReq.headers?.['user-agent'] || '-';
  const referer   = parsedReq.headers?.['referer']    || '-';
  const contentLen = res.contentLength    || '-';

  const logLine = `[${ts}] ${remoteAddr} "${method} ${reqPath} ${http}" ${status} ${contentLen} "${referer}" "${userAgent}"`;

  const statusColor =
    status  < 300 ? '\x1b[32m' :
    status  < 400 ? '\x1b[33m' :
    status  < 500 ? '\x1b[31m' : '\x1b[35m';
  console.log(`\x1b[36m[ACCESS]\x1b[0m ${remoteAddr} ${statusColor}${status}\x1b[0m ${method} ${reqPath}`);

  fs.appendFile(LOG_FILE, logLine + '\n', (err) => {
    if (err) console.error('[LOG ERROR]', err.message);
  });
}

// ─── Authentication Middleware ────────────────────────────────────────────────

let _validateToken = null;

function setTokenValidator(fn) { _validateToken = fn; }

function authenticate(parsedReq) {
  const reqPath = (parsedReq.path || '/').split('?')[0];

  if (!reqPath.startsWith('/api/') && reqPath !== '/api') {
    return { authenticated: true };
  }

  const headers = parsedReq.headers || {};

  // 1. X-API-Key header
  const apiKey = headers['x-api-key'];
  if (isValidApiKey(apiKey)) return { authenticated: true };

  // 2. Authorization: Bearer <token>
  const authHeader = headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearerKey = authHeader.slice(7).trim();
    if (isValidApiKey(bearerKey)) return { authenticated: true };
    if (_validateToken && _validateToken(bearerKey)) return { authenticated: true };
  }

  // 3. Session token from cookie
  const cookies = parseCookies(headers['cookie']);
  const cookieToken = cookies['sessionToken'];
  if (cookieToken && _validateToken && _validateToken(cookieToken)) {
    return { authenticated: true };
  }

  // 4. X-Session-Token header
  const xSessionToken = headers['x-session-token'];
  if (xSessionToken && _validateToken && _validateToken(xSessionToken)) {
    return { authenticated: true };
  }

  return {
    authenticated: false,
    reason: 'Unauthorized. Provide X-API-Key, Authorization: Bearer <key>, or log in via POST /auth/login.',
  };
}

module.exports = { logRequest, authenticate, parseCookies, setTokenValidator, isValidApiKey };
