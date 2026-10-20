import { mkdtemp, rm } from 'node:fs/promises';
import { createServer } from 'node:net';
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
  readonly clientId: string;
  readonly clientSecret: string;
}

/** The variables a run's container is started with. */
export type ContainerVariables = Readonly<Record<string, string>>;

/**
 * Where the tests' Worker starts and stops run containers, in place of
 * Cloudflare's: the variables each container would get, and its run's ID.
 */
export interface Containers {
  readonly start: (variables: ContainerVariables) => void | Promise<void>;
  readonly stop: (runId: string) => void | Promise<void>;
}

/**
 * Stands in for `RunnerContainer`: the same `start` and `stop` the User
 * Space calls, handed to the test (`Containers`) instead of a container.
 */
const FAKE_CONTAINER = `
import { DurableObject } from 'cloudflare:workers';
export class RunnerContainer extends DurableObject {
  async start(variables) {
    await fetch('http://containers/start', { method: 'POST', body: JSON.stringify(variables) });
  }
  async stop() {
    await fetch('http://containers/stop', { method: 'POST', body: this.ctx.id.name ?? '' });
  }
}
export default { fetch: () => new Response('not here', { status: 404 }) };
`;

/** A free port on this machine. */
const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const probe = createServer();
    probe.once('error', reject);
    probe.listen(0, () => {
      const { port } = probe.address() as { port: number };
      probe.close(() => resolve(port));
    });
  });

export const startConsole = async (options: {
  readonly invites: string;
  readonly outbound?: Outbound;
  readonly app?: TestApp;
  /** Where run containers start; none bound when absent. */
  readonly containers?: Containers;
  /** How long a runner may go unheard before its run is Lost. */
  readonly silenceMs?: number;
  /** Listen on every interface, so a local container can call back. */
  readonly listenEverywhere?: boolean;
}) => {
  const out = await build();
  const server = path.join(out, 'ssr');
  // The User Spaces' SQLite, on disk, so a test can read what was stored.
  const persist = path.join(out, 'state');
  const outbound = options.outbound ?? nowhere;
  const port = await freePort();
  const containers = options.containers;
  const mf = new Miniflare({
    host: options.listenEverywhere ? '0.0.0.0' : '127.0.0.1',
    port,
    durableObjectsPersist: persist,
    workers: [
      {
        name: 'console',
        ...compatibility,
        modules: true,
        scriptPath: path.join(server, 'index.js'),
        modulesRoot: server,
        durableObjects: {
          USER_SPACE: { className: 'UserSpace', useSQLite: true },
          ...(containers
            ? {
                RUNNER: {
                  className: 'RunnerContainer',
                  scriptName: 'containers',
                  useSQLite: true,
                },
              }
            : {}),
        },
        d1Databases: ['CONSOLE_INDEX'],
        bindings: {
          CONSOLE_INVITES: options.invites,
          CONSOLE_VAULT_KEY: TEST_VAULT_KEY,
          CONSOLE_URL: `http://127.0.0.1:${port}`,
          ...(options.silenceMs
            ? { CONSOLE_RUN_SILENCE_MS: String(options.silenceMs) }
            : {}),
          ...(options.app
            ? {
                GH_APP_ID: options.app.id,
                GH_APP_SLUG: options.app.slug,
                GH_APP_PRIVATE_KEY: options.app.privateKey,
                GH_APP_WEBHOOK_SECRET: options.app.webhookSecret,
                GH_APP_CLIENT_ID: options.app.clientId,
                GH_APP_CLIENT_SECRET: options.app.clientSecret,
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
      },
      {
        name: 'containers',
        ...compatibility,
        modules: true,
        script: FAKE_CONTAINER,
        durableObjects: {
          RUNNER: { className: 'RunnerContainer', useSQLite: true },
        },
        outboundService: async (request: MiniflareRequest) => {
          const body = await request.text();
          if (new URL(request.url).pathname === '/start')
            await containers?.start(JSON.parse(body));
          else await containers?.stop(body);
          return new MiniflareResponse('ok');
        },
      },
    ],
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
    /** What `CONSOLE_URL` is bound to: where a runner calls back. */
    consoleUrl: `http://127.0.0.1:${port}`,
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
