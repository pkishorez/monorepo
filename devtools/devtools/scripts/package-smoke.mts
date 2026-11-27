import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
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
    'dist/cli/main.mjs',
    '--port',
    String(port),
    '--db',
    path.join(testRoot, 'devtools.sqlite'),
  ],
  { stdio: 'ignore' },
);

try {
  const health = await waitForServer(`${origin}/health`);
  assert.equal(health.status, 200);
  const { endpoints, ...about } = (await health.json()) as {
    name: string;
    version: string;
    endpoints: Record<string, string>;
  };
  assert.deepEqual(about, { name: 'devtools', version });
  assert.deepEqual(
    {
      '/': endpoints['/'],
      '/lotel': endpoints['/lotel'],
      '/monoverse': endpoints['/monoverse'],
      '/kabuki': endpoints['/kabuki'],
    },
    {
      '/': 'DevTools browser application.',
      '/lotel': 'Lotel Tool.',
      '/monoverse': 'Monoverse Tool: ?project= opens a Project.',
      '/kabuki': 'Kabuki Tool: the live Kabuki Sessions, ?session= opens one.',
    },
  );
  for (const endpoint of [
    '/rpc/lotel',
    '/v1/traces',
    '/v1/logs',
    '/rpc/monoverse',
    '/kabuki/connect',
    '/kabuki/sessions',
    '/kabuki/session/:name',
    '/rpc/agent',
  ]) {
    assert.equal(
      typeof endpoints[endpoint],
      'string',
      `/health lists ${endpoint}`,
    );
  }

  for (const route of ['/', '/lotel', '/monoverse', '/kabuki', '/not-found']) {
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
  assert.equal(
    (
      await fetch(`${origin}/health`, {
        headers: { origin: `http://localhost:${port}` },
      })
    ).status,
    200,
  );
  assert.notEqual(
    (
      await fetch(`${origin}/kabuki/sessions`, {
        headers: { origin: `http://localhost:${port}` },
      })
    ).status,
    403,
  );

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

  assert.equal(
    (
      await fetch(`${origin}/kabuki/sessions`, {
        headers: { origin: 'http://example.test' },
      })
    ).status,
    403,
  );
  const dialing = await fetch(`${origin}/kabuki/connect`, {
    method: 'OPTIONS',
    headers: {
      origin: 'http://example.test',
      'access-control-request-private-network': 'true',
    },
  });
  assert.equal(dialing.status, 204);
  assert.equal(
    dialing.headers.get('access-control-allow-private-network'),
    'true',
  );
  const project = path.join(testRoot, 'project');
  for (const [file, text] of Object.entries({
    'package.json': '{"name":"smoke"}',
    'monoverse.json': '{"sourceRoots":["src"],"preset":"default"}',
    'src/a/b.ts': 'export const b = 1;',
    'src/a/index.ts': "export * from './b.ts';",
    'src/main.ts': "import { b } from './a/b.ts';",
  })) {
    await mkdir(path.dirname(path.join(project, file)), { recursive: true });
    await writeFile(path.join(project, file), text);
  }
  const read = await fetch(`${origin}/rpc/monoverse`, {
    method: 'POST',
    headers: { 'content-type': 'application/ndjson' },
    body: `${JSON.stringify({
      _tag: 'Request',
      id: '1',
      tag: 'ReadPackage',
      payload: { root: project, branch: null, path: '.' },
      headers: [],
    })}\n`,
  });
  const [answer] = (await read.text())
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { exit?: unknown });
  assert.deepEqual(
    (
      answer?.exit as {
        value?: { check?: { violations?: Array<{ reason: string }> } };
      }
    )?.value?.check?.violations?.map(({ reason }) => reason),
    ['inside'],
    'the packaged engine worker checks a Package',
  );

  const missing = path.join(testRoot, 'missing');
  const thread = await answerOf<string>('/rpc/agent', 'ask', {
    folder: missing,
    kind: 'smoke',
    prompt: 'What is here?',
  });
  const threads = await answerOf<
    Array<{ id: string; title: string; status: string }>
  >('/rpc/agent', 'threads', { folder: missing, kind: 'smoke' });
  assert.deepEqual(
    threads.map(({ id, title, status }) => ({ id, title, status })),
    [{ id: thread, title: 'What is here?', status: 'failed' }],
    'the packaged Agent keeps a Thread whose folder is missing, failed',
  );
  assert.equal(
    await answerOf<number>('/rpc/agent', 'clear', {
      folder: missing,
      kind: 'smoke',
    }),
    1,
    'the packaged Agent clears the Threads of a kind in a folder',
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

async function answerOf<A>(
  route: string,
  tag: string,
  payload: unknown,
): Promise<A> {
  const response = await fetch(`${origin}${route}`, {
    method: 'POST',
    headers: { 'content-type': 'application/ndjson' },
    body: `${JSON.stringify({ _tag: 'Request', id: '1', tag, payload, headers: [] })}\n`,
  });
  const [answer] = (await response.text())
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line) as { exit?: { value?: A } });
  assert.ok(answer?.exit?.value !== undefined, `${route} answers ${tag}`);
  return answer.exit.value;
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
