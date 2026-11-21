import { builtinModules } from 'node:module';
import { fileURLToPath } from 'node:url';
import { rolldown, type Plugin } from 'vite/rolldown';
import { describe, expect, it } from 'vitest';

/*
 * `@kestack/connect/browser` and `@kestack/connect/fake` bundled as a
 * browser bundles them, from their source and every package they reach: not one import of a Node built-in,
 * nor of a package that only runs on Node, nor one the bundle could not
 * find. Each one found is named with the file that imports it. The real
 * engine's edges, `engine/node.ts`, bundled the same way, are caught.
 */

const at = (path: string) => fileURLToPath(new URL(path, import.meta.url));

const builtins = new Set([
  ...builtinModules,
  ...builtinModules.map((name) => `node:${name}`),
]);

/** Packages that only run on Node, though they import no built-in a bundler sees. */
const NODE_ONLY = [
  '@effect/platform-node',
  '@effect/platform-node-shared',
  'better-sqlite3',
  'cloudflared',
  'sherpa-onnx-node',
  'undici',
  'ws',
];

const nodeOnly = (source: string) =>
  source.startsWith('node:') ||
  builtins.has(source) ||
  NODE_ONLY.some((name) => source === name || source.startsWith(`${name}/`));

/** Every Node-only import, kept out of the bundle and named with its importer. */
const watched = (found: Array<string>): Plugin => ({
  name: 'node-only',
  resolveId: (source, importer) => {
    if (!nodeOnly(source)) return null;
    found.push(`${source} <- ${importer ?? 'the entry'}`);
    return { id: source, external: true };
  },
});

/** What `entry` reaches that a browser cannot load: Node-only imports, and imports never found. */
const nodeReached = async (entry: string) => {
  const found: Array<string> = [];
  const bundle = await rolldown({
    input: entry,
    platform: 'browser',
    resolve: { extensionAlias: { '.js': ['.ts', '.js'] } },
    plugins: [watched(found)],
    onLog: (_, log) => {
      if (log.code === 'UNRESOLVED_IMPORT') found.push(log.message);
    },
  });
  try {
    const { output } = await bundle.generate({ format: 'esm' });
    expect(output[0].moduleIds.length).toBeGreaterThan(100);
  } finally {
    await bundle.close();
  }
  return found;
};

describe('@kestack/connect/browser', () => {
  it('bundles for the browser without reaching Node', async () => {
    expect(await nodeReached(at('../index.ts'))).toEqual([]);
  }, 60_000);

  it('bundles the Computers fake, `./fake`, without reaching Node', async () => {
    expect(await nodeReached(at('../fake/index.ts'))).toEqual([]);
  }, 60_000);

  it("catches what reaches Node, as the real engine's edges do", async () => {
    expect(
      await nodeReached(at('../../connection/plugins/code/engine/node.ts')),
    ).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^node:child_process <- .*git\.ts$/),
      ]),
    );
  }, 60_000);
});
