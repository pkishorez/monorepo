import { Effect, Layer, ManagedRuntime, Scope, SubscriptionRef } from 'effect';
import type { SessionStatus } from '@kstackz/web-platform/define';
import { RpcClient } from 'effect/rpc';
import { nameToken, namedUser } from '@kstackz/auth-toolkit/client';
import { Authz } from '@kstackz/auth-toolkit/guard';
import { authz } from '@kstackz/auth-toolkit/server';
import { Rpc } from '@kstackz/rpc-toolkit/rpc';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { createStdSync, Sync } from '@kstackz/std-toolkit/sync';
import { expect, it, vi } from 'vitest';
import { LedgerApi } from '../../api/index.ts';
import { ledgerBackend } from '../../backend/backend.ts';
import { ledgerTable } from '../../backend/services/table/index.ts';
import { ledgerSession } from '../index.ts';

// The Backend in this process, as the device Backend runs it, on a table in
// memory.
const localConnection = () =>
  Rpc.inProcess.client(
    LedgerApi,
    ledgerBackend.pipe(
      Layer.provide([Memory.make(ledgerTable).layer, authz.device]),
    ),
  );

// Ada's Session over `protocol`, as createApp opens it: the Api signed with
// her Name Token and a Std Sync in memory, both closed with the scope.
const sessionOver = (protocol: ReturnType<typeof localConnection>) =>
  Effect.gen(function* () {
    const user = { ...namedUser({ email: 'ada@example.com' }), image: null };
    const token = nameToken.make(user);
    const context = yield* Layer.build(
      Layer.mergeAll(
        protocol,
        Authz.bearer(() => token),
      ),
    );
    const rpc = yield* RpcClient.make(LedgerApi).pipe(
      Effect.provideContext(context),
    );
    const runtime = ManagedRuntime.make(Layer.empty);
    yield* Effect.addFinalizer(() => Effect.promise(() => runtime.dispose()));
    const sync = createStdSync<never>({
      name: `ledger-${user.id}`,
      runtime,
      store: Sync.memory(),
    });
    yield* Effect.addFinalizer(() => Effect.promise(() => sync.dispose()));
    const status = yield* SubscriptionRef.make<SessionStatus>({
      state: 'verified',
      lastVerifiedAt: new Date(),
    });
    return yield* ledgerSession.open({
      account: { user, token },
      apis: { ledger: rpc },
      sync,
      status,
    });
  });

const sleep = (ms: number) => Effect.runPromise(Effect.sleep(ms));

it.each([0, 20, 200])(
  'an Undo %i ms after a delete brings the Entry back, here and on the Backend',
  async (wait) => {
    const open = sessionOver(localConnection());
    const scope = Effect.runSync(Scope.make());
    const session = await Effect.runPromise(Scope.provide(open, scope));
    await session.sample(true);
    await session.entries.preload();
    await vi.waitFor(() => expect(session.entries.size).toBeGreaterThan(0), {
      timeout: 5000,
    });
    // As a screen holds it: the row the live query gave.
    const [entry] = [...session.entries.values()];

    session.entries.delete(entry!.id);
    await sleep(wait);
    session.entries.insert(entry!);
    await sleep(300);

    // A second device reads only what the Backend kept.
    const there = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const other = yield* open;
          yield* Effect.promise(() => other.entries.preload());
          // Its first read from the Backend lands after the copy's.
          yield* Effect.sleep('300 millis');
          return other.entries.has(entry!.id);
        }),
      ),
    );
    expect(session.entries.has(entry!.id)).toBe(true);
    expect(there).toBe(true);
    await Effect.runPromise(Scope.close(scope, { _tag: 'Success' } as never));
  },
);

it.each([0, 20, 200])(
  'deleting again %i ms after an Undo deletes it, here and on the Backend',
  async (wait) => {
    const open = sessionOver(localConnection());
    const scope = Effect.runSync(Scope.make());
    const session = await Effect.runPromise(Scope.provide(open, scope));
    await session.sample(true);
    await session.entries.preload();
    await vi.waitFor(() => expect(session.entries.size).toBeGreaterThan(0), {
      timeout: 5000,
    });
    const [entry] = [...session.entries.values()];

    session.entries.delete(entry!.id);
    await sleep(20);
    session.entries.insert(entry!);
    await sleep(wait);
    session.entries.delete(entry!.id);
    await sleep(300);

    const there = await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const other = yield* open;
          yield* Effect.promise(() => other.entries.preload());
          yield* Effect.sleep('300 millis');
          return other.entries.has(entry!.id);
        }),
      ),
    );
    expect(session.entries.has(entry!.id)).toBe(false);
    expect(there).toBe(false);
    await Effect.runPromise(Scope.close(scope, { _tag: 'Success' } as never));
  },
);
