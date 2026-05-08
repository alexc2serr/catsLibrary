/**
 * ownerRoutes.js
 * 🎰 Advanced CRUD — Owners resource with relationships to Cats (SQLite version)
 */

'use strict';

const db = require('./db');
const { makeResponse, makeEmptyResponse, computeETag, isCacheHit, makeNotModified } = require('./responseHelpers');

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Finds the first available ID (filling gaps from deletions) */
function getNextOwnerId() {
  const ids = db.prepare('SELECT id FROM owners ORDER BY id ASC').all().map(r => r.id);
  let nextId = 1;
  for (const id of ids) {
    if (id === nextId) nextId++;
    else break;
  }
  return nextId;
}

function getOwnerCats(ownerId) {
  return db.prepare('SELECT id, name, breed, age, color, ownerId, createdAt, updatedAt FROM cats WHERE ownerId = ?').all(ownerId);
}

function ownerWithCats(owner) {
  if (!owner) return null;
  return { ...owner, cats: getOwnerCats(owner.id) };
}

function extractOwnerId(path) {
  const m = path.match(/\/api\/owners\/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

function extractCatId(path) {
  const m = path.match(/\/cats\/(\d+)/);
  return m ? parseInt(m[1], 10) : null;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

function getAllOwners(reqHeaders) {
  const owners = db.prepare('SELECT * FROM owners').all();
  const data = owners.map(ownerWithCats);
  const payload = { success: true, count: data.length, data };
  const etag = computeETag(payload);
  
  if (isCacheHit(reqHeaders, etag)) return makeNotModified(etag);
  return makeResponse(200, 'OK', payload);
}

function getOwnerById(id, reqHeaders) {
  const owner = db.prepare('SELECT * FROM owners WHERE id = ?').get(id);
  if (!owner) return makeResponse(404, 'Not Found', { error: `Owner ${id} not found` });
  
  const data = ownerWithCats(owner);
  const etag = computeETag(data);
  
  if (isCacheHit(reqHeaders, etag)) return makeNotModified(etag);
  return makeResponse(200, 'OK', { success: true, data });
}

function createOwner(body) {
  let data;
  try { data = JSON.parse(body); }
  catch { return makeResponse(400, 'Bad Request', { error: 'Invalid JSON body' }); }

  const { name, email, phone } = data;
  if (!name || !email) {
    return makeResponse(422, 'Unprocessable Entity', { error: '"name" and "email" are required' });
  }

  const newId = getNextOwnerId();
  try {
    db.prepare('INSERT INTO owners (id, name, email, phone) VALUES (?, ?, ?, ?)').run(newId, name, email, phone ?? null);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed: owners.email')) {
      return makeResponse(409, 'Conflict', { error: `Email "${email}" is already taken` });
    }
    throw err;
  }

  const owner = db.prepare('SELECT * FROM owners WHERE id = ?').get(newId);
  return makeResponse(201, 'Created', { success: true, data: ownerWithCats(owner) });
}

function updateOwner(id, body) {
  const exists = db.prepare('SELECT id FROM owners WHERE id = ?').get(id);
  if (!exists) return makeResponse(404, 'Not Found', { error: `Owner ${id} not found` });

  let data;
  try { data = JSON.parse(body); }
  catch { return makeResponse(400, 'Bad Request', { error: 'Invalid JSON body' }); }

  const { name, email, phone } = data;
  if (!name || !email) {
    return makeResponse(422, 'Unprocessable Entity', { error: '"name" and "email" are required' });
  }

  try {
    db.prepare('UPDATE owners SET name = ?, email = ?, phone = ? WHERE id = ?').run(name, email, phone ?? null, id);
  } catch (err) {
    if (err.message.includes('UNIQUE constraint failed: owners.email')) {
      return makeResponse(409, 'Conflict', { error: `Email "${email}" is already taken` });
    }
    throw err;
  }

  const owner = db.prepare('SELECT * FROM owners WHERE id = ?').get(id);
  return makeResponse(200, 'OK', { success: true, data: ownerWithCats(owner) });
}

function deleteOwner(id) {
  // SQLite handles unlinking cats if we set up FOREIGN KEY ... ON DELETE SET NULL
  // which we did in db.js.
  const result = db.prepare('DELETE FROM owners WHERE id = ?').run(id);
  if (result.changes === 0) return makeResponse(404, 'Not Found', { error: `Owner ${id} not found` });

  return makeEmptyResponse(204, 'No Content');
}

function assignCatToOwner(ownerId, catId) {
  const owner = db.prepare('SELECT id FROM owners WHERE id = ?').get(ownerId);
  if (!owner) return makeResponse(404, 'Not Found', { error: `Owner ${ownerId} not found` });

  const cat = db.prepare('SELECT id FROM cats WHERE id = ?').get(catId);
  if (!cat) return makeResponse(404, 'Not Found', { error: `Cat ${catId} not found` });

  const now = new Date().toISOString();
  db.prepare('UPDATE cats SET ownerId = ?, updatedAt = ? WHERE id = ?').run(ownerId, now, catId);

  const updatedCat = db.prepare('SELECT id, name, breed, age, color, ownerId, createdAt, updatedAt FROM cats WHERE id = ?').get(catId);
  return makeResponse(200, 'OK', { success: true, message: `Cat ${catId} assigned to owner ${ownerId}`, data: updatedCat });
}

function unassignCatFromOwner(ownerId, catId) {
  const cat = db.prepare('SELECT id FROM cats WHERE id = ? AND ownerId = ?').get(catId, ownerId);
  if (!cat) return makeResponse(404, 'Not Found', { error: `Cat ${catId} is not owned by owner ${ownerId}` });
  
  const now = new Date().toISOString();
  db.prepare('UPDATE cats SET ownerId = NULL, updatedAt = ? WHERE id = ?').run(now, catId);
  return makeEmptyResponse(204, 'No Content');
}

// ─── Router ───────────────────────────────────────────────────────────────────

function ownerRouter(parsedReq) {
  const { method, path: reqPath, body, headers } = parsedReq;
  const cleanPath = reqPath.split('?')[0];

  if (cleanPath === '/api/owners') {
    if (method === 'GET')  return getAllOwners(headers);
    if (method === 'HEAD') {
      const full = getAllOwners(headers);
      return full.replace(/\r\n\r\n[\s\S]*$/, '\r\n\r\n');
    }
    if (method === 'POST') return createOwner(body);
    return makeEmptyResponse(405, 'Method Not Allowed', { Allow: 'GET, HEAD, POST' });
  }

  if (/^\/api\/owners\/\d+\/cats\/\d+$/.test(cleanPath)) {
    const ownerId = extractOwnerId(cleanPath);
    const catId   = extractCatId(cleanPath);
    if (method === 'POST')   return assignCatToOwner(ownerId, catId);
    if (method === 'DELETE') return unassignCatFromOwner(ownerId, catId);
    return makeEmptyResponse(405, 'Method Not Allowed', { Allow: 'POST, DELETE' });
  }

  if (/^\/api\/owners\/\d+$/.test(cleanPath)) {
    const id = extractOwnerId(cleanPath);
    if (method === 'GET')    return getOwnerById(id, headers);
    if (method === 'HEAD') {
      const full = getOwnerById(id, headers);
      return full.replace(/\r\n\r\n[\s\S]*$/, '\r\n\r\n');
    }
    if (method === 'PUT')    return updateOwner(id, body);
    if (method === 'DELETE') return deleteOwner(id);
    return makeEmptyResponse(405, 'Method Not Allowed', { Allow: 'GET, HEAD, PUT, DELETE' });
  }

  return null;
}

module.exports = { ownerRouter };
