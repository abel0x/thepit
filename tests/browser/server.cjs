/* ThePit · Copyright (C) 2026 abel0x
   SPDX-License-Identifier: AGPL-3.0-or-later
   Free software with ABSOLUTELY NO WARRANTY; see LICENSE for the terms. */
"use strict";

// A local static server for the browser suites. Like GitHub Pages it serves a
// folder's index.html, and it can hand out the service worker under another
// cache version so that a suite can install an update.
const fs = require("node:fs");
const http = require("node:http");
const path = require("node:path");

const MIME = {
  ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".json": "application/json",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".woff2": "font/woff2",
  ".ogg": "audio/ogg", ".m4a": "audio/mp4"
};

// root: the folder to serve. workerVersion(): the CACHE_VERSION sw.js should
// carry right now. Resolves to { origin, close }.
async function startServer(root, workerVersion) {
  const server = http.createServer((request, response) => {
    let relative = decodeURIComponent(new URL(request.url, "http://localhost").pathname).replace(/^\/+/, "");
    if (relative === "" || relative.endsWith("/")) relative += "index.html";
    const file = path.resolve(root, relative);
    if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
    try {
      let body = fs.readFileSync(file);
      if (relative === "sw.js") {
        body = Buffer.from(body.toString().replace(/var CACHE_VERSION = "pit-v\d+";/, 'var CACHE_VERSION = "' + workerVersion() + '";'));
      }
      response.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream", "Cache-Control": "no-store" }).end(body);
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  return {
    origin: "http://127.0.0.1:" + server.address().port,
    close: () => new Promise(resolve => server.close(resolve))
  };
}

module.exports = { startServer };
