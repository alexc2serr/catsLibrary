/**
 * httpServerExpress.js
 * ⚙️ Express-based implementation with SQLite persistence.
 */

'use strict';

const express = require('express');
const crypto = require('crypto');
const path = require('path');
const db = require('./db');
const { getNextId } = require('./db');

// Shared middleware/auth logic
const { isValidApiKey } = require('./middleware');
const { validateToken } = require('./authRoutes');

const app = express();
app.use(express.json());

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
  if (isValidApiKey(apiKey)) return next();

  const authH = req.headers['authorization'] || '';
  if (authH.startsWith('Bearer ')) {
    const tok = authH.slice(7).trim();
    if (isValidApiKey(tok) || validateToken(tok)) return next();
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

app.use(express.static(path.join(__dirname, '../../public')));

// ─── Auth routes ──────────────────────────────────────────────────────────────

app.post('/auth/register', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(422).json({ error: 'username and password required' });
  if (password.length < 6)    return res.status(422).json({ error: 'Password ≥ 6 characters' });
  
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (existing) return res.status(409).json({ error: `${username} already taken` });

  const newId = getNextId('users');
  db.prepare('INSERT INTO users (id, username, passwordHash) VALUES (?, ?, ?)').run(newId, username, hashPwd(password));
  res.status(201).json({ success: true, user: { id: newId, username } });
});

app.post('/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username);
  if (!user || !verifyPwd(password, user.passwordHash))
    return res.status(401).json({ error: 'Invalid credentials' });

  const token = crypto.randomBytes(32).toString('hex');
  const expiresAtMs = Date.now() + 3_600_000;
  db.prepare('INSERT INTO sessions (token, userId, expiresAt) VALUES (?, ?, ?)').run(token, user.id, expiresAtMs);

  res.cookie('sessionToken', token, { httpOnly: true, maxAge: 3600, sameSite: 'Strict' });
  res.json({ success: true, token, expiresAt: new Date(expiresAtMs).toISOString(), user: { id: user.id, username } });
});

app.post('/auth/logout', (req, res) => {
  const token = req.headers['x-session-token'] || (req.headers['cookie'] || '').match(/sessionToken=([^;]+)/)?.[1];
  if (token) db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
  res.clearCookie('sessionToken');
  res.sendStatus(204);
});

// ─── Cat routes ───────────────────────────────────────────────────────────────

app.get('/api/cats', requireAuth, (req, res) => {
  const cats = db.prepare('SELECT id, name, breed, age, color, ownerId, createdAt, updatedAt FROM cats').all();
  res.json({ success: true, count: cats.length, data: cats });
});

app.get('/api/cats/:id', requireAuth, (req, res) => {
  const cat = db.prepare('SELECT id, name, breed, age, color, ownerId, createdAt, updatedAt FROM cats WHERE id = ?').get(req.params.id);
  cat ? res.json({ success: true, data: cat }) : res.status(404).json({ error: 'Not found' });
});

app.post('/api/cats', requireAuth, (req, res) => {
  const { name, breed, age, color } = req.body || {};
  if (!name || !breed) return res.status(422).json({ error: 'name and breed required' });
  
  const newId = getNextId('cats');
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO cats (id, name, breed, age, color, ownerId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(newId, name, breed, age ?? null, color ?? null, null, now, now);

  const cat = db.prepare('SELECT id, name, breed, age, color, ownerId, createdAt, updatedAt FROM cats WHERE id = ?').get(newId);
  res.status(201).json({ success: true, data: cat });
});

app.put('/api/cats/:id', requireAuth, (req, res) => {
  const exists = db.prepare('SELECT id FROM cats WHERE id = ?').get(req.params.id);
  if (!exists) return res.status(404).json({ error: 'Not found' });

  const { name, breed, age, color } = req.body || {};
  if (!name || !breed) return res.status(422).json({ error: 'name and breed required' });

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE cats SET name = ?, breed = ?, age = ?, color = ?, updatedAt = ? WHERE id = ?
  `).run(name, breed, age ?? null, color ?? null, now, req.params.id);

  const cat = db.prepare('SELECT id, name, breed, age, color, ownerId, createdAt, updatedAt FROM cats WHERE id = ?').get(req.params.id);
  res.json({ success: true, data: cat });
});

app.delete('/api/cats/:id', requireAuth, (req, res) => {
  const result = db.prepare('DELETE FROM cats WHERE id = ?').run(req.params.id);
  if (result.changes === 0) return res.status(404).json({ error: 'Not found' });
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
