import { mkdtemp, rm } from 'node:fs/promises';
import { createRequire, findPackageJSON } from 'node:module';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Effect, Layer, Queue, Stream } from 'effect';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeD1SQLite } from '@kestack/std-toolkit/db/sqlite/d1';
import { RpcClient, RpcSerialization } from 'effect/rpc';
import { Socket } from 'effect/socket';
import { localTokenOf } from '@kestack/auth-toolkit/client/browser';
import {
  Miniflare,
  type Request as MiniflareRequest,
  Response as MiniflareResponse,
} from 'miniflare';
import {
  ConnectionIndex,
  connectionIndexTable,
} from '../../src/server/connection-index/index.ts';
import { ConsoleApi } from '../../src/shared/contracts/console-api/index.ts';
import { LOCAL_SESSION_COOKIE } from '../../src/shared/contracts/local-session/index.ts';

/*
 * The Console Worker as it deploys, running in workerd: built the way
 * Alchemy's `Website.Vite` builds it, with Alchemy's own Cloudflare plugin
 * and the app's `vite.config.ts`, in Local mode, then served by Miniflare
 * with the User Space namespace bound. Each visitor is a Local Account,
 * carried in Console's Local session cookie as a browser carries it.
 */

const root = fileURLToPath(new URL('../..', import.meta.url));
const fromAlchemy = createRequire(findPackageJSON('alchemy', import.meta.url)!);
const runtime = path.dirname(
  fromAlchemy.resolve('@alchemy.run/cloudflare-runtime/package.json'),
);
// The workerd Alchemy runs locally, rather than a newer test-only one.
process.env.MINIFLARE_WORKERD_PATH ??= createRequire(
  path.join(runtime, 'package.json'),
)('workerd').default;

const compatibility = {
  compatibilityDate: '2026-07-01',
  compatibilityFlags: ['nodejs_compat'],
};

/** Builds the app, as `alchemy deploy` does, into a folder of its own. */
const build = async () => {
  const out = await mkdtemp(path.join(tmpdir(), 'alchemy-console-'));
  const { default: cloudflare } = (await import(
    pathToFileURL(path.join(runtime, 'dist/vite/node/plugin.mjs')).href
  )) as { default: (options: object) => unknown };
  const vite = await import('vite');
  process.env.ALCHEMY_CLOUDFLARE_VITE_INJECTED = '1';
  const builder = await vite.createBuilder(
    {
      root,
      logLevel: 'warn',
      build: { outDir: out },
      // Local mode, as `alchemy.run.ts` makes it for a personal stage.
      define: { 'import.meta.env.VITE_CONSOLE_AUTH_URL': '""' },
      plugins: [cloudflare(compatibility) as never],
    },
    null,
  );
  await builder.buildApp();
  return out;
};

export interface Visitor {
  readonly id: string;
  readonly email: string;
  readonly name: string;
}

/** The cookie a Local mode browser signed in as `visitor` sends. */
export const cookieOf = (visitor: Visitor) =>
  `${LOCAL_SESSION_COOKIE}=${encodeURIComponent(localTokenOf({ ...visitor, image: null }))}`;

/** The Vault key the tests' Worker seals with. */
export const TEST_VAULT_KEY = Buffer.from(new Uint8Array(32).fill(7)).toString(
  'base64',
);

/** What the Worker's own `fetch` reaches, in place of the internet. */
export type Outbound = (request: Request) => Response | Promise<Response>;

const nowhere: Outbound = () => {
  throw new TypeError('The tests reach no network.');
};

/** The GitHub App the tests' Worker is: a fake one's ID, slug, key and webhook secret. */
export interface TestApp {
  readonly id: string;
  readonly slug: string;
  /** PEM, PKCS#1, as GitHub hands it out. */
  readonly privateKey: string;
  readonly webhookSecret: string;
}

export const startConsole = async (options: {
  readonly invites: string;
  readonly outbound?: Outbound;
  readonly app?: TestApp;
}) => {
  const out = await build();
  const server = path.join(out, 'ssr');
  // The User Spaces' SQLite, on disk, so a test can read what was stored.
  const persist = path.join(out, 'state');
  const outbound = options.outbound ?? nowhere;
  const mf = new Miniflare({
    ...compatibility,
    modules: true,
    scriptPath: path.join(server, 'index.js'),
    modulesRoot: server,
    durableObjects: { USER_SPACE: { className: 'UserSpace', useSQLite: true } },
    durableObjectsPersist: persist,
    d1Databases: ['CONSOLE_INDEX'],
    bindings: {
      CONSOLE_INVITES: options.invites,
      CONSOLE_VAULT_KEY: TEST_VAULT_KEY,
      ...(options.app
        ? {
            GH_APP_ID: options.app.id,
            GH_APP_SLUG: options.app.slug,
            GH_APP_PRIVATE_KEY: options.app.privateKey,
            GH_APP_WEBHOOK_SECRET: options.app.webhookSecret,
          }
        : {}),
    },
    outboundService: async (request: MiniflareRequest) => {
      const answer = await outbound(
        new Request(request.url, {
          method: request.method,
          headers: Object.fromEntries(request.headers),
          ...(request.method === 'GET' || request.method === 'HEAD'
            ? {}
            : { body: await request.text() }),
        }),
      );
      return new MiniflareResponse(await answer.text(), {
        status: answer.status,
        headers: Object.fromEntries(answer.headers),
      });
    },
  });
  const url = await mf.ready;
  // The connection index's table, as its deploy makes it.
  const binding = (await mf.getD1Database('CONSOLE_INDEX')) as never;
  await Effect.runPromise(
    SQLite.setup(connectionIndexTable, {
      database: makeD1SQLite({ database: binding }),
    }),
  );
  const connections = ConnectionIndex.make(binding);
  return {
    url: url.href,
    /** Where the User Spaces keep their SQLite files. */
    persist,
    /** A request to the Worker, from `visitor` when given; a redirect is answered, not followed. */
    fetch: (
      pathname: string,
      visitor?: Visitor,
      headers = {},
      init: { readonly method?: string; readonly body?: string } = {},
    ) =>
      mf.dispatchFetch(new URL(pathname, url), {
        ...init,
        redirect: 'manual',
        headers: {
          ...headers,
          ...(visitor ? { cookie: cookieOf(visitor) } : {}),
        },
      }),
    /** Who the connection index says owns `installationId`; null for no one. */
    indexOwner: (installationId: number) =>
      Effect.runPromise(connections.owner(installationId)),
    /** A Console API client over a socket opened as `visitor`, as a tab opens one. */
    socket: (visitor: Visitor) =>
      Effect.gen(function* () {
        // Open for as long as the caller's Scope.
        const socket = yield* Layer.build(
          RpcClient.layerProtocolSocket({ retryTransientErrors: false }).pipe(
            Layer.provide([
              Socket.layerWebSocket(
                new URL('/rpc', url).href.replace(/^http/, 'ws'),
              ).pipe(
                Layer.provide(
                  Layer.succeed(
                    Socket.WebSocketConstructor,
                    (address, protocols) =>
                      new globalThis.WebSocket(address, {
                        protocols,
                        headers: { cookie: cookieOf(visitor) },
                      } as never),
                  ),
                ),
              ),
              RpcSerialization.layerJson,
            ]),
          ),
        );
        return yield* RpcClient.make(ConsoleApi).pipe(
          Effect.provideContext(socket),
        );
      }),
    dispose: async () => {
      await mf.dispose();
      await rm(out, { recursive: true, force: true });
    },
  };
};

/** Every element `stream` gives, in order, as they come. */
export const collect = <A, E>(stream: Stream.Stream<A, E>) =>
  Effect.gen(function* () {
    const seen = yield* Queue.unbounded<A>();
    yield* Effect.forkScoped(
      Stream.runForEach(stream, (value) => Queue.offer(seen, value)),
    );
    return {
      /** The next one, within a second. */
      next: Queue.take(seen).pipe(Effect.timeout('1 second')),
      /** Whatever came within `wait`, without waiting for more. */
      within: (wait: `${number} millis`) =>
        Effect.sleep(wait).pipe(Effect.andThen(Queue.clear(seen))),
    };
  });
