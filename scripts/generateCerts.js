/**
 * generateCerts.js
 * Generates a self-signed TLS certificate and private key for the HTTPS server.
 * Uses Node's built-in crypto module only.
 *
 * Run: npm run gen-certs
 * Output: certs/server.key  and  certs/server.crt
 *
 * NOTE: Because Node < 22 does not have a native X.509 certificate generator,
 * this script shells out to openssl if available, or prints instructions otherwise.
 */

"use strict";

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const CERTS_DIR = path.join(__dirname, "../certs");
const KEY_FILE = path.join(CERTS_DIR, "server.key");
const CRT_FILE = path.join(CERTS_DIR, "server.crt");

if (!fs.existsSync(CERTS_DIR)) fs.mkdirSync(CERTS_DIR, { recursive: true });

console.log("Generating self-signed TLS certificate…");

const subject = "/C=ES/ST=Aragon/L=Zaragoza/O=USJ/OU=Networks/CN=localhost";
const cmd = [
  "openssl req -x509 -newkey rsa:2048",
  '-keyout "' + KEY_FILE + '"',
  '-out "' + CRT_FILE + '"',
  "-days 365",
  "-nodes",
  '-subj "' + subject + '"',
].join(" ");

try {
  execSync(cmd, { stdio: "pipe" });
  console.log("✅ Certificates generated:");
  console.log("   Key : " + KEY_FILE);
  console.log("   Cert: " + CRT_FILE);
  console.log("\nStart TLS server with: npm run start:tls");
} catch (err) {
  console.error("❌ openssl not found or failed.\n");
  console.error("Manual steps:");
  console.error(
    "  1. Install openssl: https://slproweb.com/products/Win32OpenSSL.html",
  );
  console.error("  2. Run in the project root:");
  console.error(`     ${cmd}`);
  console.error(
    "\nAlternatively install mkcert: https://github.com/FiloSottile/mkcert",
  );
  console.error("  mkcert -install");
  console.error(
    "  mkcert -key-file certs/server.key -cert-file certs/server.crt localhost 127.0.0.1",
  );
}
