import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { createBuilder } from 'vite';
import { afterAll, describe, expect, it } from 'vitest';
import type { WorkerBuildInfo } from '../domain/config/index.js';
import type { PwaOptions } from '../domain/config/index.js';
import { pwa } from './index.js';

const root = fileURLToPath(new URL('./fixture', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'pwa-toolkit-vite-'));
afterAll(() => rm(temp, { recursive: true, force: true }));

const manifest = {
  name: 'Fixture',
  theme_color: '#123456',
  icons: [{ src: '/icon-192.png', sizes: '192x192', type: 'image/png' }],
} as const;

const buildFixture = async (
  name: string,
  options: PwaOptions,
  withServer = false,
) => {
  const outDir = join(temp, name);
  const server = withServer
    ? {
        builder: {},
        environments: {
          ssr: {
            build: {
              ssr: 'src/server.js',
              outDir: join(temp, `${name}-server`),
            },
          },
        },
      }
    : {};
  const builder = await createBuilder({
    configFile: false,
    root,
    logLevel: 'silent',
    cacheDir: join(temp, `${name}-cache`),
    resolve: {
      alias: {
        'pwa-toolkit/worker': join(root, 'src/fake-worker.js'),
      },
    },
    build: { outDir, assetsInlineLimit: 0, sourcemap: true },
    plugins: [pwa(options)],
    ...server,
  });
  await builder.buildApp();
  const read = (path: string) => readFile(join(outDir, path), 'utf8');
  const runWorker = async () => {
    const self: Record<string, unknown> = {};
    runInNewContext(await read('sw.js'), { self });
    return self;
  };
  return { read, runWorker };
};

describe('pwa() build', () => {
  it('writes the worker, manifest, headers and Precache', async () => {
    const out = await buildFixture('app', { manifest, worker: 'src/sw.js' });
    const info = (await out.runWorker())['__PWA_INFO__'] as WorkerBuildInfo;

    const urls = info.precache.map((entry) => entry.url).sort();
    const assets = urls.filter((url) => url.startsWith('/assets/'));
    expect(assets).toHaveLength(3);
    expect(assets).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^\/assets\/font-.*\.woff2$/),
        expect.stringMatching(/^\/assets\/index-.*\.css$/),
        expect.stringMatching(/^\/assets\/index-.*\.js$/),
      ]),
    );
    expect(urls.filter((url) => !url.startsWith('/assets/'))).toEqual([
      '/_shell',
      '/icon-192.png',
      '/offline',
    ]);
    expect(info.buildId).toMatch(/^[0-9a-f]{16}$/);
    expect(info.config.navigation.shellPath).toBe('/_shell');

    expect(JSON.parse(await out.read('manifest.webmanifest'))).toMatchObject({
      name: 'Fixture',
      start_url: '/',
      display: 'standalone',
    });

    const headers = await out.read('_headers');
    expect(headers).toContain('/assets/*\n  Cache-Control: public');
    expect(headers).toContain('/sw.js\n  Cache-Control: no-cache');
    expect(headers).toContain(
      '/manifest.webmanifest\n  Cache-Control: no-cache',
    );

    const main = await out.read(
      urls.find((url) => url.endsWith('.js'))?.slice(1) ?? '',
    );
    expect(main).toContain('manifestUrl:`/manifest.webmanifest`');
    expect(main).toContain('buildId:null');
  });

  it('gives the same Build ID to the same build', async () => {
    const a = await buildFixture('same-a', { worker: 'src/sw.js' });
    const b = await buildFixture('same-b', { worker: 'src/sw.js' });
    const id = async (out: typeof a) =>
      ((await out.runWorker())['__PWA_INFO__'] as WorkerBuildInfo).buildId;
    expect(await id(a)).toBe(await id(b));
  });

  it('hands the Build ID to the server environment', async () => {
    const out = await buildFixture('ssr', { worker: 'src/sw.js' }, true);
    const { buildId } = (await out.runWorker())[
      '__PWA_INFO__'
    ] as WorkerBuildInfo;
    const serverEntry = await readFile(
      join(temp, 'ssr-server', 'server.js'),
      'utf8',
    );
    expect(serverEntry).toContain(buildId);
  });

  it('bundles the built-in entry when the app has no src/sw.ts', async () => {
    const out = await buildFixture('default', {});
    expect((await out.runWorker())['__PWA_DEFAULT_ENTRY__']).toBe(true);
  });

  it('ships the Kill Switch when disabled', async () => {
    const out = await buildFixture('kill', { enabled: false, manifest });
    const script = await out.read('sw.js');
    expect(script).toContain('pwa-toolkit Kill Switch');
    expect(script).toContain('"pwa-toolkit:"');
    expect(await out.read('_headers')).toContain(
      '/sw.js\n  Cache-Control: no-cache',
    );
  });
});
