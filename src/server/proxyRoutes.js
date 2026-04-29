"use strict";

const { serializeResponse } = require("../shared/httpParser");

async function proxyRouter(parsedReq) {
  const { method, path, body } = parsedReq;
  if (path !== '/api/proxy' || method !== 'POST') return null;

  try {
    let data;
    try {
      data = JSON.parse(body);
    } catch {
      return serializeResponse({
        statusCode: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Invalid JSON body in proxy request" })
      });
    }

    const { url, method: proxyMethod = 'GET', headers = {}, body: proxyBody } = data;

    if (!url) {
      return serializeResponse({
        statusCode: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ error: "Missing url in proxy request" })
      });
    }

    const options = {
      method: proxyMethod,
      headers: { ...headers }
    };
    
    // Remove headers that should not be proxied directly
    delete options.headers['host'];
    delete options.headers['connection'];
    delete options.headers['content-length'];

    if (proxyBody && ['POST', 'PUT', 'PATCH'].includes(proxyMethod.toUpperCase())) {
      options.body = proxyBody;
    }

    const response = await fetch(url, options);
    
    const arrayBuffer = await response.arrayBuffer();
    const bufferBody = Buffer.from(arrayBuffer);

    const outHeaders = {};
    for (const [key, value] of response.headers.entries()) {
      if (['content-encoding', 'transfer-encoding', 'connection'].includes(key.toLowerCase())) continue;
      outHeaders[key] = value;
    }
    outHeaders['Content-Length'] = bufferBody.length;

    return serializeResponse({
      statusCode: response.status,
      statusText: response.statusText || "OK",
      headers: outHeaders,
      body: bufferBody.toString('binary')
    });
  } catch (err) {
    return serializeResponse({
      statusCode: 502,
      statusText: "Bad Gateway",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: `Proxy fetch error: ${err.message}` })
    });
  }
}

module.exports = { proxyRouter };
