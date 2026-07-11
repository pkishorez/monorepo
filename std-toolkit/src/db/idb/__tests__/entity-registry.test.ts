import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { EntityESchema, SingleEntityESchema } from '../../../eschema/index.js';
import { Effect, Layer, Schema } from 'effect';
import { Broadcaster } from '../../../core/index.js';
import {
  IdbTable,
  IdbEntity,
  IdbSingleEntity,
  EntityRegistry,
  IdbDB,
  idbLayer,
  type EntityType,
} from '../index.js';

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
const uniqueDbName = () => `idb-entity-registry-test-${++dbCounter}`;

const provided = <A, E>(
  layer: Layer.Layer<IdbDB>,
  effect: Effect.Effect<A, E, IdbDB>,
) => effect.pipe(Effect.provide(layer));

const makeRegistry = () => {
  const layer = idbLayer(uniqueDbName(), 'std_data');
  const table = IdbTable.make()
    .primary('pk', 'sk')
    .index('IDX1', 'IDX1PK', 'IDX1SK')
    .build();

  const userEntity = IdbEntity.make(table)
    .eschema(UserSchema)
    .primary()
    .build();
  const postEntity = IdbEntity.make(table)
    .eschema(PostSchema)
    .primary({ pk: ['authorId'] })
    .index('IDX1', 'byAuthor', { pk: ['authorId'] })
    .build();
  const appConfig = IdbSingleEntity.make(table)
    .eschema(configSchema)
    .default({ theme: 'light' });

  const registry = EntityRegistry.make(table)
    .register(userEntity)
    .register(postEntity)
    .registerSingle(appConfig)
    .build();

  return { layer, table, registry, userEntity, postEntity, appConfig };
};

// A stub Broadcaster layer recording every broadcast call in order.
const makeStubBroadcasterLayer = () => {
  const broadcasts: EntityType<unknown>[] = [];
  const layer = Layer.succeed(Broadcaster, {
    emit: () => {},
    broadcast: (value: EntityType<unknown>) => {
      broadcasts.push(value);
    },
    subscribe: () => {},
    unsubscribe: () => {},
  });
  return { layer, broadcasts };
};

describe('EntityRegistry', () => {
  describe('register / entity / singleEntity', () => {
    itEffect('routes to the correct registered entity by name', () => {
      const { layer, table, registry } = makeRegistry();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();

          expect(registry.entityNames.sort()).toEqual(
            ['AppConfig', 'Post', 'User'].sort(),
          );

          const inserted = yield* registry.entity('User').insert({
            userId: 'user-1',
            email: 'ada@example.com',
            name: 'Ada',
          });
          expect(inserted.value.userId).toBe('user-1');

          const fetchedUser = yield* registry.entity('User').get({
            userId: 'user-1',
          });
          expect(fetchedUser!.value.name).toBe('Ada');

          const insertedPost = yield* registry.entity('Post').insert({
            authorId: 'user-1',
            postId: 'post-1',
            title: 'Hello',
          });
          expect(insertedPost.value.postId).toBe('post-1');

          const config = yield* registry.singleEntity('AppConfig').get();
          expect(config.value.theme).toBe('light');
        }),
      );
    });
  });

  describe('setup', () => {
    itEffect('creates the store and all derived indexes idempotently', () => {
      const { layer, registry } = makeRegistry();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* registry.setup();
          // Calling again converges without error (auto-versioned setup).
          yield* registry.setup();

          const inserted = yield* registry.entity('Post').insert({
            authorId: 'author-x',
            postId: 'post-x',
            title: 'X',
          });
          expect(inserted.value.postId).toBe('post-x');

          const result = yield* registry.entity('Post').query('byAuthor', {
            pk: { authorId: 'author-x' },
            sk: { '>=': null },
          });
          expect(result.items).toHaveLength(1);
        }),
      );
    });
  });

  describe('transact', () => {
    itEffect(
      'applies neither write when one op fails its optimistic check',
      () => {
        const { layer, registry, userEntity, postEntity } = makeRegistry();

        return provided(
          layer,
          Effect.gen(function* () {
            yield* registry.setup();

            yield* postEntity.insert({
              authorId: 'author-1',
              postId: 'post-stale',
              title: 'Before',
            });

            // Freeze the "read" phase: this op embeds expectedU = the _u
            // that is currently stored, into the not-yet-applied write.
            const staleUpdateOp = yield* postEntity.updateOp(
              { authorId: 'author-1', postId: 'post-stale' },
              { title: 'After' },
            );
            if (staleUpdateOp.write.type !== 'put') {
              throw new Error('expected a put op');
            }
            const { pk, sk } = staleUpdateOp.write.record;

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

            const error = yield* registry
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
        const { layer, registry, userEntity, postEntity } = makeRegistry();
        const { layer: broadcasterLayer, broadcasts } =
          makeStubBroadcasterLayer();

        return provided(
          layer,
          Effect.gen(function* () {
            yield* registry.setup();

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

            yield* registry
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
            expect(broadcasts[0]).toBe(insertUserOp.entity);
            expect(broadcasts[1]).toBe(insertPostOp.entity);
          }),
        );
      },
    );

    itEffect('broadcasts nothing when the transaction fails', () => {
      const { layer, registry, userEntity, postEntity } = makeRegistry();
      const { layer: broadcasterLayer, broadcasts } =
        makeStubBroadcasterLayer();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* registry.setup();

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

          const error = yield* registry
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
  });
});
