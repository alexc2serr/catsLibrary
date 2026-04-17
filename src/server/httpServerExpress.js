/**
 * httpServerExpress.js
 * ⚙️ Refactor with HTTP Framework — Express-based implementation
 *
 * A second server implementation using Express (a high-level HTTP framework)
 * that exposes the SAME API as the raw-socket server, demonstrating that
 * our CLI client can interoperate with it seamlessly.
 *
 * Run: npm run express
 *
 * This file intentionally imports the same in-memory data as the raw server
 * to prove they share the same REST contract.
 */

'use strict';

const express = require('express');

// Shared middleware/auth logic re-used from raw implementation
const { VALID_API_KEYS } = require('./middleware');
const { validateToken }  = require('./authRoutes');

// ─── Express App ──────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

// ─── In-memory stores ─────────────────────────────────────────────────────────

const crypto = require('crypto');

let catStore = [
  { id: 1, name: 'Whiskers', breed: 'Domestic Shorthair', age: 3,  color: 'Orange', ownerId: null },
  { id: 2, name: 'Luna',     breed: 'Siamese',            age: 5,  color: 'Cream',  ownerId: null },
  { id: 3, name: 'Mochi',   breed: 'Scottish Fold',      age: 2,  color: 'Grey',   ownerId: null },
];
let nextCatId = 4;

let userStore = [];
let nextUserId = 1;
const sessionMap = new Map();

// ─── Auth helpers ─────────────────────────────────────────────────────────────

function hashPwd(pwd, salt = crypto.randomBytes(16).toString('hex')) {
  const h = crypto.pbkdf2Sync(pwd, salt, 100_000, 32, 'sha256').toString('hex');
  return `${salt}:${h}`;
}
function verifyPwd(pwd, stored) {
  const [salt] = stored.split(':');
  try { return crypto.timingSafeEqual(Buffer.from(hashPwd(pwd, salt)), Buffer.from(stored)); }
  catch { return false; }
}

// ─── Auth middleware ──────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const apiKey = req.headers['x-api-key'];
  if (apiKey && VALID_API_KEYS.has(apiKey)) return next();

  const authH = req.headers['authorization'] || '';
  if (authH.startsWith('Bearer ')) {
    const tok = authH.slice(7).trim();
    if (VALID_API_KEYS.has(tok) || (validateToken(tok))) return next();
  }

  const cookies = Object.fromEntries(
    (req.headers['cookie'] || '').split(';').filter(Boolean).map((s) => {
      const i = s.indexOf('=');
      return [s.slice(0, i).trim(), s.slice(i + 1).trim()];
    }),
  );
  if (cookies.sessionToken && validateToken(cookies.sessionToken)) return next();

  res.status(401).json({ success: false, error: 'Unauthorized' });
}

// ─── CORS ─────────────────────────────────────────────────────────────────────

app.use((req, res, next) => {
  res.set({
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-API-Key, Authorization, X-Session-Token',
  });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// ─── Static files ─────────────────────────────────────────────────────────────

app.use(express.static(require('path').join(__dirname, '../../public')));

// ─── Auth routes ──────────────────────────────────────────────────────────────

app.post('/auth/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(422).json({ error: 'username and password required' });
  if (password.length < 6)    return res.status(422).json({ error: 'Password ≥ 6 characters' });
  if (userStore.find((u) => u.username === username))
    return res.status(409).json({ error: `${username} already taken` });
  const user = { id: nextUserId++, username, passwordHash: hashPwd(password) };
  userStore.push(user);
  res.status(201).json({ success: true, user: { id: user.id, username } });
});

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = userStore.find((u) => u.username === username);
  if (!user || !verifyPwd(password, user.passwordHash))
    return res.status(401).json({ error: 'Invalid credentials' });
  const token     = crypto.randomBytes(32).toString('hex');
  const expiresAt = new Date(Date.now() + 3_600_000).toISOString();
  sessionMap.set(token, { userId: user.id, expiresAt: Date.now() + 3_600_000 });
  res.cookie('sessionToken', token, { httpOnly: true, maxAge: 3600, sameSite: 'Strict' });
  res.json({ success: true, token, expiresAt, user: { id: user.id, username } });
});

app.post('/auth/logout', (req, res) => {
  const token = req.headers['x-session-token'];
  if (token) sessionMap.delete(token);
  res.clearCookie('sessionToken');
  res.sendStatus(204);
});

// ─── Cat routes ───────────────────────────────────────────────────────────────

app.get   ('/api/cats',     requireAuth, (req, res) => res.json({ success: true, count: catStore.length, data: catStore }));
app.get   ('/api/cats/:id', requireAuth, (req, res) => {
  const cat = catStore.find((c) => c.id === +req.params.id);
  cat ? res.json({ success: true, data: cat }) : res.status(404).json({ error: 'Not found' });
});
app.post  ('/api/cats',     requireAuth, (req, res) => {
  const { name, breed, age, color } = req.body || {};
  if (!name || !breed) return res.status(422).json({ error: 'name and breed required' });
  const cat = { id: nextCatId++, name, breed, age: age ?? null, color: color ?? null, ownerId: null };
  catStore.push(cat);
  res.status(201).json({ success: true, data: cat });
});
app.put   ('/api/cats/:id', requireAuth, (req, res) => {
  const idx = catStore.findIndex((c) => c.id === +req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  const { name, breed, age, color } = req.body || {};
  if (!name || !breed) return res.status(422).json({ error: 'name and breed required' });
  catStore[idx] = { ...catStore[idx], name, breed, age: age ?? null, color: color ?? null };
  res.json({ success: true, data: catStore[idx] });
});
app.delete('/api/cats/:id', requireAuth, (req, res) => {
  const idx = catStore.findIndex((c) => c.id === +req.params.id);
  if (idx === -1) return res.status(404).json({ error: 'Not found' });
  catStore.splice(idx, 1);
  res.sendStatus(204);
});

// ─── Start ────────────────────────────────────────────────────────────────────

const PORT = process.env.EXPRESS_PORT || 3001;

if (require.main === module) {
  app.listen(PORT, '127.0.0.1', () => {
    console.log(`\x1b[32m[EXPRESS SERVER]\x1b[0m Listening on http://127.0.0.1:${PORT}`);
    console.log(`Same API as raw server — use CLI client with port ${PORT}`);
  });
}

module.exports = { app };
