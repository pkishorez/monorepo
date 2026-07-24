import './setup.js';
import { Effect } from 'effect';
import { describe, expect, it } from 'vitest';
import { idbStorage } from '../adapters/idb/index.js';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));

let dbCounter = 0;
const dbName = () => `tanstack-sync-offline-storage-${++dbCounter}`;

describe('TanStack Sync', () => {
  describe('Offline storage', () => {
    describe('IDB', () => {
      describe('Behavior', () => {
        it('validates factory options synchronously', () => {
          expect(() => idbStorage({ name: '' })).toThrow();
          expect(() => idbStorage({ name: 'valid', version: 0 })).toThrow();
          expect(() => idbStorage({ name: 'valid', version: 1.5 })).toThrow();
          expect(() => idbStorage({ name: 'valid', version: '' })).toThrow();
        });

        it('constructs without IndexedDB and fails only when an operation runs', async () => {
          const indexedDB = globalThis.indexedDB;
          Reflect.deleteProperty(globalThis, 'indexedDB');
          try {
            const storage = idbStorage({ name: 'missing-idb' });
            await expect(
              Effect.runPromise(storage.group('sot/users').getAll()),
            ).rejects.toThrow();
          } finally {
            Object.defineProperty(globalThis, 'indexedDB', {
              configurable: true,
              value: indexedDB,
            });
          }
        });

        itEffect('isolates groups and reads all entries in one group', () =>
          Effect.gen(function* () {
            const storage = idbStorage({ name: dbName() });
            const users = storage.group('sot/users');
            const posts = storage.group('sot/posts');

            yield* users.putMany([
              { key: 'user-1', value: { id: 'user-1', name: 'Ada' } },
              { key: 'user-2', value: { id: 'user-2', name: 'Grace' } },
            ]);
            yield* posts.put('user-1', { id: 'post-1' });

            expect(yield* users.get('user-1')).toEqual({
              id: 'user-1',
              name: 'Ada',
            });
            expect(yield* posts.get('user-1')).toEqual({ id: 'post-1' });
            expect(yield* users.getAll()).toEqual([
              { key: 'user-1', value: { id: 'user-1', name: 'Ada' } },
              { key: 'user-2', value: { id: 'user-2', name: 'Grace' } },
            ]);

            yield* users.clear();
            expect(yield* users.getAll()).toEqual([]);
            expect(yield* posts.get('user-1')).toEqual({ id: 'post-1' });
          }),
        );

        itEffect(
          'retains data for the same version and resets on version change',
          () =>
            Effect.gen(function* () {
              const name = dbName();

              yield* idbStorage({ name }).group('state/users').put('global', {
                cursor: 'one',
              });

              expect(
                yield* idbStorage({ name }).group('state/users').get('global'),
              ).toEqual({ cursor: 'one' });

              expect(
                yield* idbStorage({ name, version: 2 })
                  .group('state/users')
                  .get('global'),
              ).toBeNull();

              yield* idbStorage({ name, version: 2 })
                .group('state/users')
                .put('global', { cursor: 'two' });

              expect(
                yield* idbStorage({ name, version: 2 })
                  .group('state/users')
                  .get('global'),
              ).toEqual({ cursor: 'two' });
            }),
        );

        itEffect('accepts string data-reset versions', () =>
          Effect.gen(function* () {
            const name = dbName();

            yield* idbStorage({ name, version: 'alpha' })
              .group('state/users')
              .put('global', {
                cursor: 'one',
              });

            expect(
              yield* idbStorage({ name, version: 'alpha' })
                .group('state/users')
                .get('global'),
            ).toEqual({ cursor: 'one' });

            expect(
              yield* idbStorage({ name, version: 'beta' })
                .group('state/users')
                .get('global'),
            ).toBeNull();
          }),
        );

        itEffect('applies root clear and putMany atomically', () =>
          Effect.gen(function* () {
            const storage = idbStorage({ name: dbName() });
            const users = storage.group('sot/users');
            const posts = storage.group('sot/posts');

            yield* users.put('existing', { id: 'existing' });
            yield* posts.put('post-1', { id: 'post-1' });

            const error = yield* users
              .putMany<unknown>([
                { key: 'next', value: { id: 'next' } },
                { key: 'bad', value: () => 'not cloneable' },
              ])
              .pipe(Effect.flip);

            expect(error.operation).toBe('putMany');
            expect(yield* users.get('next')).toBeNull();
            expect(yield* users.get('existing')).toEqual({ id: 'existing' });

            yield* storage.clear();
            expect(yield* users.get('existing')).toBeNull();
            expect(yield* posts.get('post-1')).toBeNull();
          }),
        );
      });
    });
  });
});
