// No cloud credentials or network operations: the fixture supplies a scoped mock HTTP client.
import assert from 'node:assert/strict';
import { builtinModules, createRequire, findPackageJSON } from 'node:module';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { Miniflare } from 'miniflare';

// Match the binary Alchemy uses for local development, rather than a newer test-only one.
const runtimeRequire = createRequire(
  findPackageJSON(
    '@alchemy.run/cloudflare-runtime',
    import.meta.resolve('alchemy'),
  ),
);
process.env.MINIFLARE_WORKERD_PATH ??= runtimeRequire('workerd').default;

const directory = await mkdtemp(join(tmpdir(), 'alchemy-worker-test-'));
let runtime;
try {
  const bundle = join(directory, 'worker.js');
  await build({
    entryPoints: [
      fileURLToPath(
        new URL('./fixtures/worker-destruction.ts', import.meta.url),
      ),
    ],
    outfile: bundle,
    bundle: true,
    platform: 'node',
    conditions: ['worker'],
    format: 'esm',
    external: ['cloudflare:*', '@effect/platform-bun/*'],
    // esbuild leaves CommonJS requires for Node builtins; use Workers' supported loader.
    banner: {
      js: "import { createRequire as testCreateRequire } from 'node:module'; const require = testCreateRequire('/bundle/worker.js');",
    },
    plugins: [
      {
        name: 'node-builtins',
        setup(builder) {
          builder.onResolve(
            { filter: /^(node:)?[a-z_]+(\/[a-z_]+)?$/ },
            (args) =>
              builtinModules.includes(args.path) ||
              args.path.startsWith('node:')
                ? {
                    path: args.path.startsWith('node:')
                      ? args.path
                      : `node:${args.path}`,
                    external: true,
                  }
                : undefined,
          );
        },
      },
    ],
  });
  runtime = new Miniflare({
    rootPath: directory,
    modulesRoot: directory,
    modules: [
      {
        type: 'ESModule',
        path: bundle,
        contents: await readFile(bundle, 'utf8'),
      },
    ],
    compatibilityDate: '2026-07-01',
    compatibilityFlags: ['nodejs_compat'],
  });
  const responses = await Promise.all(
    ['a', 'b'].map((variant) =>
      runtime.dispatchFetch(`http://localhost/?variant=${variant}`),
    ),
  );
  for (const response of responses) {
    assert.equal(response.status, 200);
    const result = await response.json();
    assert.equal(result.plan.resources.length, 2);
    assert.deepEqual(result.plan.resources[0].after, ['Worker']);
    assert.equal(result.result, null);
    assert.equal(result.deleted, true);
    assert.deepEqual(result.remaining, []);
    assert.deepEqual(
      result.events.map((event) => event.status),
      ['deleting', 'deleted', 'deleting', 'deleted', 'complete'],
    );
    const deletions = result.calls.filter((call) => call.startsWith('DELETE'));
    assert.equal(deletions.length, 2);
    assert.match(deletions[0], /workers\/scripts\/fake-worker$/);
    assert.match(deletions[1], /d1\/database\/fake-db$/);
  }
  console.log(
    'Passed: native Alchemy preview, concurrent credential isolation, dependency order, streamed events and HTTP state cleanup inside workerd.',
  );
} finally {
  await runtime?.dispose();
  await rm(directory, { recursive: true, force: true });
}
