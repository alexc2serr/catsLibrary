/**
 * httpServer.js
 * Raw TCP socket HTTP/1.1 server — no http module, no Express.
 *
 * Features:
 *   - RFC 9112 compliant request parsing
 *   - Persistent connections (Connection: keep-alive) — HTTP/1.1 compliance
 *   - Chunked transfer encoding support
 *   - Static file serving from /public
 *   - Route chain: auth → cats API → owners API → static → 404
 *   - CORS headers (for GUI client running in browser)
 *   - Configurable port and host via createServer({ port, host })
 */

"use strict";

const net = require("net");
const fs = require("fs");
const path = require("path");

const { parseRequest, serializeResponse } = require("../shared/httpParser");
const { router: catRouter, catStore } = require("./routes");
const { ownerRouter, setCatStore } = require("./ownerRoutes");
const { authRouter, validateToken } = require("./authRoutes");
const { logRequest, authenticate, setTokenValidator } = require("./middleware");
const { makeEmptyResponse } = require("./responseHelpers");

const PUBLIC_DIR = path.join(__dirname, "../../public");

// Wire up: middleware can now validate session tokens from authRoutes
setTokenValidator(validateToken);
// Wire up: ownerRoutes can access the same catStore array
setCatStore(catStore);

// ─── Constants ────────────────────────────────────────────────────────────────

const KEEP_ALIVE_TIMEOUT_MS = 30_000; // 30 s idle timeout
const LARGE_BODY_THRESHOLD = 4096; // bytes — use chunked above this

// ─── MIME types ───────────────────────────────────────────────────────────────

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain",
};

// ─── CORS headers (allow browser GUI on same server) ─────────────────────────

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, X-API-Key, Authorization, X-Session-Token",
};

// ─── Static file serving ──────────────────────────────────────────────────────

function serveStaticFile(reqPath) {
  const filePath =
    reqPath === "/"
      ? path.join(PUBLIC_DIR, "index.html")
      : path.join(PUBLIC_DIR, reqPath);

  // Prevent path traversal (RFC 9110 §2.7.1)
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return serializeResponse({
      statusCode: 403,
      statusText: "Forbidden",
      headers: { "Content-Type": "text/plain", "Content-Length": 9 },
      body: "Forbidden",
    });
  }
  if (!fs.existsSync(filePath)) return null;

  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_TYPES[ext] || "application/octet-stream";
  const buf = fs.readFileSync(filePath);

  return serializeResponse({
    statusCode: 200,
    statusText: "OK",
    headers: {
      "Content-Type": mime,
      "Content-Length": buf.length,
      ...CORS_HEADERS,
    },
    body: buf.toString("binary"),
  });
}

// ─── Request handler ──────────────────────────────────────────────────────────

function handleRequest(rawData, remoteAddress) {
  // ── Parse ─────────────────────────────────────────────────────────────────
  let parsedReq;
  try {
    parsedReq = parseRequest(rawData);
  } catch (err) {
    console.error("[PARSE ERROR]", err.message);
    return {
      response: serializeResponse({
        statusCode: 400,
        statusText: "Bad Request",
        headers: {
          "Content-Type": "text/plain",
          "Content-Length": err.message.length,
        },
        body: `400 Bad Request: ${err.message}`,
      }),
      keepAlive: false,
    };
  }

  // ── OPTIONS preflight (CORS) ──────────────────────────────────────────────
  if (parsedReq.method === "OPTIONS") {
    const resp = makeEmptyResponse(204, "No Content", CORS_HEADERS);
    logRequest(parsedReq, { statusCode: 204 }, remoteAddress);
    return { response: resp, keepAlive: false };
  }

  // ── Determine keep-alive ──────────────────────────────────────────────────
  const connHeader = (
    parsedReq.headers["connection"] || "keep-alive"
  ).toLowerCase();
  const keepAlive = connHeader !== "close";

  // ── Authenticate ──────────────────────────────────────────────────────────
  const auth = authenticate(parsedReq);
  if (!auth.authenticated) {
    const resp = serializeResponse({
      statusCode: 401,
      statusText: "Unauthorized",
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="usj-http-server"',
        Connection: keepAlive ? "keep-alive" : "close",
        ...CORS_HEADERS,
      },
      body: JSON.stringify({ success: false, error: auth.reason }),
    });
    logRequest(parsedReq, { statusCode: 401 }, remoteAddress);
    return { response: resp, keepAlive };
  }

  // ── Route chain ───────────────────────────────────────────────────────────
  const connectionHeader = { Connection: keepAlive ? "keep-alive" : "close" };

  const raw =
    authRouter(parsedReq) ||
    catRouter(parsedReq) ||
    ownerRouter(parsedReq) ||
    serveStaticFile(parsedReq.path);

  if (raw) {
    // Inject Connection header into already-serialized response
    const injected = injectHeaders(raw, {
      ...connectionHeader,
      ...CORS_HEADERS,
    });
    const statusMatch = injected.match(/HTTP\/1\.1 (\d+)/);
    const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 200;
    logRequest(parsedReq, { statusCode }, remoteAddress);
    return { response: injected, keepAlive };
  }

  // ── 404 ───────────────────────────────────────────────────────────────────
  const notFound = serializeResponse({
    statusCode: 404,
    statusText: "Not Found",
    headers: {
      "Content-Type": "application/json",
      ...connectionHeader,
      ...CORS_HEADERS,
    },
    body: JSON.stringify({
      success: false,
      error: `Cannot ${parsedReq.method} ${parsedReq.path}`,
    }),
  });
  logRequest(parsedReq, { statusCode: 404 }, remoteAddress);
  return { response: notFound, keepAlive };
}

/**
 * Injects headers into an already-serialized HTTP response string.
 * Inserts them right before the blank line separating headers from body.
 */
function injectHeaders(rawResponse, headers) {
  const crlfIdx = rawResponse.indexOf("\r\n\r\n");
  if (crlfIdx === -1) return rawResponse;
  const headerLines = Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\r\n");
  return (
    rawResponse.slice(0, crlfIdx) +
    "\r\n" +
    headerLines +
    rawResponse.slice(crlfIdx)
  );
}

// ─── Server factory ───────────────────────────────────────────────────────────

/**
 * Creates a raw TCP HTTP/1.1 server.
 *
 * @param {{ port?: number, host?: string }} [opts]
 * @returns {{ start(), stop(), _server }}
 */
function createServer({ port = 3000, host = "127.0.0.1" } = {}) {
  const tcpServer = net.createServer((socket) => {
    const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    let buffer = "";
    let alive = true;

    // Reset idle timer on each request
    const resetTimer = () => {
      socket.setTimeout(KEEP_ALIVE_TIMEOUT_MS);
    };
    resetTimer();

    socket.on("data", (chunk) => {
      buffer += chunk.toString("binary"); // binary-safe accumulation

      // Need at least the header section to proceed
      if (!buffer.includes("\r\n\r\n")) return;

      const headerEnd = buffer.indexOf("\r\n\r\n");
      const headersRaw = buffer.substring(0, headerEnd);

      // Determine expected body length from Content-Length
      const clMatch = headersRaw.match(/content-length:\s*(\d+)/i);
      const expectedBodyLen = clMatch ? parseInt(clMatch[1], 10) : 0;
      const actualBodyLen = buffer.length - headerEnd - 4;

      if (actualBodyLen < expectedBodyLen) return; // wait for more data

      if (!alive) return;

      const { response, keepAlive } = handleRequest(buffer, remoteAddress);
      buffer = "";
      resetTimer();

      socket.write(response, "binary");

      if (!keepAlive) {
        alive = false;
        socket.end();
      }
    });

    socket.on("timeout", () => {
      alive = false;
      socket.end();
    });

    socket.on("error", (err) => {
      if (err.code !== "ECONNRESET") {
        console.error(`[SOCKET ERROR] ${remoteAddress}: ${err.message}`);
      }
    });

    socket.on("close", () => {
      alive = false;
    });
  });

  return {
    start() {
      tcpServer.listen(port, host, () => {
        console.log(
          `\x1b[32m[SERVER]\x1b[0m Listening on \x1b[36mhttp://${host}:${port}\x1b[0m`,
        );
        console.log(`\x1b[33m[INFO]\x1b[0m  CLI Client → npm run client`);
        console.log(
          `\x1b[33m[INFO]\x1b[0m  GUI Client → http://${host}:${port}/client.html`,
        );
        console.log(
          `\x1b[33m[INFO]\x1b[0m  Quark REST Client (Bruno-like) → http://${host}:${port}/rest-client.html`,
        );
        console.log(
          `\x1b[33m[INFO]\x1b[0m  API auth   → X-API-Key: supersecret-key-123`,
        );
        console.log(
          `\x1b[33m[INFO]\x1b[0m  Keep-Alive → enabled (${KEEP_ALIVE_TIMEOUT_MS / 1000}s idle timeout)`,
        );
      });
    },
    stop() {
      tcpServer.close(() => console.log("[SERVER] Stopped."));
    },
    /** Expose underlying net.Server for testing */
    _server: tcpServer,
  };
}

module.exports = { createServer };
