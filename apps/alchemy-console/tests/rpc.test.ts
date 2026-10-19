import { Effect } from 'effect';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { collect, startConsole } from './support/console.ts';

/*
 * `/rpc` in the Worker as it deploys: each signed-in, invited member's
 * socket reaches their own User Space, and nobody else's is opened.
 */

const ada = { id: 'local_ada', email: 'ada@demo', name: 'Ada' };
const bob = { id: 'local_bob', email: 'bob@demo', name: 'Bob' };
const eve = { id: 'local_eve', email: 'eve@demo', name: 'Eve' };

let console_: Awaited<ReturnType<typeof startConsole>>;
beforeAll(async () => {
  console_ = await startConsole({ invites: 'ada@demo, BOB@demo' });
});
afterAll(() => console_?.dispose());

const run = <A, E>(effect: Effect.Effect<A, E, import('effect').Scope.Scope>) =>
  Effect.runPromise(Effect.scoped(effect));

describe('/rpc', () => {
  it('opens each member’s socket on their own User Space', () =>
    run(
      Effect.gen(function* () {
        const adaSocket = yield* console_.socket(ada);
        const watched = yield* collect(adaSocket['Session.watch']());
        expect(yield* watched.next).toEqual({
          userId: ada.id,
          email: ada.email,
          name: ada.name,
        });

        const bobSocket = yield* console_.socket(bob);
        expect(yield* bobSocket['Session.me']()).toEqual({
          userId: bob.id,
          email: bob.email,
          name: bob.name,
        });
        // Bob was recorded in his own User Space, never in Ada's.
        expect(yield* watched.within('300 millis')).toEqual([]);
      }),
    ));

  it('refuses a socket without a session before the upgrade', async () => {
    const response = await console_.fetch('/rpc', undefined, {
      upgrade: 'websocket',
    });
    expect(response.status).toBe(401);
    expect(response.webSocket).toBeNull();
  });

  it('refuses a signed-in visitor who is not on the Invite list', async () => {
    const response = await console_.fetch('/rpc', eve, {
      upgrade: 'websocket',
    });
    expect(response.status).toBe(403);
    expect(await response.text()).toBe('Console is invite-only for now');
  });

  it('answers only a WebSocket upgrade', async () => {
    expect((await console_.fetch('/rpc', ada)).status).toBe(426);
  });

  it('streams Session.watch to every socket of one member', () =>
    run(
      Effect.gen(function* () {
        const tabs = yield* Effect.all(
          [console_.socket(bob), console_.socket(bob)].map((open) =>
            Effect.flatMap(open, (socket) =>
              collect(socket['Session.watch']()),
            ),
          ),
        );
        for (const tab of tabs) expect((yield* tab.next).name).toBe('Bob');

        // Bob signs in again elsewhere under a new name.
        const elsewhere = yield* console_.socket({ ...bob, name: 'Bob Ross' });
        yield* elsewhere['Session.me']();
        for (const tab of tabs)
          expect(yield* tab.next).toEqual({
            userId: bob.id,
            email: bob.email,
            name: 'Bob Ross',
          });
      }),
    ));
});
