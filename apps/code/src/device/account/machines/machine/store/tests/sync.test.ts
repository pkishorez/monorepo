import 'fake-indexeddb/auto';
import { Deferred, Effect, Fiber } from 'effect';
import { CodeReplica } from '@kestack/connect/code';
import { Store } from '@kestack/std-toolkit/replica';
import { Store as IdbStore } from '@kestack/std-toolkit/replica/idb';
import { describe, expect, it } from 'vitest';
import { sync, Sync, syncIdb } from '../index.ts';

/*
 * Each Machine's records in its own Store, under its database's sync
 * prefix: one Machine's never shows another's, of its Account or another;
 * pruning keeps each Machine's own Instance and drops an older
 * projection's; and a Machine forgotten is stopped in another tab still
 * reading it, then deleted, and no other.
 */

/** The database of a Machine's Instance of a Replica. */
const at = (accountId: string, machineId: string, replica?: string) =>
  `${sync(accountId, machineId)}${replica ?? CodeReplica.instanceName(machineId)}`;

const create = (name: string) =>
  new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
  });

const databases = async () =>
  (await indexedDB.databases())
    .flatMap(({ name }) => (name === undefined ? [] : [name]))
    .sort();

const run = <A>(effect: Effect.Effect<A, unknown, Sync>) =>
  Effect.runPromise(effect.pipe(Effect.provide(syncIdb)));

/** What a Machine's Store lists. */
const listed = (accountId: string, machineId: string) =>
  run(
    Effect.flatMap(Sync, (sync) =>
      Effect.flatMap(Store, (store) => store.list).pipe(
        Effect.provide(sync.store(accountId, machineId)),
      ),
    ),
  );

describe('Sync', () => {
  it('keeps each Machine’s records in its own Store', async () => {
    await create(at('a1', 'm1'));
    await create(at('a1', 'm2'));
    await create(at('a2', 'm1'));
    expect(await listed('a1', 'm1')).toEqual([
      { replica: CodeReplica.name, key: 'm1' },
    ]);
    expect(await listed('a1', 'm2')).toEqual([
      { replica: CodeReplica.name, key: 'm2' },
    ]);
    // The same Machine id, of another Account: its own Store too.
    expect(await listed('a2', 'm1')).toEqual([
      { replica: CodeReplica.name, key: 'm1' },
    ]);
  });

  it('keeps each Machine’s Store to its own Instance', async () => {
    await create(at('a3', 'm3'));
    await create(at('a3', 'm3', 'ai-m1·m3'));
    await create(at('a3', 'm4', 'ai-m1·m4'));
    await run(Effect.flatMap(Sync, (sync) => sync.prune('a3', ['m3'])));
    const left = await databases();
    expect(left).toContain(at('a3', 'm3'));
    expect(left).not.toContain(at('a3', 'm3', 'ai-m1·m3'));
    // A Machine not named is left for Storage.
    expect(left).toContain(at('a3', 'm4', 'ai-m1·m4'));
  });

  it('stops another tab still reading a Machine it drops, and drops no other', async () => {
    const name = CodeReplica.instanceName('m7');
    await create(at('a7', 'm7'));
    await create(at('a7', 'm8'));
    await run(
      Effect.gen(function* () {
        const opened = yield* Deferred.make<void>();
        // Another tab, reading the Machine.
        const other = yield* Effect.forkChild(
          Effect.scoped(
            Effect.gen(function* () {
              const space = yield* (yield* Store).open(name);
              yield* Deferred.succeed(opened, undefined);
              yield* space.removed;
            }),
          ).pipe(Effect.provide(IdbStore.idb({ prefix: sync('a7', 'm7') }))),
        );
        yield* Deferred.await(opened);
        yield* Effect.flatMap(Sync, (sync) =>
          sync.drop({ _tag: 'Machine', accountId: 'a7', machineId: 'm7' }),
        );
        yield* Fiber.join(other).pipe(Effect.timeout('1 second'));
      }),
    );
    const left = await databases();
    expect(left).not.toContain(at('a7', 'm7'));
    expect(left).toContain(at('a7', 'm8'));
  });
});
