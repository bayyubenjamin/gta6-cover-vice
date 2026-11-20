// Vice Cover Studio — tiny static server for local development.
//
// Serves app/ at http://localhost:8080 so the editor can be tried in a
// desktop browser. Standard library only; run it with `node serve.ts`.
// The port can be changed with the PORT environment variable.

import { createReadStream, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

var APP_DIR = resolve(join(fileURLToPath(new URL('.', import.meta.url)), 'app'));
var PORT = Number(process.env.PORT || 8080);

var MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

var server = createServer(function (req, res) {
  var rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rawPath === '/') rawPath = '/index.html';
  var filePath = resolve(join(APP_DIR, rawPath));
  // Refuse anything that climbs out of app/.
  if (filePath !== APP_DIR && !filePath.startsWith(APP_DIR + '/')) {
    res.writeHead(403, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }
  var stat;
  try {
    stat = statSync(filePath);
  } catch (err) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found: ' + rawPath);
    return;
  }
  if (!stat.isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('Not found: ' + rawPath);
    return;
  }
  var type = MIME[extname(filePath).toLowerCase()] || 'application/octet-stream';
  // Never cache during development: the editor changes often, and a
  // stale cached font or script is the classic "it works on reload"
  // trap. The shipped app is static files, so this costs nothing.
  var headers = { 'content-type': type, 'content-length': stat.size, 'cache-control': 'no-store' };
  res.writeHead(200, headers);
  createReadStream(filePath).pipe(res);
});

server.listen(PORT, function () {
  // The server stays quiet on purpose: no logging, no tracking.
});

export { server };
