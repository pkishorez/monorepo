import 'fake-indexeddb/auto';
import { Deferred, Effect, Fiber } from 'effect';
import { CodeReplica } from '@kestack/connect/code';
import { Store } from '@kestack/std-toolkit/replica';
import { Store as IdbStore } from '@kestack/std-toolkit/replica/idb';
import { describe, expect, it } from 'vitest';
import { sync, Sync, syncIdb } from '../index.ts';

/*
 * Each Connection's records in its own Store, under its database's sync
 * prefix: one Connection's never shows another's, of its Account or another;
 * pruning keeps each Connection's own Instance and drops an older
 * projection's; and a Connection forgotten is stopped in another tab still
 * reading it, then deleted, and no other.
 */

/** The database of a Connection's Instance of a Replica. */
const at = (accountId: string, connectionId: string, replica?: string) =>
  `${sync(accountId, connectionId)}${replica ?? CodeReplica.instanceName(connectionId)}`;

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

/** What a Connection's Store lists. */
const listed = (accountId: string, connectionId: string) =>
  run(
    Effect.flatMap(Sync, (sync) =>
      Effect.flatMap(Store, (store) => store.list).pipe(
        Effect.provide(sync.store(accountId, connectionId)),
      ),
    ),
  );

describe('Sync', () => {
  it('keeps each Connection’s records in its own Store', async () => {
    await create(at('a1', 'm1'));
    await create(at('a1', 'm2'));
    await create(at('a2', 'm1'));
    expect(await listed('a1', 'm1')).toEqual([
      { replica: CodeReplica.name, key: 'm1' },
    ]);
    expect(await listed('a1', 'm2')).toEqual([
      { replica: CodeReplica.name, key: 'm2' },
    ]);
    // The same Connection id, of another Account: its own Store too.
    expect(await listed('a2', 'm1')).toEqual([
      { replica: CodeReplica.name, key: 'm1' },
    ]);
  });

  it('keeps each Connection’s Store to its own Instance', async () => {
    await create(at('a3', 'm3'));
    await create(at('a3', 'm3', 'ai-m1·m3'));
    await create(at('a3', 'm4', 'ai-m1·m4'));
    await run(Effect.flatMap(Sync, (sync) => sync.prune('a3', ['m3'])));
    const left = await databases();
    expect(left).toContain(at('a3', 'm3'));
    expect(left).not.toContain(at('a3', 'm3', 'ai-m1·m3'));
    // A Connection not named is left for Storage.
    expect(left).toContain(at('a3', 'm4', 'ai-m1·m4'));
  });

  it('stops another tab still reading a Connection it drops, and drops no other', async () => {
    const name = CodeReplica.instanceName('m7');
    await create(at('a7', 'm7'));
    await create(at('a7', 'm8'));
    await run(
      Effect.gen(function* () {
        const opened = yield* Deferred.make<void>();
        // Another tab, reading the Connection.
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
          sync.drop({
            _tag: 'Connection',
            accountId: 'a7',
            connectionId: 'm7',
          }),
        );
        yield* Fiber.join(other).pipe(Effect.timeout('1 second'));
      }),
    );
    const left = await databases();
    expect(left).not.toContain(at('a7', 'm7'));
    expect(left).toContain(at('a7', 'm8'));
  });
});
