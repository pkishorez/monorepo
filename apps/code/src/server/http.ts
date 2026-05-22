import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';

const OTEL_BASE_URL = (process.env.OTEL_BASE_URL ?? '')
  .trim()
  .replace(/\/+$/, '');
const OTEL_SIGNALS = new Set(['/v1/traces', '/v1/metrics', '/v1/logs']);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html',
  '.js': 'application/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

function handleOtelProxy(req: IncomingMessage, res: ServerResponse): boolean {
  const url = req.url ?? '/';
  if (req.method !== 'POST' || !url.startsWith('/api/otel/')) return false;

  const signalPath = url.slice('/api/otel'.length);
  if (!OTEL_SIGNALS.has(signalPath)) {
    res.writeHead(404).end('Not found');
    return true;
  }
  if (OTEL_BASE_URL === '') {
    res.writeHead(204).end();
    return true;
  }

  const body: Buffer[] = [];
  req.on('data', (chunk: Buffer) => body.push(chunk));
  req.on('end', async () => {
    try {
      const upstream = await fetch(`${OTEL_BASE_URL}${signalPath}`, {
        method: 'POST',
        headers: {
          'content-type': req.headers['content-type'] ?? 'application/json',
        },
        body: Buffer.concat(body),
      });
      res.writeHead(upstream.status, {
        'content-type':
          upstream.headers.get('content-type') ?? 'application/json',
      });
      res.end(Buffer.from(await upstream.arrayBuffer()));
    } catch {
      res.writeHead(502).end('Bad Gateway');
    }
  });
  return true;
}

function handleStatic(
  distPath: string,
  req: IncomingMessage,
  res: ServerResponse,
) {
  const url = req.url ?? '/';
  const filePath = path.join(distPath, url === '/' ? 'index.html' : url);
  const ext = path.extname(filePath);

  try {
    const data = fs.readFileSync(filePath);
    res.writeHead(200, {
      'content-type': MIME_TYPES[ext] ?? 'application/octet-stream',
    });
    res.end(data);
  } catch {
    const html = fs.readFileSync(path.join(distPath, 'index.html'));
    res.writeHead(200, { 'content-type': 'text/html' });
    res.end(html);
  }
}

export function createRequestHandler(options: {
  distPath: string;
  viteDevServer?: import('vite').ViteDevServer | null;
}) {
  return (req: IncomingMessage, res: ServerResponse) => {
    if (handleOtelProxy(req, res)) return;

    if (options.viteDevServer) {
      options.viteDevServer.middlewares(req, res);
      return;
    }

    handleStatic(options.distPath, req, res);
  };
}
