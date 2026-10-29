/**
 * dev-server.js — preview the site on localhost before pushing to GitHub Pages.
 *
 *   node graduation-rsvp/dev-server.js            -> http://localhost:5500
 *   PORT=8080 node graduation-rsvp/dev-server.js  -> another port
 *
 * Serves the repo root like GitHub Pages does, so the same paths work:
 *   /                                         -> root redirect (index.html)
 *   /graduation-rsvp/frontend/index.html      -> invitation
 *   /graduation-rsvp/frontend/admin.html      -> admin console
 *
 * No dependencies. Files are read fresh on every request (just reload after editing),
 * and caching is disabled so the browser never shows a stale version.
 * Note: the page still talks to the real Apps Script backend in config.js.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.env.PORT) || 5500;

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.txt': 'text/plain; charset=utf-8'
};

http.createServer((req, res) => {
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch (e) {
    res.writeHead(400);
    return res.end('Bad request');
  }

  let file = path.join(ROOT, urlPath);
  // Never serve anything outside the repo
  if (!file.startsWith(ROOT)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  if (urlPath.endsWith('/')) file = path.join(file, 'index.html');

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      console.log(`404 ${urlPath}`);
      return res.end(`404 — ${urlPath}`);
    }
    res.writeHead(200, {
      'Content-Type': TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
}).listen(PORT, () => {
  console.log(`Graduation invitation preview: http://localhost:${PORT}/`);
  console.log(`  Invitation: http://localhost:${PORT}/graduation-rsvp/frontend/index.html`);
  console.log(`  Admin:      http://localhost:${PORT}/graduation-rsvp/frontend/admin.html`);
});
