/**
 * httpServerTLS.js
 * 🔒 TLS (Basic) — HTTPS server using Node's built-in `tls` module
 *
 * SETUP (run once):
 *   npm run gen-certs     →  generates certs/server.key and certs/server.crt
 *
 * Run:
 *   npm run start:tls     →  starts HTTPS on port 3443
 *
 * The exact same request handling logic is reused from httpServer.js
 * (only the transport layer changes from net.createServer → tls.createServer).
 */

"use strict";

const tls = require("tls");
const fs = require("fs");
const path = require("path");

const { parseRequest, serializeResponse } = require("../shared/httpParser");
const { router: catRouter, catStore } = require("./routes");
const { ownerRouter, setCatStore } = require("./ownerRoutes");
const { authRouter, validateToken } = require("./authRoutes");
const { logRequest, authenticate, setTokenValidator } = require("./middleware");
const { makeEmptyResponse } = require("./responseHelpers");

// Wire up dependencies (same as httpServer.js)
setTokenValidator(validateToken);
setCatStore(catStore);

const CERTS_DIR = path.join(__dirname, "../../certs");

// ─── Keep-alive & CORS config (shared with raw server) ───────────────────────

const KEEP_ALIVE_TIMEOUT_MS = 30_000;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, X-API-Key, Authorization, X-Session-Token",
};

// ─── Static file helper ───────────────────────────────────────────────────────

const PUBLIC_DIR = path.join(__dirname, "../../public");
const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css",
  ".js": "application/javascript",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".ico": "image/x-icon",
};

function serveStaticFile(reqPath) {
  const filePath =
    reqPath === "/"
      ? path.join(PUBLIC_DIR, "index.html")
      : path.join(PUBLIC_DIR, reqPath);
  if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath)) return null;
  const ext = path.extname(filePath).toLowerCase();
  const buf = fs.readFileSync(filePath);
  return serializeResponse({
    statusCode: 200,
    statusText: "OK",
    headers: {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Content-Length": buf.length,
    },
    body: buf.toString("binary"),
  });
}

function injectHeaders(rawResponse, headers) {
  const i = rawResponse.indexOf("\r\n\r\n");
  if (i === -1) return rawResponse;
  const lines = Object.entries(headers)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\r\n");
  return rawResponse.slice(0, i) + "\r\n" + lines + rawResponse.slice(i);
}

// ─── Request handler (identical logic to httpServer.js) ──────────────────────

function handleRequest(rawData, remoteAddress) {
  let parsedReq;
  try {
    parsedReq = parseRequest(rawData);
  } catch (err) {
    return serializeResponse({
      statusCode: 400,
      statusText: "Bad Request",
      headers: { "Content-Type": "text/plain" },
      body: `400 Bad Request: ${err.message}`,
    });
  }

  if (parsedReq.method === "OPTIONS") {
    logRequest(parsedReq, { statusCode: 204 }, remoteAddress);
    return makeEmptyResponse(204, "No Content", CORS_HEADERS);
  }

  const auth = authenticate(parsedReq);
  if (!auth.authenticated) {
    logRequest(parsedReq, { statusCode: 401 }, remoteAddress);
    return serializeResponse({
      statusCode: 401,
      statusText: "Unauthorized",
      headers: {
        "Content-Type": "application/json",
        "WWW-Authenticate": 'Bearer realm="usj-https"',
        ...CORS_HEADERS,
      },
      body: JSON.stringify({ success: false, error: auth.reason }),
    });
  }

  const raw =
    authRouter(parsedReq) ||
    catRouter(parsedReq) ||
    ownerRouter(parsedReq) ||
    serveStaticFile(parsedReq.path);
  if (raw) {
    const injected = injectHeaders(raw, CORS_HEADERS);
    const statusMatch = injected.match(/HTTP\/1\.1 (\d+)/);
    logRequest(
      parsedReq,
      { statusCode: statusMatch ? +statusMatch[1] : 200 },
      remoteAddress,
    );
    return injected;
  }

  logRequest(parsedReq, { statusCode: 404 }, remoteAddress);
  return serializeResponse({
    statusCode: 404,
    statusText: "Not Found",
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
    body: JSON.stringify({
      error: `Cannot ${parsedReq.method} ${parsedReq.path}`,
    }),
  });
}

// ─── TLS Server factory ───────────────────────────────────────────────────────

function createTLSServer({ port = 3443, host = "127.0.0.1" } = {}) {
  const certFile = path.join(CERTS_DIR, "server.crt");
  const keyFile = path.join(CERTS_DIR, "server.key");

  if (!fs.existsSync(certFile) || !fs.existsSync(keyFile)) {
    throw new Error(
      `TLS certificates not found.\nRun: npm run gen-certs\n` +
        `Expected:\n  ${certFile}\n  ${keyFile}`,
    );
  }

  const tlsOptions = {
    cert: fs.readFileSync(certFile),
    key: fs.readFileSync(keyFile),
  };

  const tlsServer = tls.createServer(tlsOptions, (socket) => {
    const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`;
    let buffer = "";

    socket.setTimeout(KEEP_ALIVE_TIMEOUT_MS);

    socket.on("data", (chunk) => {
      buffer += chunk.toString("binary");
      if (!buffer.includes("\r\n\r\n")) return;

      const headerEnd = buffer.indexOf("\r\n\r\n");
      const headersRaw = buffer.substring(0, headerEnd);
      const clMatch = headersRaw.match(/content-length:\s*(\d+)/i);
      const expectedBodyLen = clMatch ? parseInt(clMatch[1], 10) : 0;
      if (buffer.length - headerEnd - 4 < expectedBodyLen) return;

      const response = handleRequest(buffer, remoteAddress);
      buffer = "";
      socket.write(response, "binary");
      socket.end();
    });

    socket.on("timeout", () => socket.end());
    socket.on("error", (err) => {
      if (err.code !== "ECONNRESET")
        console.error(`[TLS SOCKET ERROR] ${err.message}`);
    });
  });

  return {
    start() {
      tlsServer.listen(port, host, () => {
        console.log(
          `\x1b[32m[TLS SERVER]\x1b[0m Listening on \x1b[36mhttps://${host}:${port}\x1b[0m`,
        );
        console.log(`\x1b[33m[INFO]\x1b[0m  CLI Client → npm run client`);
        console.log(
          `\x1b[33m[INFO]\x1b[0m  GUI Client → https://${host}:${port}/client.html`,
        );
        console.log(
          `\x1b[33m[INFO]\x1b[0m  Quark REST Client (Bruno-like) → https://${host}:${port}/rest-client.html`,
        );
        console.log(`\x1b[33m[INFO]\x1b[0m  Traffic is encrypted via TLS`);
      });
    },
    stop() {
      tlsServer.close();
    },
    _server: tlsServer,
  };
}

module.exports = { createTLSServer };
