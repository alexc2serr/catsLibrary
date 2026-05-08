/**
 * db.js
 * 🗄️ SQLite Database management for USJ Cat Shelter
 */

'use strict';

const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = path.join(__dirname, '../../usj-cat-shelter.db');
const db = new Database(DB_PATH);

// Enable foreign keys
db.pragma('foreign_keys = ON');

/** Initialize schema */
function initDb() {
  // 1. Owners Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS owners (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      phone TEXT
    )
  `).run();

  // 2. Cats Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS cats (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      breed TEXT NOT NULL,
      age INTEGER,
      color TEXT,
      ownerId INTEGER,
      photo TEXT,
      photoMime TEXT,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL,
      FOREIGN KEY (ownerId) REFERENCES owners(id) ON DELETE SET NULL
    )
  `).run();

  // 3. Users Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      passwordHash TEXT NOT NULL
    )
  `).run();

  // 4. Sessions Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      userId INTEGER NOT NULL,
      expiresAt INTEGER NOT NULL,
      FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
    )
  `).run();

  // 5. API Keys Table
  db.prepare(`
    CREATE TABLE IF NOT EXISTS api_keys (
      key TEXT PRIMARY KEY,
      description TEXT
    )
  `).run();

  seedIfEmpty();
}

/** Seed with initial data if tables are empty */
function seedIfEmpty() {
  const ownerCount = db.prepare('SELECT COUNT(*) as count FROM owners').get().count;
  if (ownerCount === 0) {
    console.log('[DB] Seeding owners...');
    const insertOwner = db.prepare('INSERT INTO owners (id, name, email, phone) VALUES (?, ?, ?, ?)');
    insertOwner.run(1, 'Alice Martínez', 'alice@example.com', '+34 600 111 222');
    insertOwner.run(2, 'Bob García', 'bob@example.com', '+34 600 333 444');
  }

  const catCount = db.prepare('SELECT COUNT(*) as count FROM cats').get().count;
  if (catCount === 0) {
    console.log('[DB] Seeding cats...');
    const now = new Date().toISOString();
    const insertCat = db.prepare(`
      INSERT INTO cats (id, name, breed, age, color, ownerId, photo, photoMime, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const initialCats = [
      { id: 1, name: "Whiskers", breed: "Domestic Shorthair", age: 3, color: "Orange", ownerId: 1 },
      { id: 2, name: "Luna", breed: "Siamese", age: 5, color: "Cream", ownerId: 1 },
      { id: 3, name: "Mochi", breed: "Scottish Fold", age: 2, color: "Grey", ownerId: 2 },
    ];

    for (const cat of initialCats) {
      const defaults = loadDefaultCatImage(cat.id);
      insertCat.run(
        cat.id,
        cat.name,
        cat.breed,
        cat.age,
        cat.color,
        cat.ownerId,
        defaults.photo,
        defaults.photoMime,
        now,
        now
      );
    }
  }

  const apiKeyCount = db.prepare('SELECT COUNT(*) as count FROM api_keys').get().count;
  if (apiKeyCount === 0) {
    console.log('[DB] Seeding API keys...');
    const insertKey = db.prepare('INSERT INTO api_keys (key, description) VALUES (?, ?)');
    insertKey.run('supersecret-key-123', 'Default Admin Key');
    insertKey.run('dev-key-abc', 'Development Key');
  }
}

/** Helper to load default images from public/assets during seeding */
function loadDefaultCatImage(id) {
  const extMap = {
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.webp': 'image/webp'
  };
  for (const [ext, mime] of Object.entries(extMap)) {
    const filePath = path.join(__dirname, '..', '..', 'public', 'assets', `cat${id}${ext}`);
    if (fs.existsSync(filePath)) {
      try {
        return {
          photo: fs.readFileSync(filePath).toString('base64'),
          photoMime: mime
        };
      } catch(e) { /* ignore */ }
    }
  }
  return { photo: null, photoMime: null };
}

/** Finds the first available ID for a table (filling gaps) */
function getNextId(table) {
  const ids = db.prepare(`SELECT id FROM ${table} ORDER BY id ASC`).all().map(r => r.id);
  let nextId = 1;
  for (const id of ids) {
    if (id === nextId) nextId++;
    else break;
  }
  return nextId;
}

// Run initialization
initDb();

module.exports = db;
module.exports.getNextId = getNextId;
