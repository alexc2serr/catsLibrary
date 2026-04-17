/**
 * httpParser.js
 * RFC 9112-compliant HTTP/1.1 message parser and serializer.
 * Handles:
 *   - CRLF (\r\n) line endings
 *   - Multi-value headers stored as arrays
 *   - Chunked Transfer-Encoding (encoding and decoding)
 *   - Content-Length framing
 */

'use strict';

const CRLF        = '\r\n';
const CRLF_DOUBLE = '\r\n\r\n';

// ─── Request parsing ──────────────────────────────────────────────────────────

/**
 * Parses a raw HTTP/1.1 request string into a structured object.
 * RFC 9112 §3: message format
 *
 * @param {string} rawRequest
 * @returns {{ method, path, httpVersion, headers, body }}
 */
function parseRequest(rawRequest) {
  const headerBodySplit = rawRequest.indexOf(CRLF_DOUBLE);
  if (headerBodySplit === -1) {
    throw new Error('Malformed HTTP request: missing header/body separator (\\r\\n\\r\\n)');
  }

  const headerSection = rawRequest.substring(0, headerBodySplit);
  let   body          = rawRequest.substring(headerBodySplit + 4);

  const lines       = headerSection.split(CRLF);
  const requestLine = lines[0];
  const headerLines = lines.slice(1);

  // RFC 9112 §3.1: request-line = method SP request-target SP HTTP-version
  const spaceIdx1 = requestLine.indexOf(' ');
  const spaceIdx2 = requestLine.lastIndexOf(' ');
  if (spaceIdx1 === -1 || spaceIdx1 === spaceIdx2) {
    throw new Error(`Malformed request line: "${requestLine}"`);
  }

  const method      = requestLine.substring(0, spaceIdx1).toUpperCase();
  const path        = requestLine.substring(spaceIdx1 + 1, spaceIdx2);
  const httpVersion = requestLine.substring(spaceIdx2 + 1);
  const headers     = parseHeaders(headerLines);

  // Decode chunked body if necessary
  if (headers['transfer-encoding']?.toLowerCase().includes('chunked')) {
    body = decodeChunked(body);
  }

  return { method, path, httpVersion, headers, body };
}

// ─── Response parsing ─────────────────────────────────────────────────────────

/**
 * Parses a raw HTTP/1.1 response string into a structured object.
 *
 * @param {string} rawResponse
 * @returns {{ httpVersion, statusCode, statusText, headers, body }}
 */
function parseResponse(rawResponse) {
  const headerBodySplit = rawResponse.indexOf(CRLF_DOUBLE);
  if (headerBodySplit === -1) {
    throw new Error('Malformed HTTP response: missing header/body separator (\\r\\n\\r\\n)');
  }

  const headerSection = rawResponse.substring(0, headerBodySplit);
  let   body          = rawResponse.substring(headerBodySplit + 4);

  const lines       = headerSection.split(CRLF);
  const statusLine  = lines[0];
  const headerLines = lines.slice(1);

  // RFC 9112 §4: status-line = HTTP-version SP status-code SP reason-phrase
  const parts      = statusLine.split(' ');
  const httpVersion = parts[0];
  const statusCode  = parseInt(parts[1], 10);
  const statusText  = parts.slice(2).join(' ');

  if (isNaN(statusCode)) {
    throw new Error(`Malformed status line: "${statusLine}"`);
  }

  const headers = parseHeaders(headerLines);

  // Decode chunked body if necessary
  if (headers['transfer-encoding']?.toLowerCase().includes('chunked')) {
    body = decodeChunked(body);
  }

  return { httpVersion, statusCode, statusText, headers, body };
}

// ─── Header parsing ───────────────────────────────────────────────────────────

/**
 * Parses header lines into a key-value object.
 * RFC 9112 §5: field-name ":" OWS field-value OWS
 * Multi-value headers (e.g. Set-Cookie) are stored as string arrays.
 *
 * @param {string[]} lines
 * @returns {Object<string, string|string[]>}
 */
function parseHeaders(lines) {
  const headers = {};
  for (const line of lines) {
    if (!line.trim()) continue;
    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const name  = line.substring(0, colonIndex).trim().toLowerCase();
    const value = line.substring(colonIndex + 1).trim();
    if (headers[name] !== undefined) {
      headers[name] = [].concat(headers[name], value);
    } else {
      headers[name] = value;
    }
  }
  return headers;
}

// ─── Request serialization ────────────────────────────────────────────────────

/**
 * Serializes a request object into a raw HTTP/1.1 request string.
 * @param {{ method, path, headers, body }} req
 * @returns {string}
 */
function serializeRequest({ method, path, headers = {}, body = '' }) {
  const requestLine  = `${method.toUpperCase()} ${path} HTTP/1.1`;
  const headerLines  = serializeHeaders(headers);
  return `${requestLine}${CRLF}${headerLines}${CRLF_DOUBLE}${body}`;
}

// ─── Response serialization ───────────────────────────────────────────────────

/**
 * Serializes a response object into a raw HTTP/1.1 response string.
 *
 * @param {{ statusCode, statusText, headers, body, chunked? }} res
 *   If `chunked: true`, uses Transfer-Encoding: chunked (omits Content-Length).
 * @returns {string}
 */
function serializeResponse({ statusCode, statusText = '', headers = {}, body = '', chunked = false }) {
  const statusLine = `HTTP/1.1 ${statusCode} ${statusText}`;

  let finalHeaders = { ...headers };
  let finalBody    = body;

  if (chunked) {
    delete finalHeaders['content-length'];
    delete finalHeaders['Content-Length'];
    finalHeaders['Transfer-Encoding'] = 'chunked';
    finalBody = encodeChunked(body);
  }

  const headerLines = serializeHeaders(finalHeaders);
  return `${statusLine}${CRLF}${headerLines}${CRLF_DOUBLE}${finalBody}`;
}

// ─── Chunked Transfer-Encoding ────────────────────────────────────────────────

const CHUNK_SIZE = 1024; // bytes per chunk

/**
 * Encodes a string body as chunked transfer encoding.
 * RFC 9112 §7.1: chunked-body = *chunk last-chunk trailer-section CRLF
 *
 * @param {string} body
 * @returns {string}
 */
function encodeChunked(body) {
  if (!body) return `0${CRLF}${CRLF}`;

  const buf = Buffer.from(body, 'utf8');
  let result = '';

  for (let offset = 0; offset < buf.length; offset += CHUNK_SIZE) {
    const chunk     = buf.slice(offset, offset + CHUNK_SIZE);
    const chunkHex  = chunk.length.toString(16);
    result += `${chunkHex}${CRLF}${chunk.toString('utf8')}${CRLF}`;
  }

  result += `0${CRLF}${CRLF}`; // last-chunk
  return result;
}

/**
 * Decodes a chunked transfer-encoded body.
 * @param {string} chunkedBody
 * @returns {string} decoded body
 */
function decodeChunked(chunkedBody) {
  let result = '';
  let remaining = chunkedBody;

  while (remaining.length > 0) {
    const crlfIdx = remaining.indexOf(CRLF);
    if (crlfIdx === -1) break;

    const sizeLine = remaining.substring(0, crlfIdx).trim().split(';')[0]; // strip extensions
    const chunkSize = parseInt(sizeLine, 16);
    if (isNaN(chunkSize) || chunkSize === 0) break; // last-chunk

    const chunkStart = crlfIdx + 2;
    const chunkEnd   = chunkStart + chunkSize;
    result   += remaining.substring(chunkStart, chunkEnd);
    remaining = remaining.substring(chunkEnd + 2); // skip trailing CRLF
  }

  return result;
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

function serializeHeaders(headers) {
  return Object.entries(headers)
    .flatMap(([k, v]) => Array.isArray(v) ? v.map((val) => `${k}: ${val}`) : [`${k}: ${v}`])
    .join(CRLF);
}

module.exports = {
  parseRequest,
  parseResponse,
  serializeRequest,
  serializeResponse,
  parseHeaders,
  encodeChunked,
  decodeChunked,
};
