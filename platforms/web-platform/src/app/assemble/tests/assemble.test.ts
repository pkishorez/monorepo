import { Effect, Layer, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { describe, expect, it, vi } from 'vitest';
import { SignIn } from '@kstackz/auth-toolkit/client';
import { Authz } from '@kstackz/auth-toolkit/guard';
import { authz } from '@kstackz/auth-toolkit/server';
import { Api } from '../../apis/index.ts';
import { memoryHost } from '../../host/index.ts';
import {
  defineSession,
  keepSyncs,
  type Opened,
  SessionClosed,
  syncName,
} from '../../session/index.ts';
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
  Authz.guard(),
);
const Slow = Rpc.make('Slow', { success: Schema.String }).pipe(Authz.guard());
const Hello = Rpc.make('Hello', { success: Schema.String });
const Ledger = RpcGroup.make(WhoAmI, Slow);
const Public = RpcGroup.make(Hello);

const apis = {
  ledger: Api.http(Ledger, { path: '/rpc' }),
  public: Api.http(Public, { path: '/public' }),
};

const ada = { id: 'ada', name: 'Ada', email: 'ada@example.com', image: null };

const signedInAs = (list: Effect.Effect<ReadonlyArray<never>> | null) =>
  Layer.succeed(SignIn, {
    list:
      list ??
      Effect.succeed([
        { user: ada, token: 'ada-token', active: true },
      ] as never),
    signIn: () => Effect.void,
    switchTo: () => Effect.void,
    signOut: () => Effect.void,
    signOutAll: Effect.void,
    takeLoginError: Effect.succeed(null),
  });

// Every API's handlers, run on the device, each call checked by its token.
const answer = { slow: Promise.withResolvers<string>() };
const device = () => ({
  ledger: Ledger.toLayer({
    WhoAmI: () => Effect.map(Authz.Current, ({ user }) => user.email),
    Slow: () => Effect.promise(() => answer.slow.promise),
  }).pipe(Layer.merge(authz.layer), Layer.provide(authz.device)),
  public: Public.toLayer({ Hello: () => Effect.succeed('hello') }),
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
    const host = memoryHost({ signIn: signedInAs(null) });
    const session = defineSession(apis, ({ account, sync }) =>
      Effect.succeed(`${account.user.id} in ${sync.name}`),
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

  it('calls every API on the device Backend in this process, signed as the Named Account, and interrupts what the Session was running when it closes', async () => {
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
      device,
      auth: { session },
    });
    const { gate } = app;
    // Chosen before anything asks, so the Gate starts on it.
    await gate.setBackend('device');
    gate.subscribe(() => {});
    const added = gate.addAccount();
    await vi.waitFor(() => expect(gate.namedSignIn.isAsking()).toBe(true));
    gate.namedSignIn.answer({ email: 'ada@demo' });
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

  it('opens a remembered Account at once, verifying until the Sign-in answers', async () => {
    const answered = Promise.withResolvers<void>();
    const host = memoryHost({
      signIn: signedInAs(
        Effect.promise(() => answered.promise).pipe(
          Effect.as([{ user: ada, token: 'ada-token', active: true }] as never),
        ),
      ),
    });
    const app = createApp({ host: () => host, apis, auth: {} });
    // A first launch signs Ada in, so the device remembers her.
    app.gate.subscribe(() => {});
    answered.resolve();
    await openOf(app);

    const later = Promise.withResolvers<void>();
    const again = createApp({
      host: () => ({
        ...host,
        cloud: {
          ...host.cloud,
          signIn: signedInAs(
            Effect.promise(() => later.promise).pipe(
              Effect.as([
                { user: ada, token: 'ada-token', active: true },
              ] as never),
            ),
          ),
        },
      }),
      apis,
      auth: {},
    });
    again.gate.subscribe(() => {});
    const opened = await openOf(again);
    expect(opened.status.get()).toEqual({
      state: 'verifying',
      lastVerifiedAt: null,
    });
    later.resolve();
    await vi.waitFor(() => expect(opened.status.get().state).toBe('verified'));
    expect(opened.status.get().lastVerifiedAt).toBeInstanceOf(Date);
  });
});

describe('public calls', () => {
  it('sends a public call as nobody and fails a guarded one without sending it', async () => {
    const handlers = device();
    const clients = publicClients(apis, {
      backend: () => 'device',
      protocol: async (_, name) =>
        (await import('../../apis/index.ts')).deviceProtocol(
          apis[name as keyof typeof apis],
          handlers[name as keyof typeof handlers] as never,
        ),
    });
    expect(await Effect.runPromise(clients.public.Hello())).toBe('hello');
    const guarded = await Effect.runPromise(
      Effect.flip(clients.ledger.WhoAmI()),
    );
    expect((guarded as { _tag: string })._tag).toBe('Unauthenticated');
  });

  it('runs an app with no auth on the Backend its launch asked for', async () => {
    const app = createApp({
      host: () => memoryHost({ launchBackend: 'device' }),
      apis: { public: apis.public },
      device: () => ({ public: device().public }),
    });
    expect('gate' in app).toBe(false);
    expect(app.host().lifecycle.launchBackend()).toBe('device');
  });
});
