import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';

/** A bounded validation script owns this server and closes it in its finally block. */
export async function startPreview() {
  const root = resolve('dist');
  const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
  const server = createServer(async (request, response) => {
    try {
      const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
      const file = resolve(root, pathname.replace(/^\/preview\//, '') || 'index.html');
      if (!pathname.startsWith('/preview/') || !file.startsWith(root + '/')) throw new Error('not found');
      const data = await readFile(file);
      response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' }); response.end(data);
    } catch { response.writeHead(404); response.end('Not found'); }
  });
  await new Promise((done) => server.listen(0, '127.0.0.1', done));
  return {
    url: `http://127.0.0.1:${server.address().port}/preview/index.html`,
    close: () => new Promise((done) => server.close(done)),
  };
}
