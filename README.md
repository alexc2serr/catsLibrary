# USJ HTTP Project — Technical Report
> **Universidad San Jorge · Redes y Comunicaciones 2**  
> **Deadline**: 13 May 2026 · **Live Demo**: 18-20 May 2026

---

## Table of Contents
1. [Project Overview](#project-overview)
2. [Architecture](#architecture)
3. [Quick Start](#quick-start)
4. [API Reference](#api-reference)
5. [Mandatory Features](#mandatory-features)
6. [Optional Features](#optional-features)
7. [RFC 9112 Compliance](#rfc-9112-compliance)
8. [Design Decisions & Challenges](#design-decisions--challenges)
9. [AI Tool Usage](#ai-tool-usage)
10. [Work Distribution](#work-distribution)
11. [Future Improvements](#future-improvements)

---

## Project Overview

This project implements a complete **HTTP/1.1 client and server** from scratch using only Node.js transport-layer primitives (`net.createServer`, `net.Socket`). No HTTP libraries (Express, Axios, `http` module) are used for the core implementation.

The server exposes a **RESTful API** for a cat shelter application, while the client is an interactive CLI capable of sending requests to the local server and any external HTTP server.

**Technology stack**: Node.js 18+ · Vanilla JavaScript (CommonJS) · Zero runtime dependencies for the core protocol

---

## Architecture

```
usj-http-project/
├── src/
│   ├── shared/
│   │   └── httpParser.js        # RFC 9112 parser & serializer (CRLF, chunked)
│   ├── server/
│   │   ├── httpServer.js        # Raw TCP server (net.createServer)
│   │   ├── httpServerTLS.js     # TLS variant (tls.createServer)
│   │   ├── httpServerExpress.js # Framework refactor (Express)
│   │   ├── routes.js            # Cat CRUD + photo upload + ETag
│   │   ├── ownerRoutes.js       # Advanced CRUD — Owners resource
│   │   ├── authRoutes.js        # Login flow (register/login/logout/me)
│   │   ├── middleware.js        # Logging + Authentication + Cookie parsing
│   │   └── responseHelpers.js  # Shared response builders + ETag helpers
│   └── client/
│       ├── httpClient.js        # Raw TCP client library + CookieJar
│       └── index.js             # Interactive CLI
├── public/
│   ├── index.html               # Static landing page
│   └── client.html              # 🎨 Browser GUI client
├── tests/
│   └── api.test.js              # Automated tests (node:test)
├── scripts/
│   └── generateCerts.js         # TLS certificate generator
├── certs/                       # Self-signed TLS certificates (gitignored)
├── logs/
│   └── access.log               # Server access log
└── package.json
```

### Request flow (raw server)

```
TCP socket
    │
    ▼
httpParser.parseRequest()        ← RFC 9112 CRLF framing, chunked decoding
    │
    ▼
middleware.authenticate()        ← API Key / Bearer Token / Session Cookie
    │
    ▼
Route chain:
  authRouter()   → /auth/*
  catRouter()    → /api/cats/*
  ownerRouter()  → /api/owners/*
  staticFile()   → /public/*
    │
    ▼
httpParser.serializeResponse()   ← ETag, Content-Length, chunked encoding
    │
    ▼
TCP socket (keep-alive or close)
```

---

## Quick Start

> **Requirements**: Node.js ≥ 18

```bash
# Install dependencies (only express for the optional refactor)
npm install

# Terminal 1 — Start the raw HTTP server (port 3000)
npm start

# Terminal 2 — Interactive CLI client
npm run client

# Optional: Express-based refactor (port 3001)
npm run start:express

# Optional: Generate TLS certs and start HTTPS server (port 3443)
npm run gen-certs
npm run start:tls

# Run automated tests (server must be running)
npm test
```

**Open in browser**: http://127.0.0.1:3000/client.html (GUI client)

---

## API Reference

### Base URL
```
http://127.0.0.1:3000
```

### Authentication
All `/api/*` endpoints require **one** of:

| Method | Example |
|--------|---------|
| `X-API-Key` header | `X-API-Key: supersecret-key-123` |
| `Authorization: Bearer` | `Authorization: Bearer supersecret-key-123` |
| Session cookie | Set automatically after `POST /auth/login` |
| `X-Session-Token` header | Returned in login response body |

---

### 🐱 Cats Resource

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| `GET` | `/api/cats` | 200 | List all cats |
| `HEAD` | `/api/cats` | 200 | Headers only (ETag, Content-Length) |
| `GET` | `/api/cats/:id` | 200 / 404 | Get one cat |
| `POST` | `/api/cats` | 201 | Create a cat |
| `PUT` | `/api/cats/:id` | 200 / 404 | Replace a cat |
| `DELETE` | `/api/cats/:id` | **204** / 404 | Delete (no body) |
| `POST` | `/api/cats/:id/photo` | 200 | Upload photo (base64 JSON or raw binary) |
| `GET` | `/api/cats/:id/photo` | 200 / 404 | Download photo binary |

**Cat schema**:
```json
{ "id": 1, "name": "Whiskers", "breed": "Domestic Shorthair",
  "age": 3, "color": "Orange", "ownerId": null,
  "createdAt": "2025-04-16T12:00:00Z", "updatedAt": "2025-04-16T12:00:00Z" }
```

**Conditional GET (ETag)**:
```bash
# Get ETag from first request
curl -I -H "X-API-Key: supersecret-key-123" http://127.0.0.1:3000/api/cats
# → ETag: "abc123..."

# Subsequent request — server returns 304 if unchanged
curl -H "X-API-Key: supersecret-key-123" \
     -H 'If-None-Match: "abc123..."' \
     http://127.0.0.1:3000/api/cats
# → HTTP/1.1 304 Not Modified (no body transmitted)
```

---

### 👥 Owners Resource

| Method | Path | Status | Description |
|--------|------|--------|-------------|
| `GET` | `/api/owners` | 200 | List owners (with embedded cats) |
| `GET` | `/api/owners/:id` | 200 / 404 | Get owner |
| `POST` | `/api/owners` | 201 | Create owner |
| `PUT` | `/api/owners/:id` | 200 / 404 | Update owner |
| `DELETE` | `/api/owners/:id` | 204 / 404 | Delete (unlinks cats) |
| `POST` | `/api/owners/:oid/cats/:cid` | 200 | Assign cat to owner |
| `DELETE` | `/api/owners/:oid/cats/:cid` | 204 | Unassign cat |

---

### 🔐 Authentication

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/auth/register` | Register `{ username, password }` → `{ token }` |
| `POST` | `/auth/login` | Login → `{ token, expiresAt }` + `Set-Cookie` |
| `POST` | `/auth/logout` | Invalidate token + clear cookie |
| `GET` | `/auth/me` | Current user info (requires token) |

```bash
# Register
curl -X POST http://127.0.0.1:3000/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}'

# Login
curl -X POST http://127.0.0.1:3000/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"alice","password":"secret123"}'

# Use session token
curl -H "X-Session-Token: <token>" http://127.0.0.1:3000/auth/me
```

---

## Mandatory Features

### ✅ HTTP Client
- **Any URL**: `request({ url: 'http://example.com/' })` for external servers
- **All verbs**: GET, HEAD, POST, PUT, DELETE
- **Auto-headers**: Host, Content-Type, Content-Length, Connection set automatically
- **Custom headers**: passed via `headers: {}` option
- **Request body**: supported for POST/PUT
- **Response display**: coloured status, full headers, pretty-printed JSON
- **Successive requests**: main loop without restart; cookie jar persists across calls

### ✅ HTTP Server
- Static content at `/` and `/client.html`
- Full CRUD REST API on `/api/cats` and `/api/owners`
- `DELETE` returns **204 No Content** (empty body)
- `PUT`/`POST` return **405 Method Not Allowed** with `Allow:` header on wrong verbs
- **JSON** for all API request/response bodies
- `400 Bad Request` on malformed JSON
- **Concurrent requests**: handled via Node's non-blocking event loop
- **Port configurable**: `createServer({ port: 3000 })`

---

## Optional Features

### 🔑 API Key Authentication (+0.6 pts)
Implemented in `middleware.js`. The server accepts:
1. `X-API-Key: supersecret-key-123` header
2. `Authorization: Bearer supersecret-key-123` header

Keys are compared using string set lookup. Only `/api/*` paths require authentication; `/auth/*` and static files are always public.

---

### 🔐 Login Flow (+2.0 pts)
Implemented in `authRoutes.js`.

- **Password hashing**: PBKDF2-SHA256 with a per-user random salt (16 bytes), 100 000 iterations — never stored in plaintext
- **Timing-safe comparison**: `crypto.timingSafeEqual` prevents timing-based attacks
- **Session tokens**: 32-byte cryptographically random hex strings (`crypto.randomBytes`)
- **Token expiry**: 1 hour from issue
- **Cookie delivery**: `Set-Cookie: sessionToken=...; HttpOnly; Path=/; Max-Age=3600; SameSite=Strict`
- **Client-side CookieJar**: `httpClient.js` automatically stores and resends cookies

```
POST /auth/register  → 201 { user }
POST /auth/login     → 200 { token, expiresAt } + Set-Cookie
POST /auth/logout    → 204 + Set-Cookie (clear)
GET  /auth/me        → 200 { user }
```

---

### 📸 Multimedia Files (+1.2 pts)
Implemented in `routes.js`.

- `POST /api/cats/:id/photo`: accepts JSON body `{ photo: "data:image/jpeg;base64,..." }` or raw binary body with `Content-Type: image/*`
- `GET /api/cats/:id/photo`: returns the image as raw binary with correct MIME type
- Photos stored in memory as base64 strings
- GUI client has a file picker that converts images to data URLs before sending

---

### 🔒 TLS — Basic (+1.2 pts)
Implemented in `httpServerTLS.js` using Node's built-in `tls` module.

The **same request handling logic** is reused from the raw server — only the transport layer changes:

```javascript
// Raw server:     net.createServer(...)
// TLS server:     tls.createServer({ cert, key }, ...)
```

Certificate generation via `npm run gen-certs` (shells out to `openssl`). The server listens on port 3443 and the connection is end-to-end encrypted.

To verify encryption with Wireshark: capture on `lo` (loopback) and filter `tcp.port == 3443`. The payload will be TLS Application Data records (not readable as plaintext).

---

### 📓 Logging (+0.6 pts)
Implemented in `middleware.js`.

- **File**: `logs/access.log` in Apache Combined Log Format
- **Stdout**: colour-coded with ANSI escape codes (green=2xx, yellow=3xx, red=4xx, magenta=5xx)
- **Fields**: timestamp, client IP:port, method, path, HTTP version, status code, content length, referer, user-agent

```
[2025-04-16T14:27:21.813Z] 127.0.0.1:63656 "GET / HTTP/1.1" 200 - "-" "Mozilla/5.0..."
```

---

### 🧪 Automated Testing (+1.2 pts)
Implemented in `tests/api.test.js` using Node's built-in `node:test` and `node:assert`.

Test suites:
- HTTP Parser sanity checks
- Authentication (register, login, wrong password, duplicate user)
- Cat CRUD (GET list, GET by ID, POST, PUT, DELETE — including 204, 404, 400, 405)
- Conditional GET / ETag (304 Not Modified verification)
- HEAD requests
- Owner CRUD
- Static file serving

```bash
npm test   # runs all tests (server must be started first)
```

---

### ⚙️ HTTP Framework Refactor (+1.2 pts)
Implemented in `httpServerExpress.js`.

A second server implementation using Express that exposes the **identical API** (same endpoints, same status codes, same JSON schema). Demonstrates that our CLI client can interoperate with it:

```bash
npm run start:express    # starts on port 3001
# then in another terminal:
node src/client/index.js  # change SERVER port to 3001 and test Option e
```

---

### 💾 Conditional GET with ETag (+1.2 pts)
Implemented in `responseHelpers.js` and used in `routes.js` and `ownerRoutes.js`.

- **ETag**: MD5 hash of the JSON-serialised response body, sent as `ETag: "hex"`
- **If-None-Match**: if the client sends this header and it matches the current ETag, the server returns `304 Not Modified` with no body — saving bandwidth
- **Last-Modified**: included on all API responses

```bash
# Demonstrate caching
curl -v -H "X-API-Key: supersecret-key-123" http://127.0.0.1:3000/api/cats
# note the ETag value, then:
curl -v -H "X-API-Key: supersecret-key-123" \
        -H 'If-None-Match: "<etag-value>"' \
        http://127.0.0.1:3000/api/cats
# → HTTP/1.1 304 Not Modified
```

---

### 🎨 GUI Client (+1.2 pts)
Implemented in `public/client.html` — a single-page application served by the raw TCP server.

Features:
- Dark-themed responsive sidebar layout
- Cat management: list grid, create, update, delete, photo upload
- Owner management: list with embedded cats, create, cat ↔ owner assignment
- Authentication section: register, login, logout, profile
- **HTTP Inspector panel**: shows raw request, response body, and headers in real time
- All requests use `fetch()` (browser HTTP stack), demonstrating same-origin API consumption

Access at: `http://127.0.0.1:3000/client.html`

---

### 🍪 Cookies (+0.6 pts)
Implemented across `middleware.js` and `httpClient.js`.

**Server side**:
- `logRequest` handler parses `Cookie:` header
- Login endpoint sets `Set-Cookie: sessionToken=...; HttpOnly; Path=/; Max-Age=3600; SameSite=Strict`
- Middleware reads `sessionToken` cookie for authentication

**Client side** (`CookieJar` class in `httpClient.js`):
- Stores cookies per-host with path scoping and expiry (Max-Age / Expires)
- Automatically injects `Cookie:` header on subsequent requests
- Lazily purges expired cookies on access
- `clear()` method called on logout

---

### 🎰 Advanced CRUD (+0.6 pts)
Implemented in `ownerRoutes.js`.

A second resource — `Owner` — with a *bidirectional relationship* to cats:
- Each cat has an `ownerId` field (foreign key)
- `GET /api/owners/:id` embeds the full cat objects in the response
- `POST /api/owners/:oid/cats/:cid` assigns a cat to an owner (sets `cat.ownerId`)
- `DELETE /api/owners/:oid/cats/:cid` removes the assignment
- `DELETE /api/owners/:id` unlinks all cats before removing the owner

---

### 🔄 HTTP/1.1 Compliance (+1.2 pts)
Implemented in `httpServer.js` and `httpParser.js`.

**Persistent connections (keep-alive)**:
- Server checks `Connection:` header on each request
- If not `close`, the socket stays open and is reused for subsequent requests
- 30-second idle timeout closes dormant connections
- `Connection: keep-alive` header injected into responses

Demonstration with `curl --http1.1 -v`:
```
* Re-using existing connection with host 127.0.0.1
```

**Chunked Transfer-Encoding**:
- `httpParser.js` has `encodeChunked(body)` and `decodeChunked(body)` functions
- Encoded as: `<hex-size>\r\n<data>\r\n` chunks, terminated with `0\r\n\r\n`
- Server can use `chunked: true` flag in `serializeResponse` for large payloads

**Content-Length**: present on all responses with a body.

---

### 🔗 Middleware / Interceptors (+0.6 pts)
Implemented in `middleware.js`.

Two distinct middleware functions form a chain before route handlers:
1. **`logRequest`**: writes Combined Log Format entries with timestamp, client, method, path, status, user-agent
2. **`authenticate`**: validates API key, Bearer token, session token, or cookie — returns `401` if missing

The server applies them in order for every request, independent of the route handler:
```javascript
authenticate(parsedReq)     // may short-circuit with 401
→ authRouter / catRouter / ownerRouter  // actual business logic
→ logRequest(...)           // always runs
```

---

## RFC 9112 Compliance

| Requirement | Source (RFC 9112) | Implementation |
|---|---|---|
| CRLF (`\r\n`) line endings | §2.2 | `httpParser.js` uses `CRLF` constant throughout |
| `\r\n\r\n` header/body separator | §2.2 | Split at first occurrence |
| Request-line: `METHOD SP target SP HTTP-version` | §3.1 | Parsed via `indexOf(' ')` + `lastIndexOf(' ')` |
| Status-line: `HTTP-version SP code SP reason` | §4 | Parsed and serialised correctly |
| `Content-Length` on all bodies | §6.2 | `Buffer.byteLength(body)` used |
| `Transfer-Encoding: chunked` | §7.1 | Full encode/decode implemented |
| Partial body wait (Content-Length framing) | §6.2 | Server buffers until `bodyRaw.length >= expectedLen` |
| `400 Bad Request` on parse failure | §9.1.2 | `try/catch` around `parseRequest` |
| `405 Method Not Allowed` + `Allow` header | §9.3 | Every route handler includes this |
| `204 No Content` with empty body | RFC 9110 §9.3.5 | `DELETE` responses |
| `304 Not Modified` with no body | RFC 7232 §4.1 | ETag conditional GET |
| Path traversal prevention | RFC 3986 §3.3 | `filePath.startsWith(PUBLIC_DIR)` guard |
| Interoperability (curl / browser) | §1 | Verified against Edge, curl, and Postman |

---

## Design Decisions & Challenges

### 1. Pure socket implementation without the `http` module
**Challenge**: Node's `http` module hides all protocol details. We had to manually buffer incoming bytes, detect the end of the header section (`\r\n\r\n`), and wait for the full body based on `Content-Length`. Multi-chunk requests (POST with large bodies) required careful state management.

**Solution**: A string accumulation buffer per socket, reset after each complete request. The server checks `bodyRaw.length >= expectedBodyLen` before processing.

### 2. Persistent connections (keep-alive)
**Challenge**: The original implementation called `socket.end()` after every response, making HTTP/1.0-style one-shot connections. Supporting keep-alive required the socket handler to remain alive and process multiple sequential request-response cycles.

**Solution**: Inspect the `Connection` header; only call `socket.end()` when the client requests `Connection: close` or the idle timer fires. Buffer is cleared (not the socket) after each request.

### 3. Binary data in text-based sockets
**Challenge**: Node's default socket encoding is UTF-8, which corrupts binary image data.

**Solution**: Use `socket.on('data', chunk => ...)` with `Buffer.concat` for accumulation (binary-safe), and `socket.write(response, 'binary')` for sending. Photos are stored as base64 strings internally.

### 4. Session token injection in middleware
**Challenge**: `middleware.js` needs to validate session tokens created in `authRoutes.js`, but importing that module would create a circular dependency.

**Solution**: Dependency injection via `setTokenValidator(fn)`. The server calls this once at startup, passing `authRoutes.validateToken`. Middleware calls this function pointer without knowing authenticatetion's internals.

### 5. ETag header injection into pre-serialised responses
**Challenge**: After a response is serialised to a string, injecting a `Connection: keep-alive` header requires modifying the raw string.

**Solution**: `injectHeaders(rawResponse, headers)` finds the `\r\n\r\n` separator in the serialised string and inserts new header lines immediately before it. While inelegant, it avoids a full response object pipeline redesign.

### 6. Chunked Transfer-Encoding parsing
**Challenge**: Chunked encoding uses a stream of size-prefixed chunks that can arrive across multiple TCP packets.

**Solution**: Since we buffer the full request before processing it (for Content-Length framing), chunked bodies are always available in full. The decoder reads the hex size line and slices the string accordingly. For edge cases (chunk extensions, trailers) the implementation strips them conservatively.

---

## AI Tool Usage

> *As required by the project specification, we document our use of generative AI tools.*

**Tools used**: Google Antigravity (Gemini-based coding assistant), used within the IDE.

**How they were used**:
- **Boilerplate generation**: The initial file structure and socket server scaffolding were generated with AI assistance, then reviewed and modified by the team
- **RFC lookup**: AI was used to quickly look up specific RFC 9112 section numbers and wire format requirements
- **Debugging**: When chunked transfer parsing produced incorrect output, we described the symptom to the AI and it identified the off-by-two error in `crlfIdx + 2` skipping
- **Test case brainstorming**: AI suggested edge-case test scenarios (timing-safe comparison, path traversal) that the team then implemented
- **Report writing**: The structure of this README was co-authored with AI, with the team writing the technical analysis sections

**Limitations and what we did ourselves**:
- All design decisions (route architecture, dependency injection pattern for tokens, CookieJar class design) were discussed and decided by the team
- Every team member understands the entire codebase and can explain any line of code
- The chunked transfer encoding and keep-alive implementations were manually debugged against `curl -v` output

---

## Work Distribution

**Team members:**
- Alejandro Serrano
- Alba Prats
- Tomas Juan

**Methodology**: Agile-inspired with weekly sync meetings. Feature branches in Git, reviewed before merge to `main`. Logging added as the first feature to make debugging all subsequent features easier.

---

## Future Improvements

1. **HTTP/2**: Replace TCP text framing with binary frame multiplexing (HPACK header compression, streams)
2. **Persistent storage**: Replace in-memory arrays with SQLite (via `better-sqlite3`) for data durability across restarts
3. **Rate limiting**: Track request counts per IP; return `429 Too Many Requests` after threshold
4. **WebSockets**: Upgrade mechanism (`101 Switching Protocols`) for real-time cat shelter notifications
5. **Content negotiation**: `Accept:` header handling to return XML or MessagePack in addition to JSON
6. **Port configuration via CLI arg**: `node src/server/httpServer.js --port 8080`
7. **Chunked streaming**: For endpoints returning large datasets, send chunks as they are computed rather than buffering the full response

---

## Disclaimer

This project was developed by a team of students for educational purposes. It is not intended for production use and has not been security tested.
AI was used to generate this Readme Structure.  

---

*USJ Networks & Communications 2 · Group Project · RFC 9112 HTTP/1.1 Implementation*
