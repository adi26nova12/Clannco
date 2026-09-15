// Local static server that resolves URLs the way Netlify's Pretty URLs do, so extensionless internal links
// (/automation/real-estate) work locally. No dependencies. Sends no-cache headers so a test never runs a
// stale module or stylesheet.
//
//   node tools/dev-server.mjs [port]      (default 5173)
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// fileURLToPath decodes the URL (e.g. the space in "Clannco v2" arrives as %20) and handles drive letters.
const ROOT = resolve(fileURLToPath(new URL('..', import.meta.url)));
const PORT = Number(process.argv[2]) || 5173;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8',
};

async function isFile(p) {
  try { return (await stat(p)).isFile(); } catch { return false; }
}

// /a/b → /a/b, /a/b.html, /a/b/index.html   (Netlify Pretty URLs)
async function resolvePath(urlPath) {
  const clean = normalize(decodeURIComponent(urlPath)).replace(/^([/\\])+/, '');
  const base = join(ROOT, clean);
  if (!base.startsWith(ROOT + sep) && base !== ROOT) return null; // no path traversal
  const candidates = urlPath.endsWith('/') ? [join(base, 'index.html')] : [base, base + '.html', join(base, 'index.html')];
  for (const c of candidates) if (await isFile(c)) return c;
  return null;
}

createServer(async (req, res) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  const file = await resolvePath(pathname);
  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end('404 ' + pathname);
    return;
  }
  const body = await readFile(file);
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : body);
}).listen(PORT, () => console.log(`Clannco dev server: http://localhost:${PORT}  (root ${ROOT})`));
