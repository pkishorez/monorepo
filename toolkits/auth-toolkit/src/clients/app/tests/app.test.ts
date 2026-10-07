import { Context, Effect, Layer } from 'effect';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { memory } from '@kstackz/std-toolkit/sync';
import { describe, expect, it, vi } from 'vitest';
import { Auth } from '../../auth/index.js';
import { memoryPlatform } from '../../gate/index.js';
import { AppPlatform, syncName, createApp, keepSyncs } from '../index.js';

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

class Store extends Context.Service<Store, { readonly on: string }>()(
  'test/Store',
) {}

const ada = { id: 'ada', name: 'Ada', email: 'ada@example.com', image: null };

describe('createApp', () => {
  it('opens the Session over the Backend Link and the platform, and deletes a signed-out user’s sync', async () => {
    const syncs = storeOf([syncName('ada'), syncName('gone')]);
    let signedIn = [{ user: ada, token: 'ada-token', active: true }];
    const auth = Layer.succeed(Auth, {
      list: Effect.sync(() => signedIn),
      signIn: () => Effect.void,
      switchTo: () => Effect.void,
      signOut: () =>
        Effect.sync(() => {
          signedIn = [];
        }),
      signOutAll: Effect.void,
      takeLoginError: Effect.succeed(null),
    });
    const app = createApp({
      platform: () => ({
        table: (source) => Memory.make(source as never).layer as never,
        sync: { ...memory(), ...syncs.store },
        cloud: {
          auth,
          url: 'https://example.com',
          manageAccounts: async () => {},
        },
        gate: memoryPlatform(),
      }),
      cloud: Layer.succeed(Store, { on: 'cloud' }),
      device: async () => Layer.succeed(Store, { on: 'device' }),
      session: (account) =>
        Effect.gen(function* () {
          const { on } = yield* Store;
          const { cloud } = yield* AppPlatform;
          return `${account.user.id} on ${on} at ${cloud.url}`;
        }),
    });
    app.gate.subscribe(() => {});
    await vi.waitFor(() => {
      const view = app.gate.view();
      expect(view.kind === 'open' && view.session).toBe(
        'ada on cloud at https://example.com',
      );
    });
    expect(syncs.removed).toEqual(['user-gone']);
  });
});
