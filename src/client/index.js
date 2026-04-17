#!/usr/bin/env node
/**
 * index.js — Interactive CLI Client
 *
 * A full-featured menu-driven HTTP client using raw TCP sockets.
 * Demonstrates all protocol features: auth, CRUD, HEAD, cookies, external URLs.
 *
 * Run: npm run client  (from usj-http-project/)
 */

'use strict';

const readline = require('readline');
const { request, cookieJar, setSessionToken, clearSession } = require('./httpClient');

// ─── Config ───────────────────────────────────────────────────────────────────

const SERVER  = { host: '127.0.0.1', port: 3000 };
const API_KEY = 'supersecret-key-123';

// ─── ANSI colours ─────────────────────────────────────────────────────────────

const C = {
  reset:   '\x1b[0m', bold: '\x1b[1m',
  cyan:    '\x1b[36m', green: '\x1b[32m',
  yellow:  '\x1b[33m', red: '\x1b[31m',
  gray:    '\x1b[90m', blue: '\x1b[34m',
  magenta: '\x1b[35m',
};

const rl  = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q) => new Promise((res) => rl.question(q, res));

// ─── UI helpers ───────────────────────────────────────────────────────────────

function printBanner() {
  console.clear();
  console.log(`${C.cyan}${C.bold}`);
  console.log('  ╔══════════════════════════════════════════════╗');
  console.log('  ║   🐱  Cat Shelter API  —  CLI Client         ║');
  console.log('  ║   RFC 9112 · Raw TCP Sockets · HTTP/1.1      ║');
  console.log('  ╚══════════════════════════════════════════════╝');
  console.log(C.reset);
}

function printMenu() {
  console.log(`${C.bold}  ── 🐱 Cat Resource ──────────────────────────────────${C.reset}`);
  console.log(`  ${C.green}1${C.reset}  List all cats            ${C.gray}GET    /api/cats${C.reset}`);
  console.log(`  ${C.green}2${C.reset}  Get cat by ID            ${C.gray}GET    /api/cats/:id${C.reset}`);
  console.log(`  ${C.green}3${C.reset}  Create a cat             ${C.gray}POST   /api/cats${C.reset}`);
  console.log(`  ${C.green}4${C.reset}  Update a cat             ${C.gray}PUT    /api/cats/:id${C.reset}`);
  console.log(`  ${C.green}5${C.reset}  Delete a cat             ${C.gray}DELETE /api/cats/:id${C.reset}`);
  console.log(`  ${C.green}6${C.reset}  HEAD check               ${C.gray}HEAD   /api/cats${C.reset}`);
  console.log(`  ${C.green}7${C.reset}  Upload cat photo         ${C.gray}POST   /api/cats/:id/photo${C.reset}`);
  console.log();
  console.log(`${C.bold}  ── 👤 Owner Resource ────────────────────────────────${C.reset}`);
  console.log(`  ${C.blue}8${C.reset}  List all owners          ${C.gray}GET    /api/owners${C.reset}`);
  console.log(`  ${C.blue}9${C.reset}  Assign cat to owner      ${C.gray}POST   /api/owners/:oid/cats/:cid${C.reset}`);
  console.log();
  console.log(`${C.bold}  ── 🔐 Authentication ────────────────────────────────${C.reset}`);
  console.log(`  ${C.magenta}a${C.reset}  Register user            ${C.gray}POST   /auth/register${C.reset}`);
  console.log(`  ${C.magenta}b${C.reset}  Login                    ${C.gray}POST   /auth/login${C.reset}`);
  console.log(`  ${C.magenta}c${C.reset}  My profile               ${C.gray}GET    /auth/me${C.reset}`);
  console.log(`  ${C.magenta}d${C.reset}  Logout                   ${C.gray}POST   /auth/logout${C.reset}`);
  console.log();
  console.log(`${C.bold}  ── 🌐 Generic Requests ──────────────────────────────${C.reset}`);
  console.log(`  ${C.yellow}e${C.reset}  Custom request to local server`);
  console.log(`  ${C.yellow}f${C.reset}  Request to external URL  ${C.gray}(e.g. http://example.com)${C.reset}`);
  console.log();
  console.log(`  ${C.red}0${C.reset}  Exit`);
  console.log();
}

function printResponse(res) {
  const sc = res.statusCode;
  const color = sc < 300 ? C.green : sc < 400 ? C.yellow : C.red;
  console.log(`\n${C.bold}  ← Response${C.reset}`);
  console.log(`  Status  : ${color}${sc} ${res.statusText}${C.reset}`);
  console.log(`  Headers :`);
  for (const [k, v] of Object.entries(res.headers)) {
    console.log(`    ${C.gray}${k}${C.reset}: ${v}`);
  }
  if (res.body && res.body.trim()) {
    try {
      const pretty = JSON.stringify(JSON.parse(res.body), null, 2)
        .split('\n').map((l) => '    ' + l).join('\n');
      console.log(`  Body    :\n${C.cyan}${pretty}${C.reset}`);
    } catch {
      const preview = res.body.length > 600 ? res.body.slice(0, 600) + '\n  ...(truncated)' : res.body;
      console.log(`  Body    :\n${C.cyan}${preview}${C.reset}`);
    }
  } else {
    console.log(`  Body    : ${C.gray}(empty)${C.reset}`);
  }
  console.log();
}

// ─── Cat commands ─────────────────────────────────────────────────────────────

const S = SERVER;
const K = API_KEY;

async function listCats() {
  console.log(`\n${C.yellow}  → GET /api/cats${C.reset}`);
  printResponse(await request({ ...S, method: 'GET', path: '/api/cats', apiKey: K }));
}

async function getCatById() {
  const id = await ask('  Cat ID: ');
  printResponse(await request({ ...S, method: 'GET', path: `/api/cats/${id}`, apiKey: K }));
}

async function createCat() {
  const name  = await ask('  Name   : ');
  const breed = await ask('  Breed  : ');
  const age   = await ask('  Age    : ');
  const color = await ask('  Color  : ');
  const body  = JSON.stringify({ name, breed, age: Number(age) || null, color });
  printResponse(await request({ ...S, method: 'POST', path: '/api/cats', apiKey: K, body }));
}

async function updateCat() {
  const id    = await ask('  Cat ID  : ');
  const name  = await ask('  Name    : ');
  const breed = await ask('  Breed   : ');
  const age   = await ask('  Age     : ');
  const color = await ask('  Color   : ');
  const body  = JSON.stringify({ name, breed, age: Number(age) || null, color });
  printResponse(await request({ ...S, method: 'PUT', path: `/api/cats/${id}`, apiKey: K, body }));
}

async function deleteCat() {
  const id = await ask('  Cat ID to delete: ');
  printResponse(await request({ ...S, method: 'DELETE', path: `/api/cats/${id}`, apiKey: K }));
}

async function headCats() {
  console.log(`\n${C.yellow}  → HEAD /api/cats${C.reset}`);
  const res = await request({ ...S, method: 'HEAD', path: '/api/cats', apiKey: K });
  printResponse(res);
}

async function uploadPhoto() {
  const id   = await ask('  Cat ID: ');
  const b64  = await ask('  Base64 image data (or paste data URL): ');
  const mime = await ask('  MIME type [image/jpeg]: ') || 'image/jpeg';
  const photo = b64.startsWith('data:') ? b64 : `data:${mime};base64,${b64}`;
  const body  = JSON.stringify({ photo });
  printResponse(await request({ ...S, method: 'POST', path: `/api/cats/${id}/photo`, apiKey: K, body }));
}

// ─── Owner commands ───────────────────────────────────────────────────────────

async function listOwners() {
  console.log(`\n${C.yellow}  → GET /api/owners${C.reset}`);
  printResponse(await request({ ...S, method: 'GET', path: '/api/owners', apiKey: K }));
}

async function assignCat() {
  const oid = await ask('  Owner ID: ');
  const cid = await ask('  Cat ID  : ');
  printResponse(await request({ ...S, method: 'POST', path: `/api/owners/${oid}/cats/${cid}`, apiKey: K }));
}

// ─── Auth commands ────────────────────────────────────────────────────────────

async function registerUser() {
  const username = await ask('  Username : ');
  const password = await ask('  Password : ');
  const body = JSON.stringify({ username, password });
  printResponse(await request({ ...S, method: 'POST', path: '/auth/register', body }));
}

async function loginUser() {
  const username = await ask('  Username : ');
  const password = await ask('  Password : ');
  const body = JSON.stringify({ username, password });
  const res = await request({ ...S, method: 'POST', path: '/auth/login', body });
  printResponse(res);
  if (res.statusCode === 200) {
    try {
      const parsed = JSON.parse(res.body);
      if (parsed.token) {
        setSessionToken(parsed.token);
        console.log(`  ${C.green}✓ Session token stored automatically.${C.reset}\n`);
      }
    } catch { /* ignore */ }
  }
}

async function getMe() {
  printResponse(await request({ ...S, method: 'GET', path: '/auth/me' }));
}

async function logoutUser() {
  const res = await request({ ...S, method: 'POST', path: '/auth/logout' });
  clearSession();
  cookieJar.clear();
  printResponse(res);
  console.log(`  ${C.green}✓ Session cleared.${C.reset}\n`);
}

// ─── Generic commands ─────────────────────────────────────────────────────────

async function customLocal() {
  const method  = (await ask('  Method (GET/HEAD/POST/PUT/DELETE): ')).toUpperCase().trim();
  const path    = (await ask('  Path (e.g. /api/cats): ')).trim();
  const extraH  = (await ask('  Extra headers (key:value,… or blank): ')).trim();
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const body    = hasBody ? await ask('  Body (JSON or blank): ') : '';

  const extraHeaders = {};
  if (extraH) {
    for (const p of extraH.split(',')) {
      const ci = p.indexOf(':');
      if (ci !== -1) extraHeaders[p.slice(0, ci).trim()] = p.slice(ci + 1).trim();
    }
  }
  printResponse(await request({ ...S, method, path, apiKey: K, body, headers: extraHeaders }));
}

async function customExternal() {
  const rawUrl  = (await ask('  URL (e.g. http://example.com/): ')).trim();
  const method  = ((await ask('  Method [GET]: ')).toUpperCase().trim()) || 'GET';
  const extraH  = (await ask('  Extra headers (key:value,… or blank): ')).trim();
  const hasBody = ['POST', 'PUT', 'PATCH'].includes(method);
  const body    = hasBody ? await ask('  Body (JSON or blank): ') : '';

  const extraHeaders = {};
  if (extraH) {
    for (const p of extraH.split(',')) {
      const ci = p.indexOf(':');
      if (ci !== -1) extraHeaders[p.slice(0, ci).trim()] = p.slice(ci + 1).trim();
    }
  }
  console.log(`\n${C.yellow}  → ${method} ${rawUrl}${C.reset}`);
  printResponse(await request({ url: rawUrl, method, body, headers: extraHeaders }));
}

// ─── Main loop ────────────────────────────────────────────────────────────────

async function main() {
  printBanner();
  console.log(`  ${C.gray}Server: http://${SERVER.host}:${SERVER.port}${C.reset}\n`);

  while (true) {
    printMenu();
    const choice = (await ask(`  ${C.bold}Command ›${C.reset} `)).trim().toLowerCase();
    console.log();

    try {
      switch (choice) {
        case '1': await listCats();     break;
        case '2': await getCatById();   break;
        case '3': await createCat();    break;
        case '4': await updateCat();    break;
        case '5': await deleteCat();    break;
        case '6': await headCats();     break;
        case '7': await uploadPhoto();  break;
        case '8': await listOwners();   break;
        case '9': await assignCat();    break;
        case 'a': await registerUser(); break;
        case 'b': await loginUser();    break;
        case 'c': await getMe();        break;
        case 'd': await logoutUser();   break;
        case 'e': await customLocal();  break;
        case 'f': await customExternal(); break;
        case '0':
          console.log(`\n  ${C.cyan}Goodbye! 🐾${C.reset}\n`);
          rl.close();
          process.exit(0);
        default:
          console.log(`  ${C.red}Unknown command. Type 0 to exit.${C.reset}\n`);
      }
    } catch (err) {
      console.error(`\n  ${C.red}Error: ${err.message}${C.reset}\n`);
      if (err.code === 'ECONNREFUSED') {
        console.error(`  ${C.gray}→ Is the server running? Try: npm start${C.reset}\n`);
      }
    }

    await ask(`  ${C.gray}Press ENTER to continue...${C.reset}`);
    printBanner();
    console.log(`  ${C.gray}Server: http://${SERVER.host}:${SERVER.port}${C.reset}\n`);
  }
}

main();
