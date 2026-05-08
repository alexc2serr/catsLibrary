/**
 * routes.js
 * 🐱 Cat resource REST API with SQLite persistence.
 */

"use strict";

const fs = require('fs');
const path = require('path');

const db = require('./db');
const { serializeResponse } = require("../shared/httpParser");
const {
  makeResponse,
  makeEmptyResponse,
  makeNotModified,
  computeETag,
  isCacheHit,
} = require("./responseHelpers");

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Finds the first available ID (filling gaps from deletions) */
function getNextCatId() {
  const ids = db.prepare('SELECT id FROM cats ORDER BY id ASC').all().map(r => r.id);
  let nextId = 1;
  for (const id of ids) {
    if (id === nextId) nextId++;
    else break;
  }
  return nextId;
}

// ─── Route handlers ───────────────────────────────────────────────────────────

/** GET /api/cats */
function getAllCats(reqHeaders) {
  // Return lightweight list (no photo data in list view)
  const data = db.prepare('SELECT id, name, breed, age, color, ownerId, createdAt, updatedAt FROM cats').all();
  const payload = { success: true, count: data.length, data };
  const etag = computeETag(payload);
  
  if (isCacheHit(reqHeaders, etag)) return makeNotModified(etag);
  return makeResponse(200, "OK", payload);
}

/** GET /api/cats/:id */
function getCatById(id, reqHeaders) {
  const cat = db.prepare('SELECT * FROM cats WHERE id = ?').get(id);
  if (!cat)
    return makeResponse(404, "Not Found", {
      success: false,
      error: `Cat ${id} not found`,
    });

  const { photo, photoMime, ...catData } = cat;
  const hasPhoto = !!photo;
  const payload = {
    success: true,
    data: {
      ...catData,
      hasPhoto,
      photoUrl: hasPhoto ? `/api/cats/${id}/photo` : null,
    },
  };

  const etag = computeETag(payload);
  if (isCacheHit(reqHeaders, etag)) return makeNotModified(etag);

  return makeResponse(200, "OK", payload);
}

/** POST /api/cats */
function createCat(body) {
  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return makeResponse(400, "Bad Request", {
      success: false,
      error: "Invalid JSON body",
    });
  }

  const { name, breed, age, color, ownerId } = data;
  if (!name || !breed) {
    return makeResponse(422, "Unprocessable Entity", {
      success: false,
      error: '"name" and "breed" are required',
    });
  }

  const now = new Date().toISOString();
  const newId = getNextCatId();

  db.prepare(`
    INSERT INTO cats (id, name, breed, age, color, ownerId, createdAt, updatedAt)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(newId, name, breed, age ?? null, color ?? null, ownerId ?? null, now, now);

  const newCat = db.prepare('SELECT id, name, breed, age, color, ownerId, createdAt, updatedAt FROM cats WHERE id = ?').get(newId);
  return makeResponse(201, "Created", { success: true, data: newCat });
}

/** PUT /api/cats/:id */
function updateCat(id, body) {
  const cat = db.prepare('SELECT id, ownerId FROM cats WHERE id = ?').get(id);
  if (!cat)
    return makeResponse(404, "Not Found", {
      success: false,
      error: `Cat ${id} not found`,
    });

  let data;
  try {
    data = JSON.parse(body);
  } catch {
    return makeResponse(400, "Bad Request", {
      success: false,
      error: "Invalid JSON body",
    });
  }

  const { name, breed, age, color, ownerId } = data;
  if (!name || !breed) {
    return makeResponse(422, "Unprocessable Entity", {
      success: false,
      error: '"name" and "breed" are required',
    });
  }

  const now = new Date().toISOString();
  db.prepare(`
    UPDATE cats 
    SET name = ?, breed = ?, age = ?, color = ?, ownerId = ?, updatedAt = ?
    WHERE id = ?
  `).run(name, breed, age ?? null, color ?? null, ownerId ?? cat.ownerId, now, id);

  const updatedCat = db.prepare('SELECT id, name, breed, age, color, ownerId, createdAt, updatedAt FROM cats WHERE id = ?').get(id);
  return makeResponse(200, "OK", { success: true, data: updatedCat });
}

/** DELETE /api/cats/:id — RFC 9110 §9.3.5 mandates 204 No Content */
function deleteCat(id) {
  const result = db.prepare('DELETE FROM cats WHERE id = ?').run(id);
  if (result.changes === 0)
    return makeResponse(404, "Not Found", {
      success: false,
      error: `Cat ${id} not found`,
    });
  return makeEmptyResponse(204, "No Content");
}

// ─── 📸 Multimedia photo upload / download ────────────────────────────────────

/**
 * POST /api/cats/:id/photo
 */
function uploadCatPhoto(id, body, headers) {
  const cat = db.prepare('SELECT id FROM cats WHERE id = ?').get(id);
  if (!cat)
    return makeResponse(404, "Not Found", { error: `Cat ${id} not found` });

  const contentType = (headers["content-type"] || "").toLowerCase();
  let photo, photoMime;

  if (contentType.startsWith("image/")) {
    photo = Buffer.from(body, "binary").toString("base64");
    photoMime = contentType.split(";")[0].trim();
  } else {
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return makeResponse(400, "Bad Request", { error: "Invalid JSON body" });
    }

    const { photo: photoData } = data;
    if (!photoData || !photoData.startsWith("data:")) {
      return makeResponse(422, "Unprocessable Entity", {
        error: 'Provide photo as data URL: "data:image/jpeg;base64,..."',
      });
    }
    const [header, b64] = photoData.split(",");
    photoMime = (header.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
    photo = b64;
  }

  const now = new Date().toISOString();
  db.prepare('UPDATE cats SET photo = ?, photoMime = ?, updatedAt = ? WHERE id = ?')
    .run(photo, photoMime, now, id);

  return makeResponse(200, "OK", {
    success: true,
    message: `Photo uploaded for cat ${id}`,
    photoMime: photoMime,
  });
}

/**
 * GET /api/cats/:id/photo
 */
function downloadCatPhoto(id) {
  const cat = db.prepare('SELECT photo, photoMime FROM cats WHERE id = ?').get(id);
  if (!cat)
    return makeResponse(404, "Not Found", { error: `Cat ${id} not found` });
  if (!cat.photo)
    return makeResponse(404, "Not Found", { error: `Cat ${id} has no photo` });

  const imgBuffer = Buffer.from(cat.photo, "base64");
  return serializeResponse({
    statusCode: 200,
    statusText: "OK",
    headers: {
      "Content-Type": cat.photoMime || "image/jpeg",
      "Content-Length": imgBuffer.length,
      "Cache-Control": "public, max-age=86400",
      "X-Powered-By": "usj-http-server/1.0",
    },
    body: imgBuffer.toString("binary"),
  });
}

// ─── Router ───────────────────────────────────────────────────────────────────

function router(parsedReq) {
  const { method, path: reqPath, body, headers } = parsedReq;
  const cleanPath = reqPath.split("?")[0];

  const photoMatch = cleanPath.match(/^\/api\/cats\/(\d+)\/photo$/);
  if (photoMatch) {
    const id = parseInt(photoMatch[1], 10);
    if (method === "POST") return uploadCatPhoto(id, body, headers);
    if (method === "GET") return downloadCatPhoto(id);
    return makeEmptyResponse(405, "Method Not Allowed", { Allow: "GET, POST" });
  }

  if (cleanPath === "/api/cats") {
    if (method === "GET") return getAllCats(headers);
    if (method === "HEAD") {
      const full = getAllCats(headers);
      return full.replace(/\r\n\r\n[\s\S]*$/, "\r\n\r\n");
    }
    if (method === "POST") return createCat(body);
    return makeEmptyResponse(405, "Method Not Allowed", {
      Allow: "GET, HEAD, POST",
    });
  }

  if (/^\/api\/cats\/\d+$/.test(cleanPath)) {
    const id = parseInt(cleanPath.split("/").pop(), 10);
    if (method === "GET") return getCatById(id, headers);
    if (method === "HEAD") {
      const full = getCatById(id, headers);
      return full.replace(/\r\n\r\n[\s\S]*$/, "\r\n\r\n");
    }
    if (method === "PUT") return updateCat(id, body);
    if (method === "DELETE") return deleteCat(id);
    return makeEmptyResponse(405, "Method Not Allowed", {
      Allow: "GET, HEAD, PUT, DELETE",
    });
  }

  return null;
}

module.exports = { router };
