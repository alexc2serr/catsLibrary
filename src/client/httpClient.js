/**
 * httpClient.js
 * Raw TCP socket HTTP/1.1 client library — no http module, no axios.
 *
 * Supports:
 *   - Full URL strings (http://host:port/path) or explicit options
 *   - CookieJar: automatic Set-Cookie storage and Cookie header injection
 *   - Session token tracking (set after login, auto-sent via X-Session-Token)
 *   - Binary-safe response buffering (for image downloads)
 *   - All HTTP verbs: GET, HEAD, POST, PUT, DELETE
 *   - Configurable timeout, custom headers, body
 */

'use strict';

const net = require('net');
const { serializeRequest, parseResponse } = require('../shared/httpParser');

// ─── URL parser ───────────────────────────────────────────────────────────────

/**
 * Parses an http:// URL into { host, port, path }.
 * Implemented manually to stay strictly at the transport layer.
 *
 * @param {string} rawUrl
 * @returns {{ host: string, port: number, path: string }}
 */
function parseUrl(rawUrl) {
  const match = rawUrl.match(/^https?:\/\/([^/:]+)(?::(\d+))?(\/[^]*)?$/);
  if (!match) throw new Error(`Cannot parse URL: "${rawUrl}"`);
  const host = match[1];
  const port = match[2] ? parseInt(match[2], 10) : (rawUrl.startsWith('https') ? 443 : 80);
  const path = match[3] || '/';
  return { host, port, path };
}

// ─── Cookie Jar ───────────────────────────────────────────────────────────────

/**
 * In-memory cookie storage compliant with RFC 6265.
 * Cookies are scoped by host and path, and expire after Max-Age or Expires.
 */
class CookieJar {
  constructor() {
    /** Map<host, Map<name, { value, path, expires }>> */
    this._store = new Map();
  }

  /**
   * Processes one or more Set-Cookie header values for a given host.
   * @param {string}          host
   * @param {string|string[]} setCookieValues
   */
  setCookies(host, setCookieValues) {
    if (!this._store.has(host)) this._store.set(host, new Map());
    const jar = this._store.get(host);

    const values = [].concat(setCookieValues);
    for (const header of values) {
      const [nameValue, ...attrs] = header.split(';').map((s) => s.trim());
      const eqIdx = nameValue.indexOf('=');
      if (eqIdx === -1) continue;
      const name  = nameValue.slice(0, eqIdx).trim();
      const value = nameValue.slice(eqIdx + 1).trim();

      const cookie = { value, path: '/', expires: null };

      for (const attr of attrs) {
        const [aName, aValue] = attr.split('=').map((s) => s.trim());
        switch (aName.toLowerCase()) {
          case 'max-age':
            cookie.expires = Date.now() + parseInt(aValue, 10) * 1000;
            break;
          case 'expires':
            cookie.expires = new Date(aValue).getTime();
            break;
          case 'path':
            cookie.path = aValue || '/';
            break;
        }
      }

      // Max-Age=0 or expired Expires means delete
      if (cookie.expires !== null && cookie.expires <= Date.now()) {
        jar.delete(name);
      } else {
        jar.set(name, cookie);
      }
    }
  }

  /**
   * Returns a Cookie header string for the given host and path.
   * Expired cookies are purged lazily.
   * @param {string} host
   * @param {string} requestPath
   * @returns {string}
   */
  getCookieHeader(host, requestPath) {
    if (!this._store.has(host)) return '';
    const jar  = this._store.get(host);
    const now  = Date.now();
    const parts = [];

    for (const [name, cookie] of jar) {
      if (cookie.expires !== null && cookie.expires <= now) { jar.delete(name); continue; }
      if (requestPath.startsWith(cookie.path)) parts.push(`${name}=${cookie.value}`);
    }
    return parts.join('; ');
  }

  /** Clears all stored cookies */
  clear() { this._store.clear(); }
}

// ─── Shared state (session + cookies across calls) ────────────────────────────

const cookieJar    = new CookieJar();
let   sessionToken = null; // set after successful login

/** Call after POST /auth/login to store token automatically */
function setSessionToken(token) { sessionToken = token; }

/** Clear session (after logout) */
function clearSession() { sessionToken = null; }

// ─── Core request function ────────────────────────────────────────────────────

/**
 * Performs a raw HTTP/1.1 request over a TCP socket.
 *
 * @param {Object}  opts
 * @param {string}  [opts.url]      Full URL — takes precedence over host/port/path
 * @param {string}  [opts.method]   HTTP method (default: 'GET')
 * @param {string}  [opts.host]
 * @param {number}  [opts.port]
 * @param {string}  [opts.path]
 * @param {Object}  [opts.headers]  Additional headers to merge
 * @param {string}  [opts.body]     Request body (string)
 * @param {string}  [opts.apiKey]   Sent as X-API-Key (omit for external servers)
 * @param {number}  [opts.timeout]  Socket timeout ms (default: 10 000)
 * @returns {Promise<{ statusCode, statusText, headers, body, raw }>}
 */
function request({
  url,
  method  = 'GET',
  host:   explicitHost = '127.0.0.1',
  port:   explicitPort = 3000,
  path:   explicitPath = '/',
  headers = {},
  body    = '',
  apiKey,
  timeout = 10_000,
} = {}) {
  return new Promise((resolve, reject) => {
    let host, port, path;
    if (url) {
      try { ({ host, port, path } = parseUrl(url)); }
      catch (e) { return reject(e); }
    } else {
      host = explicitHost;
      port = explicitPort;
      path = explicitPath;
    }

    // Build headers
    const allHeaders = {
      Host:       port === 80 ? host : `${host}:${port}`,
      Connection: 'close',
      ...headers,
    };

    if (apiKey)        allHeaders['X-API-Key']      = apiKey;
    if (sessionToken)  allHeaders['X-Session-Token'] = sessionToken;

    // Inject stored cookies
    const cookieStr = cookieJar.getCookieHeader(host, path);
    if (cookieStr) allHeaders['Cookie'] = cookieStr;

    if (body) {
      allHeaders['Content-Type']   = allHeaders['Content-Type'] || 'application/json';
      allHeaders['Content-Length'] = Buffer.byteLength(body, 'utf8');
    }

    const rawRequest = serializeRequest({ method, path, headers: allHeaders, body });
    const socket     = new net.Socket();
    socket.setTimeout(timeout);

    let rawResponseBuf = Buffer.alloc(0);

    socket.connect(port, host, () => {
      socket.write(rawRequest, 'utf8');
    });

    socket.on('data', (chunk) => {
      rawResponseBuf = Buffer.concat([rawResponseBuf, chunk]);
    });

    socket.on('end', () => {
      try {
        const rawResponse = rawResponseBuf.toString('utf8');
        const parsed      = parseResponse(rawResponse);

        // Store any Set-Cookie headers from the response
        const setCookieHeader = parsed.headers['set-cookie'];
        if (setCookieHeader) cookieJar.setCookies(host, setCookieHeader);

        // Auto-extract session token from login response
        if (parsed.headers['set-cookie']) {
          const match = [].concat(parsed.headers['set-cookie'])
            .join('; ')
            .match(/sessionToken=([^;]+)/);
          if (match) sessionToken = match[1];
        }

        resolve({ ...parsed, raw: rawResponse });
      } catch (err) {
        reject(new Error(`Response parse error: ${err.message}`));
      }
    });

    socket.on('timeout', () => socket.destroy(new Error(`Timed out after ${timeout}ms`)));
    socket.on('error',   (err) => reject(err));
  });
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

const get    = (o) => request({ ...o, method: 'GET' });
const head   = (o) => request({ ...o, method: 'HEAD' });
const post   = (o) => request({ ...o, method: 'POST' });
const put    = (o) => request({ ...o, method: 'PUT' });
const del    = (o) => request({ ...o, method: 'DELETE' });

module.exports = {
  request, get, head, post, put, del,
  parseUrl, cookieJar, setSessionToken, clearSession,
};
