import { Effect, Layer, Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { describe, expect, it, vi } from 'vitest';
import { Authz } from '../../../guard/index.js';
import { authz } from '../../../server/index.js';
import { SignIn } from '../../account/index.js';
import { memoryPlatform } from '../../platform/index.js';
import { createApp, keepSyncs } from '../index.js';
import { syncName } from '../keeper.js';

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
const Api = RpcGroup.make(WhoAmI, Slow);

const ada = { id: 'ada', name: 'Ada', email: 'ada@example.com', image: null };

describe('createApp', () => {
  it('opens a Session on the cloud Backend, with a sync named for the user, and deletes a signed-out user’s sync', async () => {
    const syncs = storeOf([syncName('ada'), syncName('gone')]);
    const platform = memoryPlatform({
      signIn: Layer.succeed(SignIn, {
        list: Effect.succeed([{ user: ada, token: 'ada-token', active: true }]),
        signIn: () => Effect.void,
        switchTo: () => Effect.void,
        signOut: () => Effect.void,
        signOutAll: Effect.void,
        takeLoginError: Effect.succeed(null),
      }),
    });
    const app = createApp({
      platform: () => ({
        ...platform,
        storage: {
          ...platform.storage,
          sync: { ...platform.storage.sync, ...syncs.store },
        },
      }),
      api: Api,
      session: ({ account, sync }) =>
        Effect.succeed(`${account.user.id} in ${sync.name}`),
    });
    app.gate.subscribe(() => {});
    await vi.waitFor(() => {
      const view = app.gate.view();
      expect(view.kind === 'open' && view.session).toBe('ada in user-ada');
    });
    expect(syncs.removed).toEqual(['user-gone']);
  });

  it('calls the device Backend in this process, signed as the Named Account, and cuts off a call the Session ended', async () => {
    const answer = Promise.withResolvers<string>();
    const handlers = Api.toLayer({
      WhoAmI: () => Effect.map(Authz.Current, ({ user }) => user.email),
      Slow: () => Effect.promise(() => answer.promise),
    }).pipe(Layer.merge(authz.layer), Layer.provide(authz.device));
    const app = createApp({
      platform: () => memoryPlatform(),
      api: Api,
      device: async () => handlers,
      session: ({ rpc }) =>
        Effect.succeed({
          whoAmI: () => Effect.runPromise(rpc.WhoAmI()),
          slow: () => Effect.runPromise(rpc.Slow()),
        }),
    });
    const { gate } = app;
    // Chosen before anything asks, so the Gate starts on it.
    await gate.setBackend('device');
    gate.subscribe(() => {});
    const added = gate.addAccount();
    await vi.waitFor(() => expect(gate.namedSignIn.isAsking()).toBe(true));
    gate.namedSignIn.answer({ email: 'ada@demo' });
    await added;
    const view = await vi.waitFor(() => {
      const view = gate.view();
      if (view.kind !== 'open') throw new Error('not open');
      return view;
    });
    expect(await view.session.whoAmI()).toBe('ada@demo');

    let settled = false;
    view.session.slow().then(
      () => (settled = true),
      () => (settled = true),
    );
    expect(gate.signOut()).toBe(true);
    await vi.waitFor(() => expect(gate.view().kind).toBe('signedOut'));
    answer.resolve('late');
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(settled).toBe(false);
  });
});
