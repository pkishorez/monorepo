import 'fake-indexeddb/auto';
import { describe, expect } from 'vitest';
import {
  moreCoverageDomain,
  moreCoverageTest as it,
} from '../../../../laymos/more-coverage.js';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { EntityESchema, SingleEntityESchema } from '../../../eschema/index.js';
import { Cause, Effect, Exit, Layer, Schema } from 'effect';
import { Broadcaster } from '../../../core/index.js';
import { IdbTable, IdbDB, idbLayer, type EntityType } from '../src/index.js';

// ─── Test Schemas ────────────────────────────────────────────────────────────

const UserSchema = EntityESchema.make('User', 'userId', {
  email: Schema.String,
  name: Schema.String,
}).build();

const PostSchema = EntityESchema.make('Post', 'postId', {
  authorId: Schema.String,
  title: Schema.String,
}).build();

const configSchema = SingleEntityESchema.make('AppConfig', {
  theme: Schema.String,
}).build();

let dbCounter = 0;
const uniqueDbName = () => `idb-table-entities-test-${++dbCounter}`;

const provided = <A, E>(
  layer: Layer.Layer<IdbDB>,
  effect: Effect.Effect<A, E, IdbDB>,
) => effect.pipe(Effect.provide(layer));

const makeTable = () => {
  const layer = idbLayer(uniqueDbName(), 'std_data');
  const table = IdbTable.make()
    .primary('pk', 'sk')
    .index('IDX1', 'IDX1PK', 'IDX1SK')
    .build();

  const userEntity = table.entity(UserSchema).primary().build();
  const postEntity = table
    .entity(PostSchema)
    .primary({ pk: ['authorId'] })
    .index('IDX1', 'byAuthor', { pk: ['authorId'] })
    .build();
  const appConfig = table.singleEntity(configSchema).default({
    theme: 'light',
  });

  return { layer, table, userEntity, postEntity, appConfig };
};

// A stub Broadcaster layer recording every broadcast call in order.
const makeStubBroadcasterLayer = () => {
  const broadcasts: EntityType<unknown>[] = [];
  const layer = Layer.succeed(Broadcaster, {
    broadcast: (values: EntityType<unknown>[]) => {
      broadcasts.push(...values);
    },
  });
  return { layer, broadcasts };
};

moreCoverageDomain('IDB', () => {
  describe('Table', () => {
    describe('Entities', () => {
      describe('entity / singleEntity definition', () => {
        itEffect(
          'entities defined from the table are fully operational',
          () => {
            const { layer, table, userEntity, postEntity, appConfig } =
              makeTable();

            return provided(
              layer,
              Effect.gen(function* () {
                yield* table.setup();

                const inserted = yield* userEntity.insert({
                  userId: 'user-1',
                  email: 'ada@example.com',
                  name: 'Ada',
                });
                expect(inserted.value.userId).toBe('user-1');

                const fetchedUser = yield* userEntity.get({ userId: 'user-1' });
                expect(fetchedUser!.value.name).toBe('Ada');

                const insertedPost = yield* postEntity.insert({
                  authorId: 'user-1',
                  postId: 'post-1',
                  title: 'Hello',
                });
                expect(insertedPost.value.postId).toBe('post-1');

                const config = yield* appConfig.get();
                expect(config.value.theme).toBe('light');
              }),
            );
          },
        );

        it('rejects duplicate entity names on the same table', () => {
          const { table } = makeTable();
          expect(() => table.entity(UserSchema).primary().build()).toThrow(
            'Entity "User" is already defined on this table',
          );
        });

        it('rejects duplicate single entity names on the same table', () => {
          const { table } = makeTable();
          expect(() =>
            table.singleEntity(configSchema).default({ theme: 'dark' }),
          ).toThrow('Entity "AppConfig" is already defined on this table');
        });
      });

      describe('setup', () => {
        itEffect(
          'creates the store and all derived indexes idempotently',
          () => {
            const { layer, table, postEntity } = makeTable();

            return provided(
              layer,
              Effect.gen(function* () {
                yield* table.setup();
                // Calling again converges without error (auto-versioned setup).
                yield* table.setup();

                const inserted = yield* postEntity.insert({
                  authorId: 'author-x',
                  postId: 'post-x',
                  title: 'X',
                });
                expect(inserted.value.postId).toBe('post-x');

                const result = yield* postEntity.query('byAuthor', {
                  pk: { authorId: 'author-x' },
                  sk: { '>=': null },
                });
                expect(result.items).toHaveLength(1);
              }),
            );
          },
        );
      });

      describe('transact', () => {
        itEffect('stamps transaction cursors when writes are applied', () => {
          const { layer, table, postEntity } = makeTable();

          return provided(
            layer,
            Effect.gen(function* () {
              yield* table.setup();
              const delayedOp = yield* postEntity.insertOp({
                authorId: 'cursor-author',
                postId: 'delayed',
                title: 'Delayed',
              });
              const intervening = yield* postEntity.insert({
                authorId: 'cursor-author',
                postId: 'intervening',
                title: 'Intervening',
              });

              const [written] = yield* table.transact([delayedOp]);

              expect(written!.meta._u > intervening.meta._u).toBe(true);
              const result = yield* postEntity.query('byAuthor', {
                pk: { authorId: 'cursor-author' },
                sk: { '>': intervening.meta._u },
              });
              expect(result.items.map((item) => item.value.postId)).toEqual([
                'delayed',
              ]);
            }),
          );
        });

        itEffect(
          'applies neither write when one op fails its optimistic check',
          () => {
            const { layer, table, userEntity, postEntity } = makeTable();

            return provided(
              layer,
              Effect.gen(function* () {
                yield* table.setup();

                yield* postEntity.insert({
                  authorId: 'author-1',
                  postId: 'post-stale',
                  title: 'Before',
                });

                // Freeze the "read" phase: this op embeds expectedU = the _u
                // that is currently stored, into the not-yet-applied write.
                const staleUpdateOp = yield* postEntity.getAndUpdateOp(
                  { authorId: 'author-1', postId: 'post-stale' },
                  { title: 'After' },
                );
                const staleWrite = staleUpdateOp.apply(
                  '01PREVIEW00000000000000000',
                ).write;
                if (staleWrite.type !== 'put') {
                  throw new Error('expected a put op');
                }
                const { pk, sk } = staleWrite.record;

                // Simulate a second browser tab winning the race: it changes
                // the stored record's _u before our op is applied.
                const db = yield* IdbDB;
                const currentRecord = yield* db.get({ pk, sk });
                yield* db.put({
                  ...currentRecord!,
                  _u: 'CONCURRENT0000000000000000',
                });

                const insertOp = yield* userEntity.insertOp({
                  userId: 'user-a',
                  email: 'a@example.com',
                  name: 'A',
                });

                const error = yield* table
                  .transact([insertOp, staleUpdateOp])
                  .pipe(Effect.flip);
                expect(error.code).toBe('conditionFailed');

                const missingUser = yield* userEntity.get({ userId: 'user-a' });
                expect(missingUser).toBeNull();

                const untouchedPost = yield* postEntity.get({
                  authorId: 'author-1',
                  postId: 'post-stale',
                });
                expect(untouchedPost!.value.title).toBe('Before');
              }),
            );
          },
        );

        itEffect(
          'persists and broadcasts both entities in op order on success',
          () => {
            const { layer, table, userEntity, postEntity } = makeTable();
            const { layer: broadcasterLayer, broadcasts } =
              makeStubBroadcasterLayer();

            return provided(
              layer,
              Effect.gen(function* () {
                yield* table.setup();

                const insertUserOp = yield* userEntity.insertOp({
                  userId: 'user-2',
                  email: 'b@example.com',
                  name: 'B',
                });
                const insertPostOp = yield* postEntity.insertOp({
                  authorId: 'user-2',
                  postId: 'post-2',
                  title: 'Hi',
                });

                const written = yield* table
                  .transact([insertUserOp, insertPostOp])
                  .pipe(Effect.provide(broadcasterLayer));

                const user = yield* userEntity.get({ userId: 'user-2' });
                expect(user!.value.name).toBe('B');

                const post = yield* postEntity.get({
                  authorId: 'user-2',
                  postId: 'post-2',
                });
                expect(post!.value.title).toBe('Hi');

                expect(broadcasts).toHaveLength(2);
                expect(broadcasts[0]).toBe(written[0]);
                expect(broadcasts[1]).toBe(written[1]);
              }),
            );
          },
        );

        itEffect('broadcasts nothing when the transaction fails', () => {
          const { layer, table, userEntity, postEntity } = makeTable();
          const { layer: broadcasterLayer, broadcasts } =
            makeStubBroadcasterLayer();

          return provided(
            layer,
            Effect.gen(function* () {
              yield* table.setup();

              yield* userEntity.insert({
                userId: 'dup-user',
                email: 'dup@example.com',
                name: 'Dup',
              });

              // insertOp with expectedU: null on an already-existing key fails
              // its optimistic check inside the native transaction.
              const dupInsertOp = yield* userEntity.insertOp({
                userId: 'dup-user',
                email: 'other@example.com',
                name: 'Other',
              });
              const freshPostOp = yield* postEntity.insertOp({
                authorId: 'dup-user',
                postId: 'post-3',
                title: 'Should not persist',
              });

              const error = yield* table
                .transact([dupInsertOp, freshPostOp])
                .pipe(Effect.provide(broadcasterLayer), Effect.flip);
              expect(error.code).toBe('conditionFailed');

              expect(broadcasts).toHaveLength(0);

              const missingPost = yield* postEntity.get({
                authorId: 'dup-user',
                postId: 'post-3',
              });
              expect(missingPost).toBeNull();
            }),
          );
        });

        itEffect('dies on an op built against a different table', () => {
          const { layer, table } = makeTable();
          const other = makeTable();

          return provided(
            layer,
            Effect.gen(function* () {
              yield* table.setup();

              const foreignOp = yield* other.userEntity.insertOp({
                userId: 'user-x',
                email: 'x@example.com',
                name: 'X',
              });

              const exit = yield* table.transact([foreignOp]).pipe(Effect.exit);
              expect(Exit.isFailure(exit)).toBe(true);
              const defects = Exit.isFailure(exit)
                ? exit.cause.reasons
                    .filter(Cause.isDieReason)
                    .map((r) => r.defect)
                : [];
              expect(String(defects[0])).toContain(
                'was built against a different table',
              );
            }),
          );
        });
      });
    });
  });
});
