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
      '/flow': 'Flow Tool.',
      '/monoverse': 'Monoverse Tool.',
      '/laymos': 'Laymos Tool.',
      '/rpc': 'Typed RPC endpoint.',
      '/v1/traces': 'OTLP/HTTP Trace ingestion.',
      '/v1/logs': 'OTLP/HTTP Log Record ingestion.',
    },
  });

  for (const route of [
    '/',
    '/lotel',
    '/flow',
    '/monoverse',
    '/laymos',
    '/not-found',
  ]) {
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

  const skills = await runClient(['skills', '--format', 'json']);
  assert.deepEqual(
    JSON.parse(skills).map((skill: { name: string }) => skill.name),
    ['devtools'],
  );
  const skill = await runClient(['skills', 'devtools']);
  assert.match(skill, /^---\nname: devtools\n/);
  await runClient([
    'skills',
    'devtools',
    '--install',
    path.join(testRoot, 'skills'),
  ]);
  assert.match(
    await readFile(
      path.join(testRoot, 'skills', 'devtools', 'SKILL.md'),
      'utf8',
    ),
    /^---\nname: devtools\n/,
  );
  const traces = await runClient(['list-traces', '--url', origin]);
  assert.deepEqual(JSON.parse(traces), { items: [] });

  await smokeSnapshot();

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

// Draws this package against HEAD. A machine without any Chromium skips the
// capture with a note instead of failing, since the browser is not ours.
async function smokeSnapshot() {
  const out = path.join(testRoot, 'snapshot.png');
  const args = ['snapshot', '--project', '.', '--base', 'HEAD', '--out', out];
  const result = await runClientResult(args);
  if (result.code !== 0) {
    if (/No Chromium could be started/.test(result.stderr)) {
      console.log('snapshot smoke skipped: no Chromium on this machine');
      return;
    }
    throw new Error(`devtools ${args.join(' ')} failed: ${result.stderr}`);
  }
  const summary = JSON.parse(result.stdout) as {
    scale: number;
    drawn: string;
    images: Array<{ width: number; height: number }>;
  };
  // A dirty working tree draws the changed Modules; a clean one draws all.
  assert.ok(summary.drawn === 'all' || summary.drawn === 'changed');
  const [image] = summary.images;
  assert.ok(image !== undefined);
  assert.ok(image.width >= 480 && image.height >= 240);
  const png = await readFile(out);
  assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
  assert.equal(png.readUInt32BE(16), image.width * summary.scale);
  assert.equal(png.readUInt32BE(20), image.height * summary.scale);
}

async function runClient(args: string[]): Promise<string> {
  const result = await runClientResult(args);
  if (result.code !== 0) {
    throw new Error(`devtools ${args.join(' ')} exited with ${result.code}`);
  }
  return result.stdout;
}

async function runClientResult(
  args: string[],
): Promise<{ code: number; stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['dist/server/main.mjs', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString();
      process.stderr.write(chunk);
    });
    child.once('error', reject);
    child.once('exit', (code) => resolve({ code: code ?? 1, stdout, stderr }));
  });
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
