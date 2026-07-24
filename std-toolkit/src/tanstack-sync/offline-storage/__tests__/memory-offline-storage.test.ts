import { Effect } from 'effect';
import { describe, expect } from 'vitest';
import {
  moreCoverageDomain,
  moreCoverageTest as it,
} from '../../../../laymos/more-coverage.js';
import { memoryOfflineStorage } from '../memory-offline-storage.js';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));

moreCoverageDomain('TanStack Sync', () => {
  describe('Offline storage', () => {
    describe('Memory', () => {
      describe('Behavior', () => {
        itEffect('isolates groups and clones values on put and get', () =>
          Effect.gen(function* () {
            const storage = memoryOfflineStorage();
            const users = storage.group('sot/users');
            const posts = storage.group('sot/posts');
            const user = { id: 'user-1', nested: { name: 'Ada' } };

            yield* users.put('user-1', user);
            user.nested.name = 'Grace';
            yield* posts.put('user-1', { id: 'post-1' });

            const stored = yield* users.get<typeof user>('user-1');
            expect(stored).toEqual({ id: 'user-1', nested: { name: 'Ada' } });

            stored!.nested.name = 'Katherine';
            const reread = yield* users.get<typeof user>('user-1');
            const post = yield* posts.get<{ id: string }>('user-1');

            expect(reread).toEqual({ id: 'user-1', nested: { name: 'Ada' } });
            expect(post).toEqual({ id: 'post-1' });
          }),
        );

        itEffect('clones getAll results and applies putMany atomically', () =>
          Effect.gen(function* () {
            const group = memoryOfflineStorage().group('sot/users');

            yield* group.put('existing', { id: 'existing', name: 'Ada' });
            yield* group.putMany([]);

            const before = yield* group.getAll<{ id: string; name: string }>();
            before[0]!.value.name = 'Grace';

            const unchanged = yield* group.get<{ id: string; name: string }>(
              'existing',
            );
            expect(unchanged).toEqual({ id: 'existing', name: 'Ada' });

            const error = yield* group
              .putMany<unknown>([
                { key: 'next', value: { id: 'next', name: 'Katherine' } },
                { key: 'bad', value: () => 'not cloneable' },
              ])
              .pipe(Effect.flip);

            expect(error.operation).toBe('putMany');
            expect(yield* group.get('next')).toBeNull();
            expect(yield* group.get('bad')).toBeNull();
            expect(yield* group.get('existing')).toEqual({
              id: 'existing',
              name: 'Ada',
            });
          }),
        );
      });
    });
  });
});
