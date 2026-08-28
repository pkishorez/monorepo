import { createServer } from 'node:http';
import { stat } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { Effect, Layer } from 'effect';
import { HttpRouter } from 'effect/unstable/http';
import { RpcSerialization, RpcServer } from 'effect/unstable/rpc';
import { NodeHttpServer, NodeServices } from '@effect/platform-node';
import { LotelOtlpHttpLive, LotelRpcLive } from '@pkishorez/lotel';
import { sqliteTelemetryStoreLayer } from '@pkishorez/lotel/sqlite';
import { DevtoolsRpc } from '../../rpc/index.js';
import { DevtoolsHandlersLive } from '../handlers.js';
import { makeBrowserApplicationLive } from './browser-application.js';
import { makeRequestAccessLive } from './request-access.js';

const HOST = '127.0.0.1';
// This module is bundled into dist/server/main.mjs; the UI is its sibling.
const DEFAULT_UI_ROOT = fileURLToPath(new URL('../ui/', import.meta.url));

type Options = {
  readonly port: number;
  readonly db: string;
  readonly version: string;
  readonly uiRoot?: string;
  readonly skipUiCheck?: boolean;
};

/** Builds the one loopback server that hosts DevTools and both Tools. */
export function makeLocalDevtoolsServer(options: Options) {
  const uiRoot = options.uiRoot ?? DEFAULT_UI_ROOT;
  const canonicalOrigin = `http://${HOST}:${options.port}`;

  return Layer.unwrap(
    Effect.gen(function* () {
      if (options.skipUiCheck !== true) {
        yield* assertBrowserApplication(uiRoot);
      }

      return HttpRouter.serve(
        Layer.mergeAll(
          makeRpcRouteLive(),
          LotelOtlpHttpLive,
          makeBrowserApplicationLive({ uiRoot, version: options.version }),
          makeRequestAccessLive({ port: options.port, canonicalOrigin }),
        ),
      ).pipe(
        Layer.provide(sqliteTelemetryStoreLayer({ path: options.db })),
        Layer.provide(
          NodeHttpServer.layer(createServer, {
            host: HOST,
            port: options.port,
          }),
        ),
        Layer.provide(NodeServices.layer),
      );
    }),
  );
}

function makeRpcRouteLive() {
  return RpcServer.layerHttp({
    group: DevtoolsRpc,
    path: '/rpc',
    protocol: 'http',
  }).pipe(
    Layer.provide(Layer.merge(DevtoolsHandlersLive, LotelRpcLive)),
    Layer.provide(RpcSerialization.layerNdjson),
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
