/**
 * responseHelpers.js
 * Shared HTTP response builder utilities used across all route modules.
 * Avoids duplicating the serialization logic in each route file.
 */

const { serializeResponse } = require('../shared/httpParser');
const crypto = require('crypto');

const SERVER_HEADER = 'usj-http-server/1.0';

// ─── JSON response ────────────────────────────────────────────────────────────

/**
 * Builds a JSON HTTP response.
 * Automatically sets Content-Type, Content-Length, ETag and Last-Modified.
 *
 * @param {number} statusCode
 * @param {string} statusText
 * @param {*}      data         - will be JSON.stringify'd
 * @param {Object} [extraHeaders]
 * @returns {string} serialized HTTP response
 */
function makeResponse(statusCode, statusText, data, extraHeaders = {}) {
  const rawBody = JSON.stringify(data, null, 2);
  const bodyBuf = Buffer.from(rawBody, 'utf8');
  const body = bodyBuf.toString('binary');
  const etag  = `"${crypto.createHash('md5').update(bodyBuf).digest('hex')}"`;
  return serializeResponse({
    statusCode,
    statusText,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': bodyBuf.length,
      'ETag': etag,
      'Last-Modified': new Date().toUTCString(),
      'X-Powered-By': SERVER_HEADER,
      ...extraHeaders,
    },
    body,
  });
}

// ─── Empty response (204, 304, 405 …) ────────────────────────────────────────

/**
 * Builds a response with no body (204 No Content, 304 Not Modified, etc.)
 * @param {number} statusCode
 * @param {string} statusText
 * @param {Object} [extraHeaders]
 * @returns {string} serialized HTTP response
 */
function makeEmptyResponse(statusCode, statusText, extraHeaders = {}) {
  return serializeResponse({
    statusCode,
    statusText,
    headers: {
      'Content-Length': '0',
      'X-Powered-By': SERVER_HEADER,
      ...extraHeaders,
    },
    body: '',
  });
}

// ─── 304 Not Modified ─────────────────────────────────────────────────────────

/**
 * Builds a 304 Not Modified response, reusing the same ETag and Last-Modified.
 * @param {string} etag
 * @returns {string}
 */
function makeNotModified(etag) {
  return serializeResponse({
    statusCode: 304,
    statusText: 'Not Modified',
    headers: {
      'ETag': etag,
      'X-Powered-By': SERVER_HEADER,
      'Content-Length': '0',
    },
    body: '',
  });
}

// ─── Conditional GET helper ───────────────────────────────────────────────────

/**
 * Computes the ETag for a given data value.
 * @param {*} data  (will be JSON.stringify'd)
 * @returns {string} quoted ETag, e.g. `"abc123"`
 */
function computeETag(data) {
  const bodyBuf = Buffer.from(JSON.stringify(data), 'utf8');
  return `"${crypto.createHash('md5').update(bodyBuf).digest('hex')}"`;
}

/**
 * Checks conditional GET request headers (RFC 7232).
 * Returns true if the client's cached version is still fresh.
 *
 * @param {Object} reqHeaders   - parsed request headers
 * @param {string} currentEtag  - computed ETag for current data
 * @returns {boolean}
 */
function isCacheHit(reqHeaders, currentEtag) {
  const ifNoneMatch = reqHeaders['if-none-match'];
  if (ifNoneMatch) {
    return ifNoneMatch === currentEtag || ifNoneMatch === '*';
  }
  // If-Modified-Since: we always consider the resource modified in a live system
  // (would need per-resource timestamps for fine-grained control)
  return false;
}

module.exports = { makeResponse, makeEmptyResponse, makeNotModified, computeETag, isCacheHit };
