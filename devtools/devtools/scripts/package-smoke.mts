import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { request } from 'node:http';
import { createServer } from 'node:net';
import path from 'node:path';
import { tmpdir } from 'node:os';

const port = await availablePort();
const origin = `http://127.0.0.1:${port}`;
const { version } = JSON.parse(
  await readFile(new URL('../package.json', import.meta.url), 'utf8'),
) as { version: string };
const testRoot = await mkdtemp(path.join(tmpdir(), 'devtools-package-smoke-'));
const server = spawn(
  process.execPath,
  [
    'dist/server/main.mjs',
    '--port',
    String(port),
    '--db',
    path.join(testRoot, 'lotel.sqlite'),
  ],
  { stdio: 'ignore' },
);

try {
  const health = await waitForServer(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), {
    name: 'devtools',
    version,
    endpoints: {
      '/': 'DevTools browser application.',
      '/lotel': 'Lotel Tool.',
      '/laymos': 'Laymos Tool.',
      '/rpc': 'Typed RPC endpoint.',
      '/v1/traces': 'OTLP/HTTP Trace ingestion.',
      '/v1/logs': 'OTLP/HTTP Log Record ingestion.',
    },
  });

  for (const route of ['/', '/lotel', '/laymos', '/not-found']) {
    const response = await fetch(`${origin}${route}`, {
      headers: { accept: 'text/html' },
    });
    assert.equal(response.status, 200, route);
    assert.match(response.headers.get('cache-control') ?? '', /no-cache/);
    assert.match(await response.text(), /<div id="root"><\/div>/);
  }

  const index = await (await fetch(origin)).text();
  const assets = [...index.matchAll(/(?:src|href)="([^"#]+)"/g)]
    .map(([, asset]) => asset)
    .filter((asset): asset is string => asset?.startsWith('/assets/') ?? false);
  assert.ok(assets.length >= 2, 'the package contains script and style assets');
  for (const asset of assets) {
    const response = await fetch(`${origin}${asset}`);
    assert.equal(response.status, 200, asset);
    assert.match(response.headers.get('cache-control') ?? '', /immutable/);
  }

  assert.equal((await fetch(`${origin}/rpc/not-found`)).status, 404);
  assert.equal(
    (
      await fetch(`${origin}/health`, {
        headers: { origin: 'http://example.test' },
      })
    ).status,
    403,
  );
  assert.equal(await statusWithHost(`${origin}/health`, 'example.test'), 403);

  const preflight = await fetch(`${origin}/v1/traces`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://example.test',
      'access-control-request-method': 'POST',
      'access-control-request-private-network': 'true',
    },
  });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), '*');
  assert.equal(
    preflight.headers.get('access-control-allow-private-network'),
    'true',
  );

  console.log('packaged DevTools server smoke test passed');
} finally {
  server.kill('SIGTERM');
  await Promise.race([
    new Promise<void>((resolve) => server.once('exit', () => resolve())),
    new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        server.kill('SIGKILL');
        resolve();
      }, 3_000);
      timer.unref();
    }),
  ]);
  await rm(testRoot, { recursive: true, force: true });
}

async function availablePort(): Promise<number> {
  const listener = createServer();
  await new Promise<void>((resolve, reject) => {
    listener.once('error', reject);
    listener.listen(0, '127.0.0.1', resolve);
  });
  const address = listener.address();
  assert.ok(address && typeof address === 'object');
  const selectedPort = address.port;
  await new Promise<void>((resolve, reject) =>
    listener.close((error) => (error ? reject(error) : resolve())),
  );
  return selectedPort;
}

async function waitForServer(url: string): Promise<Response> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (server.exitCode !== null) {
      throw new Error(`packaged server exited with ${server.exitCode}`);
    }
    try {
      return await fetch(url);
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }
  throw new Error(`packaged server did not start at ${url}`);
}

async function statusWithHost(url: string, host: string): Promise<number> {
  const target = new URL(url);
  return new Promise<number>((resolve, reject) => {
    const call = request(
      {
        hostname: target.hostname,
        port: target.port,
        path: target.pathname,
        headers: { host },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode ?? 0);
      },
    );
    call.once('error', reject);
    call.end();
  });
}
