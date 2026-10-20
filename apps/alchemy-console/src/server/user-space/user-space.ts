import type * as cf from '@cloudflare/workers-types';
import { DurableObject } from 'cloudflare:workers';
import { Clock, Context, Effect, Layer, Scope } from 'effect';
import {
  FetchHttpClient,
  HttpBody,
  HttpServerRequest,
  HttpServerResponse,
} from 'effect/http';
import type { RpcClient } from 'effect/rpc';
import { authAs } from '@kestack/auth-toolkit/server/rpc';
import { Rpc } from '@kestack/rpc-toolkit/rpc';
import { ConsoleApi } from '../../shared/contracts/console-api/index.ts';
import { RunnerApi } from '../../shared/contracts/runner-api/index.ts';
import type { RunnerContainer } from '../runner-container/index.ts';
import {
  type Caller,
  opened,
  principalAt,
  senderOf,
  sentBy,
  SocketCaller,
} from './caller.ts';
import { makeDeadlines } from './deadlines.ts';
import { sessionBound } from './session-bound.ts';
import { socketOf } from './socket.ts';
import { ConnectionIndex } from '../connection-index/index.ts';
import { GitHub } from './services/github/index.ts';
import { Providers } from './services/providers/index.ts';
import { RunnerHost } from './services/runner-host/index.ts';
import { Storage } from './services/storage/index.ts';
import { Vault } from './services/vault/index.ts';
import {
  authorize,
  type AuthorizeInput,
  connect,
  connectionsHandlers,
  type ConnectInput,
  type ConnectOutcome,
  type ConnectStep,
} from './workflows/connections/index.ts';
import { credentialsHandlers } from './workflows/credentials/index.ts';
import { type Delivery, receive } from './workflows/github-events/index.ts';
import { repositoriesHandlers } from './workflows/repositories/index.ts';
import {
  RunLifecycle,
  RunnerCaller,
  runnerHandlers,
  runnerOf,
  runsHandlers,
  sentByRunner,
  SILENCE_LIMIT_MS,
  TIMEOUT_MS,
} from './workflows/run-lifecycle/index.ts';
import { sessionHandlers } from './workflows/session/index.ts';

/*
 * The User Space: one Durable Object per user, holding that user's records
 * and serving their Console API (ADR 0004). This file is its composition
 * root: it builds the services once per object, gives them to every
 * workflow, and serves the workflows' handlers to the user's tabs over
 * hibernating WebSockets and to the Worker's Loaders over HTTP.
 *
 * Registering more:
 * - a service is a nested module under `services/<name>/`, built in
 *   `services` below, which every workflow can then require;
 * - a workflow is a nested module under `workflows/<name>/` exporting its
 *   handlers as an Effect (see `workflows/session`), spread into `handlers`
 *   below, beside a group merged into `ConsoleApi`.
 *
 * The Worker also calls it directly, never on a browser's behalf, through
 * the object's own methods: `connectGitHub` and `authorizeGitHub` with
 * GitHub's returns from an install and from asking who the member is
 * (`reach(...)`), and `receiveGitHub` with a webhook
 * delivery for an installation the user owns (`owning(...).receive`).
 *
 * A run's runner has a socket of its own, at `/runner`, which the Worker
 * opens only for a valid run token (`runner(...)`): it is served the
 * RunnerApi, not the Console API, and is told apart from the tabs' sockets
 * by its tag, so neither server ever sees the other's sockets.
 */

/** What the object reads from the Worker's env. */
interface UserSpaceEnv {
  /** The key the Vault seals secrets with: 32 bytes, in base64. */
  readonly CONSOLE_VAULT_KEY?: string;
  /** The GitHub App's ID, slug and private key (PEM). */
  readonly GH_APP_ID?: string;
  readonly GH_APP_SLUG?: string;
  readonly GH_APP_PRIVATE_KEY?: string;
  /** The App's OAuth client, for asking GitHub which installations a member reaches. */
  readonly GH_APP_CLIENT_ID?: string;
  readonly GH_APP_CLIENT_SECRET?: string;
  /** The connection index's D1 database. */
  readonly CONSOLE_INDEX: D1Database;
  /** One container per run, by run ID; unbound where runs can't run. */
  readonly RUNNER?: DurableObjectNamespace<RunnerContainer>;
  /** Where a run's runner reaches Console: this stage's own URL. */
  readonly CONSOLE_URL?: string;
  /** How long a runner may go unheard before its run is Lost; tests shorten it. */
  readonly CONSOLE_RUN_SILENCE_MS?: string;
}

/** The tag a runner's socket is accepted with. */
const RUNNER_TAG = 'runner';

/** Every service, built once for the life of the object. */
const services = (state: cf.DurableObjectState, env: UserSpaceEnv) =>
  RunLifecycle.layer({
    silenceLimitMs: Number(env.CONSOLE_RUN_SILENCE_MS) || SILENCE_LIMIT_MS,
    timeoutMs: TIMEOUT_MS,
    alarm: state.storage,
  }).pipe(Layer.provideMerge(baseServices(state, env)));

const baseServices = (state: cf.DurableObjectState, env: UserSpaceEnv) =>
  Layer.mergeAll(
    Storage.layer(state.storage),
    Vault.layer(env.CONSOLE_VAULT_KEY),
    Providers.layer((input, init) => fetch(input, init)),
    GitHub.layer(
      {
        appId: env.GH_APP_ID ?? '',
        slug: env.GH_APP_SLUG ?? '',
        privateKey: env.GH_APP_PRIVATE_KEY ?? '',
        clientId: env.GH_APP_CLIENT_ID ?? '',
        clientSecret: env.GH_APP_CLIENT_SECRET ?? '',
      },
      (input, init) => fetch(input, init),
    ),
    ConnectionIndex.layer(env.CONSOLE_INDEX),
    RunnerHost.layer({
      // Every User Space is reached by its owner's ID (`reach`).
      userId: state.id.name,
      namespace: env.RUNNER,
      consoleUrl: env.CONSOLE_URL,
      vaultKey: env.CONSOLE_VAULT_KEY,
    }),
  );

/** Every workflow's handlers, served as one `ConsoleApi`, each stream ending with its caller's session. */
const handlers = (deadlines: ReturnType<typeof makeDeadlines>) =>
  ConsoleApi.toLayer(
    Effect.gen(function* () {
      return sessionBound(
        {
          ...(yield* sessionHandlers),
          ...(yield* credentialsHandlers),
          ...(yield* connectionsHandlers),
          ...(yield* repositoriesHandlers),
          ...(yield* runsHandlers),
        },
        deadlines,
      );
    }),
  );

const unauthorized = HttpServerResponse.text('Unauthorized', { status: 401 });

/**
 * The object's hibernated sockets, split by who holds them: the tabs' (no
 * tag, as every socket before runners had none) and the runners'.
 */
const socketsOf = (state: cf.DurableObjectState, runner: boolean) => {
  const isRunner = (ws: cf.WebSocket) => state.getTags(ws).includes(RUNNER_TAG);
  const base = Rpc.websocket.fromDurableObjectState(state);
  return {
    state: {
      getWebSockets: () =>
        Effect.sync(() =>
          state
            .getWebSockets()
            .filter((ws) => isRunner(ws) === runner)
            .map(socketOf),
        ),
      setWebSocketAutoResponse: base.state.setWebSocketAutoResponse,
    },
    upgrade: runner
      ? () =>
          Effect.sync(() => {
            const [client, server] = new (
              globalThis as typeof globalThis & {
                WebSocketPair: new () => [cf.WebSocket, cf.WebSocket];
              }
            ).WebSocketPair();
            state.acceptWebSocket(server, [RUNNER_TAG]);
            const raw = new Response(null, {
              status: 101,
              webSocket: client,
            } as ResponseInit);
            return [
              HttpServerResponse.setBody(
                HttpServerResponse.empty({ status: 101 }),
                HttpBody.raw(raw),
              ),
              socketOf(server),
            ] as const;
          })
      : base.upgrade,
    isRunner,
  };
};

/** The object's entry points: its fetch, and the callbacks of the sockets it hibernates. */
const serve = (state: cf.DurableObjectState, env: UserSpaceEnv) =>
  Effect.gen(function* () {
    const built = yield* Layer.build(services(state, env));
    const deadlines = makeDeadlines(state.storage);
    const served = handlers(deadlines).pipe(
      Layer.provide(Layer.succeedContext(built)),
    );
    const tabs = socketsOf(state, false);
    const runners = socketsOf(state, true);

    // A runner's socket speaks for the one run the Worker named at its
    // upgrade, and is served the RunnerApi only.
    const runnerSockets = yield* Rpc.websocket.server(
      RunnerApi,
      RunnerApi.toLayer(runnerHandlers).pipe(
        Layer.provide(Layer.succeedContext(built)),
      ),
      {
        state: runners.state,
        upgrade: runners.upgrade,
        streams: Rpc.websocket.streams.sqlite({
          storage: state.storage,
          tableName: 'runner_stream_store',
        }),
        connection: {
          tag: RunnerCaller,
          initial: (request) => {
            const caller = runnerOf(request.headers);
            return caller === null
              ? Effect.fail(unauthorized)
              : Effect.succeed(caller);
          },
        },
      },
    );
    const lifecycle = Context.get(built, RunLifecycle);

    // A socket's caller is said once, at its upgrade, and kept with it,
    // acting for them only until their time is up.
    const sockets = yield* Rpc.websocket.server(
      ConsoleApi,
      Layer.merge(
        served,
        authAs(
          Effect.zipWith(SocketCaller, Clock.currentTimeMillis, principalAt),
        ),
      ),
      {
        state: tabs.state,
        upgrade: tabs.upgrade,
        streams: Rpc.websocket.streams.sqlite({ storage: state.storage }),
        connection: {
          tag: SocketCaller,
          initial: (request) => {
            const caller = senderOf(request.headers);
            return caller === null
              ? Effect.fail(unauthorized)
              : Effect.map(Clock.currentTimeMillis, (now) =>
                  opened(caller, now),
                );
          },
        },
      },
    );

    // A Loader's call says its caller in each request.
    const http = (request: Request) => {
      const caller = senderOf(Object.fromEntries(request.headers));
      if (caller === null)
        return Promise.resolve(HttpServerResponse.toWeb(unauthorized));
      return Rpc.http.server(
        ConsoleApi,
        Layer.merge(
          served,
          authAs(
            Effect.map(Clock.currentTimeMillis, (now) =>
              principalAt(caller, now),
            ),
          ),
        ),
      )(request);
    };

    const upgraded = (
      server: typeof sockets | typeof runnerSockets,
      request: Request,
    ) =>
      Effect.runPromise(
        server.accept.pipe(
          Effect.provideService(
            HttpServerRequest.HttpServerRequest,
            HttpServerRequest.fromWeb(request),
          ),
          Effect.map((response) => HttpServerResponse.toWeb(response)),
        ),
      );
    const serverOf = (socket: cf.WebSocket) =>
      runners.isRunner(socket) ? runnerSockets : sockets;

    return {
      fetch: (request: Request): Promise<Response> => {
        if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket')
          return http(request);
        // Only the Worker reaches this object, and it sends a runner here
        // only once its run token checks out (`runner`).
        return new URL(request.url).pathname === '/runner'
          ? upgraded(runnerSockets, request)
          : upgraded(sockets, request);
      },
      message: (socket: cf.WebSocket, data: string | ArrayBuffer) =>
        Effect.runPromise(serverOf(socket).message(socketOf(socket), data)),
      close: (socket: cf.WebSocket, code: number, reason: string) =>
        Effect.runPromise(
          serverOf(socket).close(socketOf(socket), code, reason),
        ),
      alarm: async () => {
        const now = Date.now();
        await deadlines.ring(now);
        await Effect.runPromise(lifecycle.check(now));
      },
      // The Worker's own calls, never a browser's: GitHub's return from an
      // install, and its webhook deliveries.
      connectGitHub: (input: ConnectInput) =>
        Effect.runPromise(connect(input).pipe(Effect.provideContext(built))),
      authorizeGitHub: (input: AuthorizeInput) =>
        Effect.runPromise(authorize(input).pipe(Effect.provideContext(built))),
      githubEvents: {
        receive: (userId: string, delivery: Delivery) =>
          Effect.runPromise(
            receive(userId, delivery).pipe(Effect.provideContext(built)),
          ),
      },
    };
  });

type Served = Effect.Success<ReturnType<typeof serve>>;

export class UserSpace extends DurableObject {
  readonly #served: Promise<Served>;

  constructor(state: DurableObjectState, env: UserSpaceEnv) {
    super(state, env);
    // Built once per activation, and lives as long as it does.
    const scope = Scope.makeUnsafe();
    // `cloudflare:workers` names its own copy of the workerd types.
    this.#served = Effect.runPromise(
      serve(state as unknown as cf.DurableObjectState, env).pipe(
        Scope.provide(scope),
      ),
    );
  }

  override async fetch(request: Request): Promise<Response> {
    return (await this.#served).fetch(request);
  }

  override async webSocketMessage(
    socket: WebSocket,
    data: string | ArrayBuffer,
  ): Promise<void> {
    await (await this.#served).message(socket as unknown as cf.WebSocket, data);
  }

  override async alarm(): Promise<void> {
    await (await this.#served).alarm();
  }

  /** GitHub's return from installing the App, for the member the Worker verified. */
  async connectGitHub(input: ConnectInput): Promise<ConnectStep> {
    return (await this.#served).connectGitHub(input);
  }

  /** GitHub's word on who the member is, after `connectGitHub` asked. */
  async authorizeGitHub(input: AuthorizeInput): Promise<ConnectOutcome> {
    return (await this.#served).authorizeGitHub(input);
  }

  /** A webhook delivery for an installation this member owns. */
  async receiveGitHub(userId: string, delivery: Delivery): Promise<void> {
    await (await this.#served).githubEvents.receive(userId, delivery);
  }

  override async webSocketClose(
    socket: WebSocket,
    code: number,
    reason: string,
  ): Promise<void> {
    await (
      await this.#served
    ).close(socket as unknown as cf.WebSocket, code, reason);
  }
}

/** The caller's own User Space, as the Worker reaches it. */
export const reach = (
  namespace: DurableObjectNamespace<UserSpace>,
  caller: Caller,
) => {
  const stub = namespace.getByName(caller.member.userId);
  return {
    /** Hands the browser's socket upgrade to it, as `caller`. */
    socket: (request: Request): Promise<Response> =>
      stub.fetch(sentBy(request, caller)),
    /** Hands it GitHub's return from installing the App. */
    connectGitHub: (
      input: Omit<ConnectInput, 'userId'>,
    ): Promise<ConnectStep> =>
      stub.connectGitHub({ ...input, userId: caller.member.userId }),
    /** Hands it GitHub's word on who the member is. */
    authorizeGitHub: (
      input: Omit<AuthorizeInput, 'userId'>,
    ): Promise<ConnectOutcome> =>
      stub.authorizeGitHub({ ...input, userId: caller.member.userId }),
    /** Calls its Console API over HTTP, as `caller`: `RpcClient.make(ConsoleApi)` on it. */
    api: Rpc.http
      .client(ConsoleApi, { url: 'https://user-space/rpc' })
      .pipe(
        Layer.provide(
          Layer.succeed(FetchHttpClient.Fetch, (input, init) =>
            stub.fetch(sentBy(new Request(input, init), caller)),
          ),
        ),
      ) satisfies Layer.Layer<RpcClient.Protocol>,
  };
};

/** The User Space of the user whose run a runner performs, as the Worker reaches it for `/runner`. */
export const runner = (
  namespace: DurableObjectNamespace<UserSpace>,
  claim: { readonly userId: string; readonly runId: string },
) => ({
  /** Hands it the runner's socket upgrade, for that one run; the token stays behind. */
  socket: (request: Request): Promise<Response> =>
    namespace
      .getByName(claim.userId)
      .fetch(
        sentByRunner(
          new Request('https://user-space/runner', request),
          claim.runId,
        ),
      ),
});

/** The User Space of the user who owns a GitHub installation, as a webhook reaches it. */
export const owning = (
  namespace: DurableObjectNamespace<UserSpace>,
  userId: string,
) => ({
  /** Hands it one webhook delivery. */
  receive: (delivery: Delivery): Promise<void> =>
    namespace.getByName(userId).receiveGitHub(userId, delivery),
});

export type { ConnectOutcome, ConnectStep, Delivery };
