# catsLibrary
This project implements a complete **HTTP/1.1 client and server** from scratch using only Node.js transport-layer primitives (`net.createServer`, `net.Socket`). No HTTP libraries (Express, Axios, `http` module) are used for the core implementation. 

The server exposes a **RESTful API** for a cat shelter application, while the client is an interactive CLI capable of sending requests to the local server and any external HTTP server.

**Technology stack**: Node.js 18+ · Vanilla JavaScript (CommonJS) · Zero runtime dependencies for the core protocol
