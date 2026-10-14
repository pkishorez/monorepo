import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { isRunnableDevEnvironment } from 'vite';
import type { Plugin, ViteDevServer } from 'vite';
import type { Build } from '../page/index.ts';
import { serveWorker } from './dev.ts';
import type { Fetching } from './dev.ts';
import {
  BUILD,
  CLIENT,
  DOCUMENT,
  ENTRY,
  WORKER,
  buildModule,
  clientEntry,
  devScripts,
  documentModule,
  workerEntry,
} from './entries.ts';
import { findFiles } from './files.ts';
import type { FileOptions } from './files.ts';
import { filesOf } from './manifest.ts';
import type { Manifest } from './manifest.ts';
import { mentionsLazy, withIds } from './lazy.ts';
import { DEV_STYLES, serveStyles } from './styles.ts';

/*
 * Start's Vite plugin: the app writes its files, and the plugin writes the
 * rest.
 *
 * 1. Find      the app's files by name: `src/app`, and if they are there
 *              `src/document`, `src/loaders.server`, `src/layer.server` and
 *              `src/layer.client`.
 * 2. Write     the Worker's entry and the browser's as modules of its own,
 *              and set them as the `ssr` and `client` builds' inputs, so the
 *              Cloudflare plugin Alchemy injects takes the Worker's as `main`.
 * 3. Name      every `View.lazy(() => import('./x'))` with its module's id,
 *              the same on the server and in the browser.
 * 4. Build     the client first, then the Worker, which is handed the client's
 *              files and a build id that changes on every build.
 * 5. Dev       serve SSR from Vite's own server environment when nothing else
 *              runs the Worker, as under plain `vite dev`; under `alchemy dev`
 *              the Cloudflare plugin runs it in workerd. Either way the head
 *              links the app's styles, so a drawn page is never painted bare.
 */

/** Where Start finds the app's files, from the Vite root; each has a default. */
export type StartOptions = FileOptions;

/** A file the client build writes for the Worker to read, and which is never deployed. */
const MANIFEST = '.vite/kabuki-start.json';

/** What the client build hands the Worker's, kept on `globalThis`: Vite may make the plugin again for each build. */
const built = (): Map<string, Omit<Build, 'head'>> => {
  const key = Symbol.for('@kestack/kabuki/start/vite');
  const global = globalThis as { [key]?: Map<string, Omit<Build, 'head'>> };
  return (global[key] ??= new Map());
};

const resolved = (id: string) => `\0${id}`;

/** Start's Vite plugin. Put it beside the React plugin: `plugins: [react(), start()]`. */
export const start = (options: StartOptions = {}): Plugin => {
  let root = process.cwd();
  let base = '/';
  let server: ViteDevServer | undefined;
  // 1. Find
  const files = () => findFiles(root, options);

  const devBuild = async (): Promise<Build> => ({
    id: undefined,
    base,
    entry: {
      script: `${base}@id/__x00__${CLIENT}`,
      styles: [`${base}${DEV_STYLES}`],
      preloads: [],
    },
    views: null,
    head: server
      ? devScripts(
          await server.transformIndexHtml(
            '/',
            '<html><head></head><body></body></html>',
          ),
        )
      : [],
  });

  return {
    name: '@kestack/kabuki/start',
    enforce: 'pre',

    // 2. Write
    config: {
      order: 'pre',
      handler(config, { command }) {
        root = path.resolve(config.root ?? process.cwd());
        // A Worker's main module may export only its handlers, so the
        // server build is one file: its lazy imports are inlined.
        const input = (entry: Record<string, string>, inline = false) => {
          return 'rolldownVersion' in this.meta
            ? {
                rolldownOptions: {
                  input: entry,
                  ...(inline ? { output: { codeSplitting: false } } : {}),
                },
              }
            : {
                rollupOptions: {
                  input: entry,
                  ...(inline ? { output: { inlineDynamicImports: true } } : {}),
                },
              };
        };
        // Where the Cloudflare plugin puts them too: `dist/client` and `dist/ssr`.
        const outDir = (name: string) =>
          config.environments?.[name]?.build?.outDir ??
          path.join(config.build?.outDir ?? 'dist', name);
        const found = findFiles(root, options);
        return {
          appType: 'custom',
          // The browser's entry is the plugin's own, which Vite cannot scan:
          // scan the app's files, and what the entry imports, so the first
          // page in dev does not find new dependencies and reload.
          optimizeDeps: {
            entries: [found.app, found.document, found.clientLayer].filter(
              (file): file is string => file !== undefined,
            ),
            include: ['react-dom/client'],
          },
          environments: {
            client: {
              build: {
                manifest:
                  config.environments?.client?.build?.manifest ||
                  config.build?.manifest ||
                  MANIFEST,
                outDir: outDir('client'),
                ...input({ [ENTRY]: CLIENT }),
              },
            },
            ssr: {
              // A Worker runs alone: built, it carries every dependency, in
              // its edge form.
              ...(command === 'build'
                ? {
                    resolve: {
                      noExternal: true,
                      conditions: [
                        'workerd',
                        'worker',
                        'edge-light',
                        'module',
                        'browser',
                        'import',
                        'default',
                      ],
                    },
                  }
                : {}),
              build: {
                outDir: outDir('ssr'),
                ...input({ index: WORKER }, true),
              },
            },
          },
          // 4. Build
          ...(config.builder?.buildApp
            ? {}
            : {
                builder: {
                  buildApp: async (builder) => {
                    await builder.build(builder.environments.client!);
                    for (const environment of Object.values(
                      builder.environments,
                    ))
                      if (!environment.isBuilt)
                        await builder.build(environment);
                  },
                },
              }),
        };
      },
    },

    // 5. Dev: a Worker that finds its own dependencies, as workerd under the
    // Cloudflare plugin does, cannot scan the plugin's entry either: scan the
    // app's server files, and include what Start's own Worker imports, so
    // the first page does not find new dependencies and reload. Vite's own
    // server environment, in Node, finds none and is left as it is.
    configEnvironment(name, config) {
      if (name === 'client' || config.optimizeDeps?.noDiscovery !== false)
        return undefined;
      const found = files();
      return {
        optimizeDeps: {
          entries: [
            found.app,
            found.document,
            found.loaders,
            found.serverLayer,
          ].filter((file): file is string => file !== undefined),
          include: [
            'effect',
            'react',
            'react/jsx-runtime',
            'react/jsx-dev-runtime',
            'react-dom/server',
          ],
        },
      };
    },

    configResolved(config) {
      root = config.root;
      base = config.base;
    },

    resolveId(id) {
      if ([WORKER, CLIENT, DOCUMENT, BUILD].includes(id)) return resolved(id);
      return undefined;
    },

    async load(id) {
      if (id === resolved(WORKER)) return workerEntry(files());
      if (id === resolved(CLIENT))
        return clientEntry(
          files(),
          this.environment.config.command === 'serve'
            ? `${base}${DEV_STYLES}`
            : undefined,
        );
      if (id === resolved(DOCUMENT)) return documentModule(files());
      if (id === resolved(BUILD)) {
        if (this.environment.config.command === 'serve')
          return buildModule(await devBuild());
        const client = built().get(root);
        if (!client)
          this.error(
            'the client was not built before the Worker: build with `vite build`, which builds the client first',
          );
        return buildModule({ ...client, head: [] });
      }
      return undefined;
    },

    // 3. Name
    async transform(code, id) {
      if (
        this.environment.config.consumer === 'client' &&
        /\.server\.[cm]?[jt]sx?$/.test(id.split('?')[0]!)
      )
        this.error(
          `${path.relative(root, id)} runs on the server only, and something the browser loads imports it`,
        );
      if (id.includes('/node_modules/') || !mentionsLazy(code))
        return undefined;
      const named = await withIds(
        code,
        root,
        async (specifier) => (await this.resolve(specifier, id))?.id,
      );
      return named === undefined ? undefined : { code: named, map: null };
    },

    // 4. Build: the client's files, for the Worker; the manifest is not deployed.
    writeBundle: {
      order: 'post',
      handler(output) {
        if (this.environment.name !== 'client') return;
        const setting = this.environment.config.build.manifest;
        const name =
          typeof setting === 'string' ? setting : '.vite/manifest.json';
        const dir = output.dir ?? this.environment.config.build.outDir;
        const file = path.resolve(root, dir, name);
        const manifest = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
        built().set(root, {
          id: randomUUID(),
          base,
          ...filesOf(manifest, base),
        });
        if (name !== MANIFEST) return;
        rmSync(file);
        const folder = path.dirname(file);
        if (existsSync(folder) && readdirSync(folder).length === 0)
          rmSync(folder, { recursive: true });
      },
    },

    // 5. Dev
    configureServer(dev) {
      server = dev;
      dev.middlewares.use(
        serveStyles(dev, () => {
          const found = files();
          return [found.app, found.document].filter(
            (file): file is string => file !== undefined,
          );
        }),
      );
      return () => {
        const ssr = dev.environments.ssr;
        if (!ssr || !isRunnableDevEnvironment(ssr)) return;
        dev.middlewares.use(
          serveWorker(
            async () =>
              (
                (await ssr.runner.import(WORKER)) as {
                  readonly default: Fetching;
                }
              ).default,
            (error) => ssr.config.logger.error(error.stack ?? error.message),
          ),
        );
      };
    },
  };
};
