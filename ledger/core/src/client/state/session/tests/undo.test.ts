import { Effect, Scope } from 'effect';
import { localToken, localUser } from '@kstackz/auth-toolkit/clients/auth';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { expect, it, vi } from 'vitest';
import { localConnection } from '../../../../server/backends/local/index.ts';
import { ledgerTable } from '../../../../server/domain/storage/index.ts';
import type { User } from '../../../domain/session/index.ts';
import { openSessions } from '../index.ts';

const sleep = (ms: number) => Effect.runPromise(Effect.sleep(ms));

it.each([0, 20, 200])(
  'an Undo %i ms after a delete brings the Entry back, here and on the Backend',
  async (wait) => {
    const link = {
      connection: localConnection(Memory.make(ledgerTable).layer),
    };
    const who = localUser({ email: 'ada@example.com' }) as unknown as User;
    const open = openSessions(link)(who, localToken.make(who as never));
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
    const link = {
      connection: localConnection(Memory.make(ledgerTable).layer),
    };
    const who = localUser({ email: 'ada@example.com' }) as unknown as User;
    const open = openSessions(link)(who, localToken.make(who as never));
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
