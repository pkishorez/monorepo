import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/http';
import { NodeHttpServer, NodeServices } from '@effect/platform-node';
import {
  kabukiEndpoints,
  kabukiServer,
} from '../../app/kabuki/server/index.js';
import { lotelEndpoints, lotelServer } from '../../app/lotel/server/index.js';
import {
  monoverseEndpoints,
  monoverseServer,
} from '../../app/monoverse/server/index.js';
import { makeBrowserApplicationLive } from './browser-application.js';
import { makeRequestAccessLive } from './request-access.js';

const HOST = '127.0.0.1';
// This module is bundled into dist/cli/main.mjs; the UI is its sibling.
const DEFAULT_UI_ROOT = fileURLToPath(new URL('../ui/', import.meta.url));

type Options = {
  readonly port: number;
  readonly db: string;
  readonly version: string;
  readonly uiRoot?: string;
  readonly skipUiCheck?: boolean;
};

/**
 * Builds the one loopback server that hosts DevTools: each Tool's routes,
 * from its server door, the bundled app around them, and who may reach it.
 */
export function makeDevtoolsServer(options: Options) {
  const uiRoot = options.uiRoot ?? DEFAULT_UI_ROOT;
  // DevTools' own page, opened at either loopback host.
  const ownOrigins = [
    `http://${HOST}:${options.port}`,
    `http://localhost:${options.port}`,
  ];

  return Layer.unwrap(
    Effect.gen(function* () {
      if (options.skipUiCheck !== true) {
        yield* assertBrowserApplication(uiRoot);
      }

      return HttpRouter.serve(
        Layer.mergeAll(
          // Lotel and Monoverse keep separate tables in the one DevTools
          // database.
          lotelServer({ db: options.db }),
          monoverseServer({ db: options.db }),
          kabukiServer({ origins: ownOrigins }),
          makeBrowserApplicationLive({
            uiRoot,
            version: options.version,
            endpoints: {
              ...lotelEndpoints,
              ...monoverseEndpoints,
              ...kabukiEndpoints,
            },
          }),
          makeRequestAccessLive({ port: options.port, ownOrigins }),
        ),
      ).pipe(
        Layer.provide(
          NodeHttpServer.layer(createServer, {
            host: HOST,
            port: options.port,
            // A Kabuki Session's socket stays open as long as its app runs,
            // so waiting for open requests to drain would hold every stop.
            disablePreemptiveShutdown: true,
          }),
        ),
        Layer.provide(NodeServices.layer),
      );
    }),
  );
}

const assertBrowserApplication = Effect.fn('assertBrowserApplication')(
  function* (uiRoot: string) {
    const indexPath = path.join(uiRoot, 'index.html');
    const info = yield* Effect.tryPromise({
      try: () => stat(indexPath),
      catch: () =>
        new Error(
          `DevTools UI is missing at ${indexPath}. Reinstall the package or run its full build.`,
        ),
    });
    if (!info.isFile()) {
      return yield* Effect.fail(
        new Error(`DevTools UI entry is not a file: ${indexPath}`),
      );
    }
  },
);
