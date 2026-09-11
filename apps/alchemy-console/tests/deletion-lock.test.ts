import { Effect } from 'effect';
import { expect, it } from 'vite-plus/test';
import { makeNodeSQLite } from 'std-toolkit/db/sqlite/node';
import {
  DeletionLock,
  makeDeletionLock,
} from '../src/server/storage/deletion-lock/index.ts';

it('allows one deletion per target and prevents an old owner releasing a newer lease', async () => {
  const database = makeNodeSQLite({ path: ':memory:' });
  const locks = makeDeletionLock(database);
  try {
    await Effect.runPromise(
      Effect.gen(function* () {
        yield* locks.setup;
        const lock = yield* DeletionLock;
        expect(yield* lock.acquire('stage', 'first')).toBe(true);
        expect(yield* lock.acquire('stage', 'second')).toBe(false);
        expect(yield* lock.acquire('another-stage', 'second')).toBe(true);
        yield* lock.release('stage', 'second');
        expect(yield* lock.acquire('stage', 'third')).toBe(false);
        yield* database.run(
          'UPDATE alchemy_stage_deletion_lock SET expires_at = 0 WHERE target = ?',
          ['stage'],
        );
        expect(yield* lock.acquire('stage', 'second')).toBe(true);
        yield* lock.release('stage', 'first');
        expect(yield* lock.acquire('stage', 'third')).toBe(false);
        yield* lock.release('stage', 'second');
        expect(yield* lock.acquire('stage', 'third')).toBe(true);
      }).pipe(Effect.provide(locks.layer)),
    );
  } finally {
    database.close?.();
  }
});
