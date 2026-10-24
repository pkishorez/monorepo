import { Memory } from '@kestack/std-toolkit/db/memory';
import {
  Effect,
  Exit,
  Fiber,
  Layer,
  Option,
  Schema,
  type Scope,
  Stream,
} from 'effect';
import { FetchHttpClient } from 'effect/http';
import { Rpc, RpcGroup, RpcTest } from 'effect/rpc';
import { hostname } from 'node:os';
import { describe, expect, it } from 'vitest';
import {
  bearerToken,
  type Principal,
  rpcMiddleware,
  Unauthenticated,
  User,
} from '../../../guard/index.js';
import { Accounts, AccountsState } from '../../accounts/index.js';
import { device, deviceAccountsTable } from '../index.js';

const url = 'https://auth.example.com';
const account = (id: string, email: string, name: string) => ({
  id,
  email,
  name,
  image: null,
  test: email.endsWith('.test'),
});
const ada = account('ada', 'ada@example.com', 'Ada');
const bob = account('bob', 'bob@example.com', 'Bob');
const tess = account('tess', 'tess@example.test', 'Tess');

/** An Auth Worker doing Device Login: each `/device/token` poll takes the
 * next answer; `'ada'`, `'bob'` or `'tess'` approves as that User. */
const fakeAuthWorker = (answers: string[]) => {
  const live = new Map<string, typeof ada>();
  const calls: string[] = [];
  const agents = new Set<string | null>();
  const bodies: unknown[] = [];
  let issued = 0;
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  const worker = {
    live,
    calls,
    agents,
    bodies,
    fetch: (async (input, init) => {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname.replace('/api/auth', '');
      const token = request.headers.get('authorization')?.slice(7);
      calls.push(path);
      agents.add(request.headers.get('user-agent'));
      if (request.method === 'POST') bodies.push(await request.json());
      switch (path) {
        case '/device/code':
          return json({
            device_code: 'dc',
            user_code: 'ABCD-EFGH',
            verification_uri: `${url}/device`,
            verification_uri_complete: `${url}/device?user_code=ABCD-EFGH`,
            interval: 0,
          });
        case '/device/token': {
          const answer = answers.shift()!;
          const user = { ada, bob, tess }[answer as 'ada' | 'bob' | 'tess'];
          if (!user) return json({ error: answer }, 400);
          const token = `${answer}-token-${++issued}`;
          live.set(token, user);
          return json({ access_token: token, token_type: 'Bearer' });
        }
        case '/get-session': {
          const user = token ? live.get(token) : undefined;
          // The Auth Worker never says which Users are Test Users.
          return json(
            user
              ? {
                  user: { id: user.id, email: user.email, name: user.name },
                  session: { token },
                }
              : null,
          );
        }
        case '/sign-out':
          live.delete(token ?? '');
          return json({ success: true });
        default:
          return json({}, 404);
      }
    }) as typeof globalThis.fetch,
  };
  return worker;
};

type Worker = ReturnType<typeof fakeAuthWorker>;

const shown: Array<{ url: string; code: string; open: string }> = [];
const show = (login: { url: string; code: string; open: string }) =>
  Effect.sync(() => void shown.push(login));

const layerOf = (
  worker: Pick<Worker, 'fetch'>,
  options: Partial<Parameters<typeof device>[0]> = {},
) =>
  device({ url, app: 'demo-cli', show, ...options }).pipe(
    Layer.provide(Layer.succeed(FetchHttpClient.Fetch, worker.fetch)),
  );

const run = <A, E>(
  worker: Pick<Worker, 'fetch'>,
  use: (accounts: Accounts['Service']) => Effect.Effect<A, E, Scope.Scope>,
  options?: Partial<Parameters<typeof device>[0]>,
) =>
  Effect.runPromiseExit(
    Effect.scoped(Effect.flatMap(Accounts, use)).pipe(
      Effect.provide(layerOf(worker, options)),
    ),
  );

describe('device', () => {
  it('signs in once the code is approved, and keeps the Account between runs', async () => {
    const storage = Memory.make(deviceAccountsTable).layer;
    const worker = fakeAuthWorker([
      'authorization_pending',
      'slow_down',
      'ada',
    ]);
    expect(
      await run(
        worker,
        (accounts) =>
          Effect.andThen(
            accounts.signIn({ account: ada.email }),
            accounts.current,
          ),
        { storage },
      ),
    ).toEqual(
      Exit.succeed(AccountsState.SignedIn({ active: ada, accounts: [ada] })),
    );
    expect(
      worker.calls.filter((path) => path === '/device/token'),
    ).toHaveLength(3);
    expect(worker.bodies[0]).toEqual({ client_id: 'demo-cli' });
    expect(shown.at(-1)).toEqual({
      url: `${url}/device?code=ABCD-EFGH&account=ada%40example.com`,
      code: 'ABCD-EFGH',
      open: 'prompt',
    });

    // The next run trusts the Sign-in Store without asking anyone.
    const calls = worker.calls.length;
    expect(
      await run(worker, (accounts) => accounts.current, { storage }),
    ).toEqual(
      Exit.succeed(AccountsState.SignedIn({ active: ada, accounts: [ada] })),
    );
    expect(worker.calls).toHaveLength(calls);
  });

  it('opens the way it is told', async () => {
    await run(fakeAuthWorker(['ada']), (accounts) =>
      accounts.signIn({ open: 'auto' }),
    );
    expect(shown.at(-1)).toMatchObject({ open: 'auto' });
    await run(fakeAuthWorker(['ada']), (accounts) => accounts.signIn(), {
      open: 'auto',
    });
    expect(shown.at(-1)).toMatchObject({
      url: `${url}/device?code=ABCD-EFGH`,
      open: 'auto',
    });
  });

  it('names itself to the Auth Worker so the Home Page can list it', async () => {
    const named = fakeAuthWorker(['ada']);
    await run(named, (accounts) => accounts.signIn());
    expect(named.agents).toEqual(new Set([`demo-cli (${hostname()})`]));

    const versioned = fakeAuthWorker(['ada']);
    await run(versioned, (accounts) => accounts.signIn(), { version: '1.2.0' });
    expect(versioned.agents).toEqual(
      new Set([`demo-cli/1.2.0 (${hostname()})`]),
    );
  });

  it('keeps several Accounts, one active, and switches between them', async () => {
    const worker = fakeAuthWorker(['ada', 'bob']);
    const states = await run(worker, (accounts) =>
      Effect.gen(function* () {
        yield* accounts.signIn();
        yield* accounts.signIn();
        const both = yield* accounts.current;
        const during = yield* Effect.forkChild(
          accounts.state.pipe(Stream.drop(1), Stream.runHead),
        );
        yield* Effect.yieldNow;
        yield* accounts.switchTo('ada');
        const switched = yield* accounts.current;
        expect(yield* Fiber.join(during)).toEqual(
          Option.some(
            AccountsState.SignedIn({
              active: bob,
              accounts: [ada, bob],
              switchingTo: ada,
            }),
          ),
        );
        yield* accounts.signOut();
        return [both, switched, yield* accounts.current];
      }),
    );
    expect(states).toEqual(
      Exit.succeed([
        AccountsState.SignedIn({ active: bob, accounts: [ada, bob] }),
        AccountsState.SignedIn({ active: ada, accounts: [ada, bob] }),
        AccountsState.SignedIn({ active: bob, accounts: [bob] }),
      ]),
    );
    // Signing Ada out revoked her Sign-in on the Auth Worker.
    expect([...worker.live.values()]).toEqual([bob]);
  });

  it('signs the same User in again with a fresh token, revoking the old one', async () => {
    const worker = fakeAuthWorker(['ada', 'ada']);
    await run(worker, (accounts) =>
      Effect.andThen(accounts.signIn(), accounts.signIn()),
    );
    expect([...worker.live.keys()]).toEqual(['ada-token-2']);
  });

  it('refuses one Account past the limit, revoking its new Sign-in', async () => {
    const worker = fakeAuthWorker(['ada', 'bob']);
    const exit = await run(
      worker,
      (accounts) => Effect.andThen(accounts.signIn(), accounts.signIn()),
      { maxAccounts: 1 },
    );
    expect(exit).toMatchObject(
      Exit.fail({ _tag: 'AccountLimitReached', limit: 1 }),
    );
    expect([...worker.live.values()]).toEqual([ada]);
  });

  it('distinguishes unavailable, unreachable, rejected, and invalid responses', async () => {
    const signIn = (accounts: Accounts['Service']) => accounts.signIn();
    expect(
      await run(
        { fetch: async () => new Response('Bad gateway', { status: 502 }) },
        signIn,
      ),
    ).toMatchObject(Exit.fail({ _tag: 'AuthWorkerUnavailable', status: 502 }));

    expect(
      await run(
        {
          fetch: async () => {
            throw new TypeError('fetch failed');
          },
        },
        signIn,
      ),
    ).toMatchObject(Exit.fail({ _tag: 'AuthWorkerUnreachable' }));

    expect(
      await run(
        { fetch: async () => new Response('Bad request', { status: 400 }) },
        signIn,
      ),
    ).toMatchObject(Exit.fail({ _tag: 'AuthWorkerRejected', status: 400 }));

    const invalid = fakeAuthWorker(['ada']);
    const fetch = invalid.fetch;
    expect(
      await run(
        {
          fetch: async (input, init) =>
            new URL(new Request(input, init).url).pathname.endsWith(
              '/get-session',
            )
              ? new Response('not json')
              : fetch(input, init),
        },
        signIn,
      ),
    ).toMatchObject(Exit.fail({ _tag: 'InvalidAuthWorkerResponse' }));
  });

  it('reports the Auth Worker going down while the device is polling', async () => {
    const worker = fakeAuthWorker(['authorization_pending']);
    let polls = 0;
    const exit = await run(
      {
        fetch: async (input, init) =>
          new URL(new Request(input, init).url).pathname.endsWith(
            '/device/token',
          ) && ++polls > 1
            ? new Response('Service unavailable', { status: 503 })
            : worker.fetch(input, init),
      },
      (accounts) => accounts.signIn(),
    );
    expect(exit).toMatchObject(
      Exit.fail({ _tag: 'AuthWorkerUnavailable', status: 503 }),
    );
  });

  it('marks a Test User it signed in, and cannot sign one in by email', async () => {
    const worker = fakeAuthWorker(['tess']);
    expect(
      await run(worker, (accounts) =>
        Effect.andThen(accounts.signIn(), accounts.current),
      ),
    ).toEqual(
      Exit.succeed(AccountsState.SignedIn({ active: tess, accounts: [tess] })),
    );
    expect(tess.test).toBe(true);

    const untouched = fakeAuthWorker([]);
    expect(
      await run(untouched, (accounts) =>
        accounts.signIn({ test: { email: 'tess@example.test' } }),
      ),
    ).toMatchObject(
      Exit.fail({ _tag: 'TestSignInUnsupported', client: 'Device' }),
    );
    expect(untouched.calls).toEqual([]);
  });

  it('fails sign-in when the code is denied or expires', async () => {
    expect(
      await run(fakeAuthWorker(['access_denied']), (accounts) =>
        accounts.signIn(),
      ),
    ).toMatchObject(Exit.fail({ _tag: 'DeviceLoginFailed', reason: 'denied' }));
    expect(
      await run(fakeAuthWorker(['expired_token']), (accounts) =>
        accounts.signIn(),
      ),
    ).toMatchObject(
      Exit.fail({ _tag: 'DeviceLoginFailed', reason: 'expired' }),
    );
  });

  it('drops an Account whose Sign-in died when it checks', async () => {
    const worker = fakeAuthWorker(['ada', 'bob']);
    const state = await run(worker, (accounts) =>
      Effect.gen(function* () {
        yield* accounts.signIn();
        yield* accounts.signIn();
        worker.live.delete('bob-token-2');
        return yield* accounts.check;
      }),
    );
    expect(state).toEqual(
      Exit.succeed(AccountsState.SignedIn({ active: ada, accounts: [ada] })),
    );
  });

  it('keeps an Account signed in while a check was asking', async () => {
    const worker = fakeAuthWorker(['ada', 'bob']);
    let release!: () => void;
    const answer = new Promise<void>((resolve) => (release = resolve));
    let asked!: () => void;
    const asking = new Promise<void>((resolve) => (asked = resolve));
    let hold = false;
    const fetch: typeof globalThis.fetch = async (input, init) => {
      const path = new URL(new Request(input, init).url).pathname;
      if (hold && path.endsWith('/get-session')) {
        hold = false;
        asked();
        await answer;
      }
      return worker.fetch(input, init);
    };
    const storage = Memory.make(deviceAccountsTable).layer;
    const state = await run(
      { fetch },
      (accounts) =>
        Effect.gen(function* () {
          yield* accounts.signIn();
          hold = true;
          const checking = yield* Effect.forkChild(accounts.check);
          yield* Effect.promise(() => asking);
          yield* Effect.forkChild(accounts.signIn());
          yield* Effect.promise(() => new Promise((r) => setTimeout(r, 20)));
          release();
          yield* Fiber.join(checking);
          return yield* accounts.current;
        }),
      { storage },
    );
    expect(state).toEqual(
      Exit.succeed(
        AccountsState.SignedIn({ active: bob, accounts: [ada, bob] }),
      ),
    );
    // And the next run still holds Bob's Sign-in.
    expect(
      await run(worker, (accounts) => accounts.current, { storage }),
    ).toEqual(
      Exit.succeed(
        AccountsState.SignedIn({ active: bob, accounts: [ada, bob] }),
      ),
    );
  });

  it('signs out of every Account at the Auth Worker', async () => {
    const worker = fakeAuthWorker(['ada', 'bob']);
    const state = await run(worker, (accounts) =>
      Effect.gen(function* () {
        yield* accounts.signIn();
        yield* accounts.signIn();
        yield* accounts.signOutAll;
        return yield* accounts.current;
      }),
    );
    expect(state).toEqual(Exit.succeed(AccountsState.SignedOut()));
    expect(worker.live.size).toBe(0);
  });
});

describe('device signing', () => {
  const WhoAmI = rpcMiddleware.with()(
    Rpc.make('WhoAmI', { success: Schema.String }),
  );
  const Api = RpcGroup.make(WhoAmI);
  const Handlers = Api.toLayer({
    WhoAmI: () => Effect.map(User, ({ user }) => user.email),
  });

  /** The Guard's server half asking `worker` who a bearer names. */
  const server = (worker: Worker) =>
    rpcMiddleware.layer(({ headers }) => {
      const token = bearerToken({ get: (name) => headers[name] ?? null });
      const user = token ? worker.live.get(token) : undefined;
      return user
        ? Effect.succeed({ user } as unknown as Principal)
        : Effect.fail(new Unauthenticated({ reason: 'Unknown token' }));
    });

  const call = (worker: Worker) =>
    Effect.gen(function* () {
      const client = yield* RpcTest.makeClient(Api);
      return yield* Effect.result(client.WhoAmI());
    }).pipe(Effect.provide(Handlers), Effect.provide(server(worker)));

  it('signs every call as the Active Account, following a switch', async () => {
    const worker = fakeAuthWorker(['ada', 'bob']);
    const results = await run(worker, (accounts) =>
      Effect.gen(function* () {
        const before = yield* call(worker);
        yield* accounts.signIn();
        yield* accounts.signIn();
        const asBob = yield* call(worker);
        yield* accounts.switchTo('ada');
        return [before, asBob, yield* call(worker)];
      }),
    );
    expect(results).toMatchObject(
      Exit.succeed([
        { failure: { _tag: 'Unauthenticated', reason: 'Not signed in' } },
        { success: bob.email },
        { success: ada.email },
      ]),
    );
  });
});
