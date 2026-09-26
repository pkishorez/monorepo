import type { Plugin } from 'vite';
import { BuildId, MANIFEST_URL } from '../domain/build/index.js';
import {
  type ResolvedPwaConfig,
  workerConfigOf,
} from '../domain/config/index.js';
import { withManifestDefaults } from '../domain/manifest/index.js';
import { workerScript } from './worker-bundle/index.js';

/**
 * Dev server: serves the manifest, and, only with `dev: true`, a worker
 * built with Build ID `dev` and an empty Precache (so everything goes to the
 * network). Without `dev: true` the worker URL falls through to the app and
 * the tab does not register. Rebuilt after any file change.
 */
export const devPlugin = (config: ResolvedPwaConfig): Plugin => ({
  name: 'pwa-toolkit:dev',
  apply: 'serve',
  configureServer(server) {
    let script: Promise<string> | null = null;
    const build = () =>
      workerScript(
        config.enabled
          ? {
              killSwitch: false,
              info: {
                buildId: BuildId.make('dev'),
                precache: [],
                config: workerConfigOf(config),
              },
              root: server.config.root,
              worker: config.worker,
              mode: server.config.mode,
              alias: server.config.resolve.alias,
              minify: false,
            }
          : { killSwitch: true },
      );
    server.watcher.on('all', () => {
      script = null;
    });
    const manifest = config.manifest
      ? JSON.stringify(withManifestDefaults(config.manifest), null, 2)
      : null;

    server.middlewares.use((req, res, next) => {
      const path = (req.url ?? '').split('?')[0];
      if (manifest !== null && path === MANIFEST_URL) {
        res.setHeader('Content-Type', 'application/manifest+json');
        res.setHeader('Cache-Control', 'no-cache');
        res.end(manifest);
        return;
      }
      if (!config.dev || path !== config.swUrl) {
        next();
        return;
      }
      script ??= build();
      script.then(
        (code) => {
          res.setHeader('Content-Type', 'text/javascript');
          res.setHeader('Cache-Control', 'no-cache');
          res.end(code);
        },
        (error: unknown) => {
          script = null;
          next(error);
        },
      );
    });
  },
});
