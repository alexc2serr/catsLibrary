/**
 * middleware.js
 * 📓 Logging & 🔑 Authentication middleware (plus 🍪 Cookie parsing)
 *
 * Two middlewares form the processing chain for every incoming request:
 *   1. logRequest  — writes Combined Log Format to stdout and logs/access.log
 *   2. authenticate — validates API key OR session token (from header or cookie)
 *
 * Cookie parsing follows RFC 6265:
 *   Parses Cookie: <name>=<value>; <name>=<value> into a plain object.
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const LOG_FILE = path.join(__dirname, '../../logs/access.log');

// Ensure logs directory exists
const logsDir = path.dirname(LOG_FILE);
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });

// ─── Valid API Keys ───────────────────────────────────────────────────────────

/**
 * Allowlisted API keys.
 * In production these would be loaded from env vars or a database.
 */
const VALID_API_KEYS = new Set(['supersecret-key-123', 'dev-key-abc']);

// ─── Cookie Parsing ───────────────────────────────────────────────────────────

/**
 * Parses the Cookie request header into a plain object.
 * RFC 6265 §5.2: cookie-string = cookie-pair *( ";" SP cookie-pair )
 *
 * @param {string|undefined} cookieHeader
 * @returns {Object<string, string>}
 */
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

// ─── Logging Middleware ───────────────────────────────────────────────────────

/**
 * Logs a request/response pair in Apache Combined Log Format.
 * Writes to stdout (coloured) and to logs/access.log.
 *
 * @param {Object} parsedReq  - { method, path, httpVersion, headers }
 * @param {Object} res        - { statusCode }
 * @param {string} remoteAddr - client IP:port
 */
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

  // Colour-coded stdout
  const statusColor =
    status  < 300 ? '\x1b[32m' :
    status  < 400 ? '\x1b[33m' :
    status  < 500 ? '\x1b[31m' : '\x1b[35m';
  console.log(`\x1b[36m[ACCESS]\x1b[0m ${remoteAddr} ${statusColor}${status}\x1b[0m ${method} ${reqPath}`);

  // Append to file (async, non-blocking)
  fs.appendFile(LOG_FILE, logLine + '\n', (err) => {
    if (err) console.error('[LOG ERROR]', err.message);
  });
}

// ─── Authentication Middleware ────────────────────────────────────────────────

/**
 * Validates that a request is properly authenticated.
 *
 * Authentication is required ONLY for /api/* paths.
 * /auth/* paths and all static files are always public.
 *
 * Three accepted methods (evaluated in order):
 *   1. X-API-Key header
 *   2. Authorization: Bearer <token> header
 *   3. sessionToken cookie (set by POST /auth/login)
 *   4. X-Session-Token header (also set by login for programmatic clients)
 *
 * Note: session token validation is delegated to authRoutes.validateToken
 * to avoid a circular dependency. The server injects it via setTokenValidator().
 *
 * @param {Object} parsedReq
 * @returns {{ authenticated: boolean, reason?: string }}
 */

let _validateToken = null;

/** Called once by httpServer.js to wire up the session token validator */
function setTokenValidator(fn) { _validateToken = fn; }

function authenticate(parsedReq) {
  const reqPath = (parsedReq.path || '/').split('?')[0];

  // /auth/* and all non-API paths are public
  if (!reqPath.startsWith('/api/') && reqPath !== '/api') {
    return { authenticated: true };
  }

  const headers = parsedReq.headers || {};

  // 1. X-API-Key header
  const apiKey = headers['x-api-key'];
  if (apiKey && VALID_API_KEYS.has(apiKey)) return { authenticated: true };

  // 2. Authorization: Bearer <token>
  const authHeader = headers['authorization'] || '';
  if (authHeader.startsWith('Bearer ')) {
    const bearerKey = authHeader.slice(7).trim();
    if (VALID_API_KEYS.has(bearerKey)) return { authenticated: true };
    // Could also be a session token delivered as a Bearer token
    if (_validateToken && _validateToken(bearerKey)) return { authenticated: true };
  }

  // 3. Session token from cookie
  const cookies = parseCookies(headers['cookie']);
  const cookieToken = cookies['sessionToken'];
  if (cookieToken && _validateToken && _validateToken(cookieToken)) {
    return { authenticated: true };
  }

  // 4. X-Session-Token header (for programmatic clients that prefer headers)
  const xSessionToken = headers['x-session-token'];
  if (xSessionToken && _validateToken && _validateToken(xSessionToken)) {
    return { authenticated: true };
  }

  return {
    authenticated: false,
    reason: 'Unauthorized. Provide X-API-Key, Authorization: Bearer <key>, or log in via POST /auth/login.',
  };
}

module.exports = { logRequest, authenticate, parseCookies, setTokenValidator, VALID_API_KEYS };
