/**
 * ownerRoutes.js
 * 🎰 Advanced CRUD — Owners resource with relationships to Cats
 *
 * Endpoints:
 *   GET    /api/owners                       → 200 list of owners
 *   GET    /api/owners/:id                   → 200 owner (with their cats embedded)
 *   POST   /api/owners                       → 201 created owner
 *   PUT    /api/owners/:id                   → 200 updated owner
 *   DELETE /api/owners/:id                   → 204 (unlinks cats too)
 *   POST   /api/owners/:oid/cats/:cid        → 200 assigns a cat to an owner
 *   DELETE /api/owners/:oid/cats/:cid        → 204 removes assignment
 *
 * Note: ownerRoutes intentionally imports the catStore from routes.js
 * to establish a live reference (same array in memory).
 */

'use strict';

const { makeResponse, makeEmptyResponse, computeETag, isCacheHit, makeNotModified } = require('./responseHelpers');

// ─── In-memory store ──────────────────────────────────────────────────────────

/**
 * @type {{ id: number, name: string, email: string, phone?: string }[]}
 */
let ownerStore = [
  { id: 1, name: 'Alice Martínez', email: 'alice@example.com', phone: '+34 600 111 222' },
  { id: 2, name: 'Bob García',     email: 'bob@example.com',   phone: '+34 600 333 444' },
];
let nextOwnerId = 3;

/** Live reference to the cats array (injected by the server on startup) */
let catStore = null;

/** Call this once to inject the shared cat store */
function setCatStore(store) { catStore = store; }

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getOwnerCats(ownerId) {
  if (!catStore) return [];
  return catStore.filter((c) => c.ownerId === ownerId);
}

function ownerWithCats(owner) {
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
  const data = ownerStore.map(ownerWithCats);
  const etag = computeETag(data);
  if (isCacheHit(reqHeaders, etag)) return makeNotModified(etag);
  return makeResponse(200, 'OK', { success: true, count: data.length, data });
}

function getOwnerById(id, reqHeaders) {
  const owner = ownerStore.find((o) => o.id === id);
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

  const owner = { id: nextOwnerId++, name, email, phone: phone ?? null };
  ownerStore.push(owner);
  return makeResponse(201, 'Created', { success: true, data: ownerWithCats(owner) });
}

function updateOwner(id, body) {
  const idx = ownerStore.findIndex((o) => o.id === id);
  if (idx === -1) return makeResponse(404, 'Not Found', { error: `Owner ${id} not found` });

  let data;
  try { data = JSON.parse(body); }
  catch { return makeResponse(400, 'Bad Request', { error: 'Invalid JSON body' }); }

  const { name, email, phone } = data;
  if (!name || !email) {
    return makeResponse(422, 'Unprocessable Entity', { error: '"name" and "email" are required' });
  }

  ownerStore[idx] = { id, name, email, phone: phone ?? null };
  return makeResponse(200, 'OK', { success: true, data: ownerWithCats(ownerStore[idx]) });
}

function deleteOwner(id) {
  const idx = ownerStore.findIndex((o) => o.id === id);
  if (idx === -1) return makeResponse(404, 'Not Found', { error: `Owner ${id} not found` });

  // Unlink cats from this owner
  if (catStore) {
    for (const cat of catStore) {
      if (cat.ownerId === id) cat.ownerId = null;
    }
  }
  ownerStore.splice(idx, 1);
  return makeEmptyResponse(204, 'No Content');
}

function assignCatToOwner(ownerId, catId) {
  const owner = ownerStore.find((o) => o.id === ownerId);
  if (!owner) return makeResponse(404, 'Not Found', { error: `Owner ${ownerId} not found` });
  if (!catStore) return makeResponse(500, 'Internal Server Error', { error: 'Cat store not available' });

  const cat = catStore.find((c) => c.id === catId);
  if (!cat) return makeResponse(404, 'Not Found', { error: `Cat ${catId} not found` });

  cat.ownerId = ownerId;
  return makeResponse(200, 'OK', { success: true, message: `Cat ${catId} assigned to owner ${ownerId}`, data: cat });
}

function unassignCatFromOwner(ownerId, catId) {
  if (!catStore) return makeResponse(500, 'Internal Server Error', { error: 'Cat store not available' });
  const cat = catStore.find((c) => c.id === catId && c.ownerId === ownerId);
  if (!cat) return makeResponse(404, 'Not Found', { error: `Cat ${catId} is not owned by owner ${ownerId}` });
  cat.ownerId = null;
  return makeEmptyResponse(204, 'No Content');
}

// ─── Router ───────────────────────────────────────────────────────────────────

/**
 * Routes /api/owners/* requests.
 * @param {Object} parsedReq
 * @returns {string|null} serialized response or null if no match
 */
function ownerRouter(parsedReq) {
  const { method, path: reqPath, body, headers } = parsedReq;
  const cleanPath = reqPath.split('?')[0];

  // ── Collection ──────────────────────────────────────────────────────────────
  if (cleanPath === '/api/owners') {
    if (method === 'GET')  return getAllOwners(headers);
    if (method === 'HEAD') {
      const full = getAllOwners(headers);
      return full.replace(/\r\n\r\n[\s\S]*$/, '\r\n\r\n');
    }
    if (method === 'POST') return createOwner(body);
    return makeEmptyResponse(405, 'Method Not Allowed', { Allow: 'GET, HEAD, POST' });
  }

  // ── Cat assignment: /api/owners/:oid/cats/:cid ──────────────────────────────
  if (/^\/api\/owners\/\d+\/cats\/\d+$/.test(cleanPath)) {
    const ownerId = extractOwnerId(cleanPath);
    const catId   = extractCatId(cleanPath);
    if (method === 'POST')   return assignCatToOwner(ownerId, catId);
    if (method === 'DELETE') return unassignCatFromOwner(ownerId, catId);
    return makeEmptyResponse(405, 'Method Not Allowed', { Allow: 'POST, DELETE' });
  }

  // ── Item: /api/owners/:id ───────────────────────────────────────────────────
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

module.exports = { ownerRouter, ownerStore, setCatStore };
