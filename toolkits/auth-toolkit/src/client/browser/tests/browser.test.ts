import { Memory } from '@kestack/std-toolkit/db/memory';
import { Effect, Exit, Fiber, Layer, Schema, type Scope, Stream } from 'effect';
import { NodeHttpPlatform, NodeServices } from '@effect/platform-node';
import { Etag, FetchHttpClient } from 'effect/http';
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiClient,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiTest,
} from 'effect/http-api';
import {
  client as httpClient,
  server as httpServer,
} from '@kestack/rpc-toolkit/rpc/http';
import { client as inProcessClient } from '@kestack/rpc-toolkit/rpc/in-process';
import { Rpc, RpcClient, RpcGroup } from 'effect/rpc';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  EXPECT_USER,
  httpMiddleware,
  type Principal,
  rpcMiddleware,
  User,
  AccountChanged,
} from '../../../guard/index.js';
import { Accounts, AccountsState } from '../../accounts/index.js';
import { browser, browserAccountsTable } from '../index.js';

const url = 'https://auth.example.com';
const ada = { id: 'ada', email: 'ada@x.com', name: 'Ada', image: null };
const bob = { id: 'bob', email: 'bob@x.com', name: 'Bob', image: 'b.png' };
type Account = typeof ada | typeof bob;

/** The Auth Worker's pages-facing endpoints over one browser's cookie. */
const fakeAuthWorker = (
  accounts: Account[] = [ada, bob],
  active: string | null = 'bob',
) => {
  const cookie = { accounts, active };
  const calls: Array<{
    method: string;
    path: string;
    body?: unknown;
    credentials?: RequestCredentials | undefined;
  }> = [];
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname.replace('/api/auth', '');
    const body =
      request.method === 'POST'
        ? ((await request.json()) as { userId?: string })
        : undefined;
    calls.push({
      method: request.method,
      path,
      ...(body ? { body } : {}),
      credentials: init?.credentials,
    });
    const has = (userId?: string) =>
      cookie.accounts.some(({ id }) => id === userId);
    switch (`${request.method} ${path}`) {
      case 'GET /accounts':
        return json(cookie);
      case 'POST /accounts/switch':
        if (!has(body?.userId)) {
          return json(
            {
              error: 'account_not_signed_in',
              message: 'That account is not signed in on this browser.',
            },
            403,
          );
        }
        cookie.active = body!.userId!;
        return json({ active: cookie.active });
      case 'POST /accounts/sign-out': {
        cookie.accounts = cookie.accounts.filter(
          ({ id }) => id !== body?.userId,
        );
        if (cookie.active === body?.userId) {
          cookie.active = cookie.accounts[0]?.id ?? null;
        }
        return json({ active: cookie.active });
      }
      case 'POST /sign-out':
        cookie.accounts = [];
        cookie.active = null;
        return json({ success: true });
      default:
        return json({}, 404);
    }
  };
  return {
    fetch,
    calls,
    cookie,
    reads: () => calls.filter(({ path }) => path === '/accounts').length,
  };
};

type Worker = ReturnType<typeof fakeAuthWorker>;

const layerOf = (
  worker: Pick<Worker, 'fetch'>,
  cache?: Parameters<typeof browser>[0]['cache'],
) =>
  browser({ url, ...(cache ? { cache } : {}) }).pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, worker.fetch)),
  );

const run = <A, E>(
  worker: Pick<Worker, 'fetch'>,
  effect: Effect.Effect<A, E, Accounts | Scope.Scope>,
  cache?: Parameters<typeof browser>[0]['cache'],
) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(Effect.provide(layerOf(worker, cache))),
  );

const runExit = <A, E>(
  worker: Pick<Worker, 'fetch'>,
  effect: Effect.Effect<A, E, Accounts | Scope.Scope>,
) =>
  Effect.runPromiseExit(
    Effect.scoped(effect).pipe(Effect.provide(layerOf(worker))),
  );

/** The first state that is not Checking. */
const settled = Effect.flatMap(Accounts, ({ state }) =>
  state.pipe(
    Stream.filter((state) => state._tag !== 'Checking'),
    Stream.runHead,
    Effect.map((state) => (state._tag === 'Some' ? state.value : undefined)),
  ),
);

/** Waits until `accounts`' state passes `holds`. */
const until = (
  accounts: Accounts['Service'],
  holds: (state: AccountsState) => boolean,
) => accounts.state.pipe(Stream.filter(holds), Stream.runHead);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('browser', () => {
  it('checks on start with the cookie, and lists Accounts without tokens', async () => {
    const worker = fakeAuthWorker();
    const [first, state] = await run(
      worker,
      Effect.gen(function* () {
        const first = yield* (yield* Accounts).current;
        return [first, yield* settled] as const;
      }),
    );
    expect(first).toEqual(AccountsState.Checking({}));
    expect(state).toEqual(
      AccountsState.SignedIn({ active: bob, accounts: [ada, bob] }),
    );
    expect(worker.calls).toEqual([
      { method: 'GET', path: '/accounts', credentials: 'include' },
    ]);
  });

  it('opens at once from the cache with the last Active Account, then confirms', async () => {
    const cache = Memory.make(browserAccountsTable).layer;
    await run(fakeAuthWorker(), settled, cache);

    const worker = fakeAuthWorker([ada, bob], 'ada');
    const states = await run(
      worker,
      Effect.flatMap(Accounts, ({ state }) =>
        state.pipe(Stream.take(2), Stream.runCollect),
      ),
      cache,
    );
    expect(states).toEqual([
      AccountsState.Checking({ last: bob }),
      AccountsState.SignedIn({ active: ada, accounts: [ada, bob] }),
    ]);
  });

  it('switches, signs one Account out, and signs every Account out', async () => {
    const worker = fakeAuthWorker();
    const [switched, signedOut, none] = await run(
      worker,
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        yield* settled;
        yield* accounts.switchTo('ada');
        const switched = yield* accounts.current;
        yield* accounts.signOut();
        const signedOut = yield* accounts.current;
        yield* accounts.signOutAll;
        return [switched, signedOut, yield* accounts.current] as const;
      }),
    );
    expect(switched).toEqual(
      AccountsState.SignedIn({ active: ada, accounts: [ada, bob] }),
    );
    expect(signedOut).toEqual(
      AccountsState.SignedIn({ active: bob, accounts: [bob] }),
    );
    expect(none).toEqual(AccountsState.SignedOut());
    expect(
      worker.calls
        .filter(({ method }) => method === 'POST')
        .map(({ path, body }) => [path, body]),
    ).toEqual([
      ['/accounts/switch', { userId: 'ada' }],
      ['/accounts/sign-out', { userId: 'ada' }],
      ['/sign-out', {}],
    ]);
  });

  it('shows a switch under way, then the Account it made active', async () => {
    const seen = await run(
      fakeAuthWorker(),
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        yield* settled;
        const states = yield* Effect.forkChild(
          accounts.state.pipe(Stream.take(3), Stream.runCollect),
        );
        yield* Effect.yieldNow;
        yield* accounts.switchTo('ada');
        return yield* Fiber.join(states);
      }),
    );
    expect(seen).toEqual([
      AccountsState.SignedIn({ active: bob, accounts: [ada, bob] }),
      AccountsState.SignedIn({
        active: bob,
        accounts: [ada, bob],
        switchingTo: ada,
      }),
      AccountsState.SignedIn({ active: ada, accounts: [ada, bob] }),
    ]);
  });

  it('says what the Auth Worker refused, and tells unavailable from unreachable', async () => {
    const refused = await runExit(
      fakeAuthWorker(),
      Effect.flatMap(Accounts, (accounts) => accounts.switchTo('nobody')),
    );
    expect(refused).toMatchObject(
      Exit.fail({
        _tag: 'AuthWorkerRejected',
        status: 403,
        reason: 'That account is not signed in on this browser.',
      }),
    );

    const down = await runExit(
      { fetch: async () => new Response('Bad gateway', { status: 502 }) },
      Effect.flatMap(Accounts, (accounts) => accounts.check),
    );
    expect(down).toMatchObject(
      Exit.fail({ _tag: 'AuthWorkerUnavailable', status: 502 }),
    );

    const offline = await runExit(
      {
        fetch: async () => {
          throw new TypeError('fetch failed');
        },
      },
      Effect.flatMap(Accounts, (accounts) => accounts.check),
    );
    expect(offline).toMatchObject(
      Exit.fail({ _tag: 'AuthWorkerUnreachable', url }),
    );

    const garbled = await runExit(
      { fetch: async () => Response.json({ accounts: 'many' }) },
      Effect.flatMap(Accounts, (accounts) => accounts.check),
    );
    expect(garbled).toMatchObject(
      Exit.fail({ _tag: 'InvalidAuthWorkerResponse' }),
    );
  });

  it('leaves for the Login Screen, coming back here, adding an Account when signed in', async () => {
    const assign = vi.fn();
    vi.stubGlobal('window', {
      location: { href: 'https://app.example.com/notes?id=1', assign },
    });
    const signIn = Effect.gen(function* () {
      const accounts = yield* Accounts;
      yield* settled;
      const fiber = yield* Effect.forkChild(accounts.signIn(), {
        startImmediately: true,
      });
      yield* Effect.sleep(1);
      // The page is leaving, so sign-in never completes.
      expect(fiber.pollUnsafe()).toBeUndefined();
      yield* Fiber.interrupt(fiber);
    });

    await run(fakeAuthWorker(), signIn);
    await run(fakeAuthWorker([], null), signIn);

    expect(assign.mock.calls.map(([to]) => to)).toEqual([
      `${url}/login?return_to=${encodeURIComponent('https://app.example.com/notes?id=1')}&add_account=1`,
      `${url}/login?return_to=${encodeURIComponent('https://app.example.com/notes?id=1')}`,
    ]);
  });

  it('checks again when the tab becomes visible', async () => {
    const document = Object.assign(new EventTarget(), {
      visibilityState: 'hidden',
    });
    vi.stubGlobal('document', document);
    const worker = fakeAuthWorker();
    const state = await run(
      worker,
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        yield* settled;
        worker.cookie.active = 'ada';
        document.visibilityState = 'visible';
        document.dispatchEvent(new Event('visibilitychange'));
        return yield* until(
          accounts,
          (state) => state._tag === 'SignedIn' && state.active.id === 'ada',
        );
      }),
    );
    expect(state._tag).toBe('Some');
    expect(worker.reads()).toBe(2);
  });

  it('tells other tabs of a switch at once', async () => {
    const worker = fakeAuthWorker();
    const other = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const ctx = yield* Layer.build(layerOf(worker));
          const tab = yield* Layer.build(layerOf(worker));
          const here = ctx.mapUnsafe.get(Accounts.key) as Accounts['Service'];
          const there = tab.mapUnsafe.get(Accounts.key) as Accounts['Service'];
          yield* Effect.provideService(settled, Accounts, here);
          yield* Effect.provideService(settled, Accounts, there);
          const reads = worker.reads();
          yield* here.switchTo('ada');
          const seen = yield* until(
            there,
            (state) => state._tag === 'SignedIn' && state.active.id === 'ada',
          );
          // `here` read once after switching; `there` asked nobody.
          expect(worker.reads()).toBe(reads + 1);
          return seen;
        }),
      ),
    );
    expect(other._tag).toBe('Some');
  });
});

describe('browser signing', () => {
  const WhoAmI = rpcMiddleware.with()(
    Rpc.make('WhoAmI', { success: Schema.String }),
  );
  const Api = RpcGroup.make(WhoAmI);
  const Handlers = Api.toLayer({
    WhoAmI: () => Effect.map(User, ({ user }) => user.id),
  });

  /** The Guard's server half over `worker`'s cookie: a call naming a User
   * other than the Active Account fails AccountChanged. */
  const server = (worker: Worker, seen: Array<string | undefined>) =>
    rpcMiddleware.layer(({ headers }) =>
      Effect.gen(function* () {
        const expected = headers[EXPECT_USER];
        seen.push(expected);
        if (expected !== worker.cookie.active) {
          return yield* new AccountChanged({ reason: 'Switched' });
        }
        return { user: { id: expected } } as unknown as Principal;
      }),
    );

  const call = (worker: Worker, seen: Array<string | undefined>) =>
    Effect.gen(function* () {
      const client = yield* RpcClient.make(Api);
      return yield* Effect.result(client.WhoAmI());
    }).pipe(
      Effect.scoped,
      Effect.provide(
        inProcessClient(Api, Layer.mergeAll(Handlers, server(worker, seen))),
      ),
    );

  it('names the Active Account on every call, waiting for the first check', async () => {
    const worker = fakeAuthWorker();
    const seen: Array<string | undefined> = [];
    const result = await run(worker, call(worker, seen));
    expect(result).toMatchObject({ success: 'bob' });
    expect(seen).toEqual(['bob']);
  });

  it('fails AccountChanged when another tab switched, and checks again by itself', async () => {
    const worker = fakeAuthWorker();
    const seen: Array<string | undefined> = [];
    const [refused, state, next] = await run(
      worker,
      Effect.gen(function* () {
        yield* settled;
        worker.cookie.active = 'ada';
        const refused = yield* call(worker, seen);
        const state = yield* (yield* Accounts).current;
        return [refused, state, yield* call(worker, seen)] as const;
      }),
    );
    expect(refused).toMatchObject({ failure: { _tag: 'AccountChanged' } });
    expect(state).toEqual(
      AccountsState.SignedIn({ active: ada, accounts: [ada, bob] }),
    );
    expect(worker.reads()).toBe(2);
    expect(next).toMatchObject({ success: 'ada' });
    expect(seen).toEqual(['bob', 'ada']);
  });

  it('sends the cookie over http with no fetch options from the app', async () => {
    const worker = fakeAuthWorker();
    const answer = httpServer(
      Api,
      Layer.mergeAll(Handlers, server(worker, [])),
    );
    const sent: Array<RequestCredentials | undefined> = [];
    const app: typeof globalThis.fetch = (input, init) => {
      sent.push(init?.credentials);
      return answer(new Request(input, init));
    };
    const result = await run(
      worker,
      Effect.gen(function* () {
        const client = yield* RpcClient.make(Api);
        return yield* Effect.result(client.WhoAmI());
      }).pipe(
        Effect.scoped,
        Effect.provide(httpClient(Api, { url: 'https://api.test/rpc' })),
        Effect.provideService(FetchHttpClient.Fetch, app),
      ),
    );
    expect(result).toMatchObject({ success: 'bob' });
    expect(sent).toEqual(['include']);
  });

  it('sends nothing while signed out', async () => {
    const worker = fakeAuthWorker([], null);
    const seen: Array<string | undefined> = [];
    const result = await run(worker, call(worker, seen));
    expect(result).toMatchObject({
      failure: { _tag: 'Unauthenticated', reason: 'Not signed in' },
    });
    expect(seen).toEqual([]);
  });
});

describe('browser signing over HttpApi', () => {
  const Me = HttpApiEndpoint.get('me', '/me', { success: Schema.String }).pipe(
    httpMiddleware.with(),
  );
  class Api extends HttpApi.make('api').add(
    HttpApiGroup.make('private').add(Me),
  ) {}
  const Handlers = HttpApiBuilder.group(Api, 'private', (handlers) =>
    handlers.handle('me', () => Effect.map(User, ({ user }) => user.id)),
  );
  const server = (worker: Worker) =>
    httpMiddleware.layer(({ request }) =>
      Effect.gen(function* () {
        const expected = request.headers[EXPECT_USER];
        if (expected !== worker.cookie.active) {
          return yield* new AccountChanged({ reason: 'Switched' });
        }
        return { user: { id: expected } } as unknown as Principal;
      }),
    );
  const call = (worker: Worker) =>
    Effect.gen(function* () {
      const client = yield* HttpApiTest.groups(Api, ['private']);
      return yield* Effect.result(client.private.me());
    }).pipe(
      Effect.provide(Handlers),
      Effect.provide(server(worker)),
      Effect.provide(
        Layer.mergeAll(NodeServices.layer, NodeHttpPlatform.layer, Etag.layer),
      ),
    );

  it('checks again by itself when another tab switched', async () => {
    const worker = fakeAuthWorker();
    const [first, refused, state, next] = await run(
      worker,
      Effect.gen(function* () {
        const first = yield* call(worker);
        worker.cookie.active = 'ada';
        const refused = yield* call(worker);
        const state = yield* (yield* Accounts).current;
        return [first, refused, state, yield* call(worker)] as const;
      }),
    );
    expect(first).toMatchObject({ success: 'bob' });
    expect(refused).toMatchObject({ failure: { _tag: 'AccountChanged' } });
    expect(state).toEqual(
      AccountsState.SignedIn({ active: ada, accounts: [ada, bob] }),
    );
    expect(next).toMatchObject({ success: 'ada' });
  });

  it('sends the cookie with no fetch options from the app', async () => {
    const worker = fakeAuthWorker();
    const sent: Array<{
      credentials: RequestCredentials | undefined;
      expected: string | null;
    }> = [];
    const app: typeof globalThis.fetch = async (input, init) => {
      sent.push({
        credentials: init?.credentials,
        expected: new Headers(init?.headers).get(EXPECT_USER),
      });
      return Response.json('bob');
    };
    const result = await run(
      worker,
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api, {
          baseUrl: 'https://api.test',
        });
        return yield* Effect.result(client.private.me());
      }).pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(FetchHttpClient.Fetch, app),
      ),
    );
    expect(result).toMatchObject({ success: 'bob' });
    expect(sent).toEqual([{ credentials: 'include', expected: 'bob' }]);
  });

  it('sends nothing while signed out, failing Unauthenticated', async () => {
    const worker = fakeAuthWorker([], null);
    const sent: Array<RequestCredentials | undefined> = [];
    const app: typeof globalThis.fetch = async (_input, init) => {
      sent.push(init?.credentials);
      return Response.json('someone');
    };
    const result = await run(
      worker,
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api, {
          baseUrl: 'https://api.test',
        });
        return yield* Effect.result(client.private.me());
      }).pipe(
        Effect.provide(FetchHttpClient.layer),
        Effect.provideService(FetchHttpClient.Fetch, app),
      ),
    );
    expect(result).toMatchObject({
      failure: { _tag: 'Unauthenticated', reason: 'Not signed in' },
    });
    expect(sent).toEqual([]);
  });
});
