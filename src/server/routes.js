/**
 * routes.js
 * 🐱 Cat resource REST API with:
 *   - Full CRUD (GET / POST / PUT / DELETE / HEAD)
 *   - JSON responses with RFC 7232 ETag & Last-Modified (conditional GET)
 *   - 204 No Content on DELETE (RFC 9110 §9.3.5)
 *   - 304 Not Modified when If-None-Match matches current ETag
 *   - 📸 Photo upload/download per cat (base64-encoded binary)
 *   - Proper 405 Method Not Allowed with Allow header
 *   - ownerId field linking cats to the owners resource
 */

"use strict";

const fs = require('fs');
const path = require('path');

const { serializeResponse } = require("../shared/httpParser");
const {
  makeResponse,
  makeEmptyResponse,
  makeNotModified,
  computeETag,
  isCacheHit,
} = require("./responseHelpers");

// ─── In-memory data store ─────────────────────────────────────────────────────

/**
 * @type {{
 *   id: number, name: string, breed: string, age: number|null,
 *   color: string|null, ownerId: number|null,
 *   photo: string|null,     // base64-encoded JPEG/PNG data URL
 *   photoMime: string|null, // e.g. 'image/jpeg'
 *   createdAt: string, updatedAt: string
 * }[]}
 */
let catStore = [
  {
    id: 1,
    name: "Whiskers",
    breed: "Domestic Shorthair",
    age: 3,
    color: "Orange",
    ownerId: 1,
    photo: null,
    photoMime: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 2,
    name: "Luna",
    breed: "Siamese",
    age: 5,
    color: "Cream",
    ownerId: 1,
    photo: null,
    photoMime: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    id: 3,
    name: "Mochi",
    breed: "Scottish Fold",
    age: 2,
    color: "Grey",
    ownerId: 2,
    photo: null,
    photoMime: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

// ─── Load Default Images ─────────────────────────────────────────────────────
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
      } catch(e) { console.error('Error reading default image:', e); }
    }
  }
  return { photo: null, photoMime: null };
}

for (let cat of catStore) {
  const defaults = loadDefaultCatImage(cat.id);
  cat.photo = defaults.photo;
  cat.photoMime = defaults.photoMime;
}

/** Expose catStore so ownerRoutes can share the same reference */
module.exports.catStore = catStore;

// ─── Route handlers ───────────────────────────────────────────────────────────

/** GET /api/cats */
function getAllCats(reqHeaders) {
  // Return lightweight list (no photo data in list view)
  const data = catStore.map(({ photo, photoMime, ...rest }) => rest);
  const payload = { success: true, count: data.length, data };
  const etag = computeETag(payload);
  console.log('ETAG DEBUG SERVER:', etag, reqHeaders['if-none-match']); if (isCacheHit(reqHeaders, etag)) return makeNotModified(etag);
  return makeResponse(200, "OK", payload);
}

/** GET /api/cats/:id */
function getCatById(id, reqHeaders) {
  const cat = catStore.find((c) => c.id === id);
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

  let newId = 1;
  const takenIds = new Set(catStore.map(c => c.id));
  while (takenIds.has(newId)) newId++;

  const newCat = {
    id: newId,
    name,
    breed,
    age: age ?? null,
    color: color ?? null,
    ownerId: ownerId ?? null,
    photo: null,
    photoMime: null,
    createdAt: now,
    updatedAt: now,
  };
  catStore.push(newCat);
  const { photo, photoMime, ...catData } = newCat;
  return makeResponse(201, "Created", { success: true, data: catData });
}

/** PUT /api/cats/:id */
function updateCat(id, body) {
  const idx = catStore.findIndex((c) => c.id === id);
  if (idx === -1)
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

  catStore[idx] = {
    ...catStore[idx],
    name,
    breed,
    age: age ?? null,
    color: color ?? null,
    ownerId: ownerId ?? catStore[idx].ownerId,
    updatedAt: new Date().toISOString(),
  };

  const { photo, photoMime, ...catData } = catStore[idx];
  return makeResponse(200, "OK", { success: true, data: catData });
}

/** DELETE /api/cats/:id — RFC 9110 §9.3.5 mandates 204 No Content */
function deleteCat(id) {
  const idx = catStore.findIndex((c) => c.id === id);
  if (idx === -1)
    return makeResponse(404, "Not Found", {
      success: false,
      error: `Cat ${id} not found`,
    });
  catStore.splice(idx, 1);
  return makeEmptyResponse(204, "No Content");
}

// ─── 📸 Multimedia photo upload / download ────────────────────────────────────

/**
 * POST /api/cats/:id/photo
 * Accepts:
 *   a) Content-Type: image/* — raw binary body (stored as base64)
 *   b) Content-Type: application/json — body: { photo: "data:image/jpeg;base64,..." }
 */
function uploadCatPhoto(id, body, headers) {
  const cat = catStore.find((c) => c.id === id);
  if (!cat)
    return makeResponse(404, "Not Found", { error: `Cat ${id} not found` });

  const contentType = (headers["content-type"] || "").toLowerCase();

  if (contentType.startsWith("image/")) {
    // Raw binary — body is the raw bytes (as string from buffer)
    cat.photo = Buffer.from(body, "binary").toString("base64");
    cat.photoMime = contentType.split(";")[0].trim();
  } else {
    // JSON with a data URL field
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return makeResponse(400, "Bad Request", { error: "Invalid JSON body" });
    }

    const { photo } = data;
    if (!photo || !photo.startsWith("data:")) {
      return makeResponse(422, "Unprocessable Entity", {
        error: 'Provide photo as data URL: "data:image/jpeg;base64,..."',
      });
    }
    const [header, b64] = photo.split(",");
    const mime = (header.match(/data:([^;]+)/) || [])[1] || "image/jpeg";
    cat.photo = b64;
    cat.photoMime = mime;
  }

  cat.updatedAt = new Date().toISOString();
  return makeResponse(200, "OK", {
    success: true,
    message: `Photo uploaded for cat ${id}`,
    photoMime: cat.photoMime,
  });
}

/**
 * GET /api/cats/:id/photo
 * Returns the raw binary image with the correct Content-Type.
 */
function downloadCatPhoto(id) {
  const cat = catStore.find((c) => c.id === id);
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

/**
 * Routes /api/cats/* requests.
 * @param {Object} parsedReq - { method, path, headers, body }
 * @returns {string|null} serialized response or null if no match
 */
function router(parsedReq) {
  const { method, path: reqPath, body, headers } = parsedReq;
  const cleanPath = reqPath.split("?")[0];

  // ── Photo endpoints ─────────────────────────────────────────────────────────
  const photoMatch = cleanPath.match(/^\/api\/cats\/(\d+)\/photo$/);
  if (photoMatch) {
    const id = parseInt(photoMatch[1], 10);
    if (method === "POST") return uploadCatPhoto(id, body, headers);
    if (method === "GET") return downloadCatPhoto(id);
    return makeEmptyResponse(405, "Method Not Allowed", { Allow: "GET, POST" });
  }

  // ── Collection: /api/cats ───────────────────────────────────────────────────
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

  // ── Item: /api/cats/:id ─────────────────────────────────────────────────────
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

module.exports = { router, catStore };
