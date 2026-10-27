// Servidor estático mínimo para ver el proyecto en local: node tools/serve.mjs [puerto]
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');
const port = Number(process.argv[2]) || 4173;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

createServer(async (req, res) => {
  const wanted = normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).split(sep).filter(Boolean).join(sep);
  const file = join(root, wanted || 'index.html');
  if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
  try {
    const data = await readFile(extname(file) ? file : join(file, 'index.html'));
    res.writeHead(200, { 'content-type': types[extname(file)] || 'text/html; charset=utf-8', 'cache-control': 'no-store' }).end(data);
  } catch { res.writeHead(404).end('No encontrado'); }
}).listen(port, '127.0.0.1', () => console.log(`AccessLens en http://127.0.0.1:${port}`));
