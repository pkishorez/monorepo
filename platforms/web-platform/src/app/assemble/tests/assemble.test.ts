import { Effect, Layer, Schema, SubscriptionRef } from 'effect';
import { Rpc, RpcClient, RpcGroup, type RpcMessage } from 'effect/rpc';
import { describe, expect, it, vi } from 'vitest';
import { Authz } from '@kestack/auth-toolkit';
import { Accounts, AccountsState } from '@kestack/auth-toolkit/client';
import {
  browser,
  localAccountsTable,
} from '@kestack/auth-toolkit/client/browser';
import { auth } from '@kestack/auth-toolkit/server/rpc';
import { Api } from '../../apis/index.ts';
import { type AccountsLayer, memoryHost } from '../../host/index.ts';
import {
  defineSession,
  keepSyncs,
  type Opened,
  SessionClosed,
  syncName,
} from '../../session/index.ts';
import { sendingAs } from '../assemble.tsx';
import { createApp } from '../index.ts';
import { publicClients } from '../public.ts';

const storeOf = (names: string[]) => {
  const removed: string[] = [];
  return {
    removed,
    store: {
      list: async () => names.map((name) => ({ name })),
      remove: async (name: string) => {
        removed.push(name);
      },
    },
  };
};

describe('syncs', () => {
  it('names a copy the way Std Sync stores it', () => {
    expect(syncName('AbC_12')).toBe('user-abc-12');
  });

  it('keeps every signed-in user and deletes every other', async () => {
    const { store, removed } = storeOf([
      syncName('Ada'),
      syncName('Mary'),
      syncName('Gone'),
    ]);
    expect(await keepSyncs(['Ada', 'Mary'], store)).toEqual(['user-gone']);
    expect(removed).toEqual(['user-gone']);
  });

  it('leaves alone what it did not name', async () => {
    const { store, removed } = storeOf(['device', 'other', syncName('ada')]);
    await keepSyncs([], store);
    expect(removed).toEqual(['user-ada']);
  });
});

const WhoAmI = Rpc.make('WhoAmI', { success: Schema.String }).pipe(
  Authz.required,
);
const Slow = Rpc.make('Slow', { success: Schema.String }).pipe(Authz.required);
const Hello = Rpc.make('Hello', { success: Schema.String });
const Ledger = RpcGroup.make(WhoAmI, Slow);
const Public = RpcGroup.make(Hello);

const apis = {
  ledger: Api.http(Ledger, { path: '/rpc' }),
  public: Api.http(Public, { path: '/public' }),
};

const ada = { id: 'ada', name: 'Ada', email: 'ada@example.com', image: null };

/** The cloud's Accounts, as `browser()` gives them: checking from the
 * account `last` seen here, until `answer` says who is signed in. */
const cloudAccounts = (
  answer: Effect.Effect<AccountsState>,
  last?: typeof ada,
): AccountsLayer =>
  Layer.effect(
    Accounts,
    Effect.gen(function* () {
      const ref = yield* SubscriptionRef.make<AccountsState>(
        AccountsState.Checking(last === undefined ? {} : { last }),
      );
      const check = Effect.tap(answer, (state) =>
        SubscriptionRef.set(ref, state),
      );
      yield* Effect.forkScoped(check);
      return Accounts.of({
        state: SubscriptionRef.changes(ref),
        current: SubscriptionRef.get(ref),
        check,
        signIn: () => Effect.void,
        switchTo: () => Effect.void,
        signOut: () => Effect.void,
        signOutAll: Effect.void,
      });
    }),
  ) as unknown as AccountsLayer;

const adaSignedIn = AccountsState.SignedIn({ active: ada, accounts: [ada] });

// Every API's handlers, run in the app; who signed a call is read from its
// Local Token.
const answer = { slow: Promise.withResolvers<string>() };
const local = () => ({
  ledger: Ledger.toLayer({
    WhoAmI: () => Effect.map(Authz.User, ({ user }) => user.email),
    Slow: () => Effect.promise(() => answer.slow.promise),
  }),
  public: Public.toLayer({ Hello: () => Effect.succeed('hello') }),
});

// Each API's handlers behind Local mode, as the Web Platform runs them.
const guarded = (handlers: ReturnType<typeof local>) => ({
  ledger: Layer.merge(auth({ local: true }), handlers.ledger),
  public: handlers.public,
});

const openOf = <S>(app: { gate: { view: () => { kind: string } } }) =>
  vi.waitFor(() => {
    const view = app.gate.view() as { kind: string; session?: Opened<S> };
    if (view.kind !== 'open' || view.session === undefined)
      throw new Error('not open');
    return view.session;
  });

describe('createApp', () => {
  it('opens a Session on the cloud Backend, with a sync named for the user, and deletes a signed-out user’s sync', async () => {
    const syncs = storeOf([syncName('ada'), syncName('gone')]);
    const host = memoryHost({
      accounts: cloudAccounts(Effect.succeed(adaSignedIn)),
    });
    const session = defineSession(apis, ({ account, sync }) =>
      Effect.succeed(`${account.id} in ${sync.name}`),
    );
    const app = createApp({
      host: () => ({
        ...host,
        storage: {
          ...host.storage,
          sync: { ...host.storage.sync, ...syncs.store },
        },
      }),
      apis,
      auth: { session },
    });
    app.gate.subscribe(() => {});
    const opened = await openOf<string>(app);
    expect(opened.value).toBe('ada in user-ada');
    expect(opened.status.get().state).toBe('verified');
    expect(syncs.removed).toEqual(['user-gone']);
  });

  it('calls every API on the Local Backend in this process, signed as the Local Account, and interrupts what the Session was running when it closes', async () => {
    answer.slow = Promise.withResolvers<string>();
    const session = defineSession(apis, ({ apis }) =>
      Effect.succeed({
        whoAmI: apis.ledger.WhoAmI(),
        hello: apis.public.Hello(),
      }),
    );
    const app = createApp({
      host: () => memoryHost(),
      apis,
      local,
      auth: { session },
    });
    const { gate } = app;
    // Chosen before anything asks, so the Gate starts on it.
    await gate.setBackend('local');
    gate.subscribe(() => {});
    const added = gate.addAccount();
    await vi.waitFor(() => expect(gate.localSignIn.isAsking()).toBe(true));
    gate.localSignIn.answer({ email: 'ada@demo' });
    await added;
    const opened = await openOf<{
      whoAmI: Effect.Effect<string, unknown>;
      hello: Effect.Effect<string, unknown>;
    }>(app);
    expect(await Effect.runPromise(opened.value.whoAmI)).toBe('ada@demo');
    expect(await Effect.runPromise(opened.value.hello)).toBe('hello');

    const slow = opened.run(
      (opened.apis['ledger'] as { Slow: () => Effect.Effect<string> }).Slow(),
    );
    const outcome = slow.then(
      () => 'answered',
      (error: unknown) => (error instanceof SessionClosed ? 'closed' : error),
    );
    expect(gate.signOut()).toBe(true);
    await vi.waitFor(() => expect(gate.view().kind).toBe('signedOut'));
    answer.slow.resolve('late');
    expect(await outcome).toBe('closed');
    await expect(opened.run(Effect.succeed(1))).rejects.toBeInstanceOf(
      SessionClosed,
    );
  });

  it('sends what a Session leaves behind an Account Switch as its own Account, never as the next', async () => {
    const leftover = Promise.withResolvers<void>();
    const seen: string[] = [];
    const session = defineSession(apis, ({ account, apis }) =>
      Effect.addFinalizer(() =>
        Effect.promise(() => leftover.promise).pipe(
          Effect.andThen(apis.ledger.WhoAmI()),
          Effect.match({
            onSuccess: (email) => seen.push(`${account.id}: ${email}`),
            onFailure: (error) => seen.push(`${account.id}: ${error._tag}`),
          }),
        ),
      ),
    );
    const app = createApp({
      host: () => memoryHost(),
      apis,
      local,
      auth: { session },
    });
    const { gate } = app;
    await gate.setBackend('local');
    gate.subscribe(() => {});
    const signIn = async (email: string) => {
      const added = gate.addAccount();
      await vi.waitFor(() => expect(gate.localSignIn.isAsking()).toBe(true));
      gate.localSignIn.answer({ email });
      await added;
    };
    await signIn('ada@demo');
    await openOf(app);
    // Mary signs in and is active; Ada's Session is still closing.
    await signIn('mary@demo');
    await vi.waitFor(() =>
      expect(gate.view()).toMatchObject({
        kind: 'open',
        account: { email: 'mary@demo' },
      }),
    );
    leftover.resolve();
    await vi.waitFor(() => expect(seen.length).toBe(1));
    expect(seen[0]).toMatch(/: Unauthenticated$/);
    expect(seen[0]).not.toContain('mary@demo');
  });

  it('opens the Local Accounts a device kept before the Local Backend was renamed', async () => {
    const host = memoryHost();
    // Signed in when the Local Backend was the device Backend, and its
    // Accounts were kept in the database named for it.
    await Effect.runPromise(
      Effect.gen(function* () {
        const accounts = yield* Accounts;
        yield* accounts.signIn();
      }).pipe(
        Effect.provide(
          browser({
            local: {
              choose: Effect.succeed({ email: 'ada@demo' }),
              storage: host.storage.table(localAccountsTable, 'device'),
            },
          }),
        ),
      ),
    );
    const app = createApp({ host: () => host, apis, local, auth: {} });
    await app.gate.setBackend('local');
    app.gate.subscribe(() => {});
    await vi.waitFor(() =>
      expect(app.gate.view()).toMatchObject({
        kind: 'open',
        account: { email: 'ada@demo' },
      }),
    );
  });

  it('opens the Account last seen at once, verifying until the Sign-in answers', async () => {
    const later = Promise.withResolvers<void>();
    const app = createApp({
      host: () =>
        memoryHost({
          accounts: cloudAccounts(
            Effect.promise(() => later.promise).pipe(Effect.as(adaSignedIn)),
            ada,
          ),
        }),
      apis,
      auth: {},
    });
    app.gate.subscribe(() => {});
    const opened = await openOf(app);
    expect(opened.status.get()).toEqual({
      state: 'verifying',
      lastVerifiedAt: null,
    });
    later.resolve();
    await vi.waitFor(() => expect(opened.status.get().state).toBe('verified'));
    expect(opened.status.get().lastVerifiedAt).toBeInstanceOf(Date);
  });
});

describe('a Session’s calls', () => {
  const mary = { ...ada, id: 'mary', email: 'mary@example.com' };
  const sentAs = async (state: AccountsState) => {
    const sent: Array<RpcMessage.FromClientEncoded> = [];
    const protocol = Layer.succeed(RpcClient.Protocol, {
      send: (_: number, request: RpcMessage.FromClientEncoded) =>
        Effect.sync(() => void sent.push(request)),
    } as unknown as RpcClient.Protocol['Service']);
    const accounts = { current: Effect.succeed(state) } as never;
    await Effect.runPromise(
      Effect.gen(function* () {
        const { send } = yield* RpcClient.Protocol;
        yield* send(0, {
          _tag: 'Request',
          id: '1',
          tag: 'WhoAmI',
          payload: null,
          headers: [
            ['expect-user', 'mary'],
            ['authorization', 'Bearer token'],
          ],
        });
      }).pipe(Effect.provide(sendingAs(protocol, ada, accounts))),
    );
    return (sent[0] as RpcMessage.RequestEncoded).headers;
  };

  it('expect the Session’s own User, whoever the Active Account is now', async () => {
    const switched = AccountsState.SignedIn({
      active: mary,
      accounts: [ada, mary],
    });
    expect(await sentAs(switched)).toEqual([['expect-user', 'ada']]);
    expect(await sentAs(adaSignedIn)).toEqual([
      ['expect-user', 'ada'],
      ['authorization', 'Bearer token'],
    ]);
  });
});

describe('public calls', () => {
  it('sends a public call as nobody, and a guarded one is refused', async () => {
    const handlers = guarded(local());
    const clients = publicClients(apis, {
      backend: () => 'local',
      protocol: async (_, name) =>
        (await import('../../apis/index.ts')).localProtocol(
          apis[name as keyof typeof apis],
          handlers[name as keyof typeof handlers] as never,
        ),
    });
    expect(await Effect.runPromise(clients.public.Hello())).toBe('hello');
    const refused = await Effect.runPromise(
      Effect.flip(clients.ledger.WhoAmI()),
    );
    expect((refused as { _tag: string })._tag).toBe('Unauthenticated');
  });

  it('loads a client again after a load that failed', async () => {
    const handlers = guarded(local());
    let loads = 0;
    const clients = publicClients(apis, {
      backend: () => 'local',
      protocol: async (_, name) => {
        loads += 1;
        if (loads === 1) throw new Error('offline');
        return (await import('../../apis/index.ts')).localProtocol(
          apis[name as keyof typeof apis],
          handlers[name as keyof typeof handlers] as never,
        );
      },
    });
    const first = await Effect.runPromiseExit(clients.public.Hello());
    expect(first._tag).toBe('Failure');
    expect(await Effect.runPromise(clients.public.Hello())).toBe('hello');
  });

  it('runs an app with no auth on the Backend its launch asked for', async () => {
    const app = createApp({
      host: () => memoryHost({ launchBackend: 'local' }),
      apis: { public: apis.public },
      local: () => ({ public: local().public }),
    });
    expect('gate' in app).toBe(false);
    expect(app.host().lifecycle.launchBackend()).toBe('local');
  });
});
