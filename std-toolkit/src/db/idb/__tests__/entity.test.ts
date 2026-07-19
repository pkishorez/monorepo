import 'fake-indexeddb/auto';
import { describe, it, expect } from 'vitest';

const itEffect = <A, E>(name: string, fn: () => Effect.Effect<A, E, never>) =>
  it(name, () => Effect.runPromise(fn()));
import { EntityESchema } from '../../../eschema/index.js';
import { Effect, Layer, Schema } from 'effect';
import { IdbDB } from '../src/db.js';
import { idbLayer } from '../src/layer.js';
import { IdbTable } from '../src/idb-table.js';

// ─── Test Schemas ────────────────────────────────────────────────────────────

const UserSchema = EntityESchema.make('User', 'userId', {
  email: Schema.String,
  name: Schema.String,
}).build();

const PostSchema = EntityESchema.make('Post', 'postId', {
  authorId: Schema.String,
  title: Schema.String,
}).build();

const DocSchema = EntityESchema.make('Doc', 'docId', {
  title: Schema.String,
})
  .evolve('v2', { subtitle: Schema.String }, (v) => ({
    ...v,
    subtitle: 'untitled',
  }))
  .build();

let dbCounter = 0;
const uniqueDbName = () => `idb-entity-test-${++dbCounter}`;

const provided = <A, E>(
  layer: Layer.Layer<IdbDB>,
  effect: Effect.Effect<A, E, IdbDB>,
) => effect.pipe(Effect.provide(layer));

describe('IdbEntity', () => {
  it('rejects _u in primary partition key derivation', () => {
    const table = IdbTable.make().primary('pk', 'sk').build();

    expect(() =>
      (table.entity(UserSchema) as any).primary({ pk: ['_u'] }),
    ).toThrow('Primary partition key derivation cannot include "_u"');
  });

  describe('insert / get', () => {
    itEffect('roundtrips a value with equality and stamped meta', () => {
      const layer = idbLayer(uniqueDbName(), 'std_data');
      const table = IdbTable.make().primary('pk', 'sk').build();
      const userEntity = table.entity(UserSchema).primary().build();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();

          const inserted = yield* userEntity.insert({
            userId: 'user-1',
            email: 'ada@example.com',
            name: 'Ada',
          });

          expect(inserted.value).toEqual({
            _v: 'v1',
            userId: 'user-1',
            email: 'ada@example.com',
            name: 'Ada',
          });
          expect(inserted.meta._e).toBe('User');
          expect(inserted.meta._v).toBe('v1');
          expect(inserted.meta._d).toBe(false);
          expect(inserted.meta._u).toBeTruthy();

          // get() decodes through the eschema, which — same as
          // SQLiteEntity — returns just the entity fields (no `_v`);
          // insert() separately stamps `_v` onto its returned value.
          const fetched = yield* userEntity.get({ userId: 'user-1' });
          expect(fetched).toEqual({
            value: {
              userId: 'user-1',
              email: 'ada@example.com',
              name: 'Ada',
            },
            meta: inserted.meta,
          });
        }),
      );
    });

    itEffect('returns null for a non-existent entity', () => {
      const layer = idbLayer(uniqueDbName(), 'std_data');
      const table = IdbTable.make().primary('pk', 'sk').build();
      const userEntity = table.entity(UserSchema).primary().build();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          const result = yield* userEntity.get({ userId: 'nope' });
          expect(result).toBeNull();
        }),
      );
    });

    itEffect('fails on duplicate primary key', () => {
      const layer = idbLayer(uniqueDbName(), 'std_data');
      const table = IdbTable.make().primary('pk', 'sk').build();
      const userEntity = table.entity(UserSchema).primary().build();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          yield* userEntity.insert({
            userId: 'dup',
            email: 'a@example.com',
            name: 'A',
          });

          const error = yield* userEntity
            .insert({ userId: 'dup', email: 'b@example.com', name: 'B' })
            .pipe(Effect.flip);

          expect(error.code).toBe('conditionFailed');
        }),
      );
    });
  });

  describe('update', () => {
    itEffect(
      'changes the value and strictly increases _u lexicographically',
      () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const table = IdbTable.make().primary('pk', 'sk').build();
        const userEntity = table.entity(UserSchema).primary().build();

        return provided(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            const inserted = yield* userEntity.insert({
              userId: 'user-2',
              email: 'before@example.com',
              name: 'Before',
            });

            const updated = yield* userEntity.update(
              { userId: 'user-2' },
              { name: 'After' },
            );

            expect(updated.value.name).toBe('After');
            expect(updated.value.email).toBe('before@example.com');
            expect(updated.meta._u > inserted.meta._u).toBe(true);
          }),
        );
      },
    );

    itEffect('fails with noItemToUpdate for a non-existent entity', () => {
      const layer = idbLayer(uniqueDbName(), 'std_data');
      const table = IdbTable.make().primary('pk', 'sk').build();
      const userEntity = table.entity(UserSchema).primary().build();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          const error = yield* userEntity
            .update({ userId: 'nope' }, { name: 'X' })
            .pipe(Effect.flip);
          expect(error.code).toBe('noItemToUpdate');
        }),
      );
    });

    itEffect(
      'fails with conditionFailed when a concurrent writer changed _u between read and commit',
      () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const table = IdbTable.make().primary('pk', 'sk').build();
        const userEntity = table.entity(UserSchema).primary().build();

        return provided(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* userEntity.insert({
              userId: 'racey',
              email: 'race@example.com',
              name: 'Before',
            });

            // Freeze the "read" phase: this embeds expectedU = the _u we
            // just read into the returned (not-yet-applied) write op.
            const op = yield* userEntity.updateOp(
              { userId: 'racey' },
              { name: 'From op' },
            );

            // Simulate a second browser tab winning the race by writing
            // directly through IdbDB before our op is applied.
            const db = yield* IdbDB;
            const { Item } = yield* table.getItem({ pk: 'User', sk: 'racey' });
            yield* db.put({ ...Item!, _u: 'CONCURRENT0000000000000000' });

            const error = yield* db
              .transact([op.apply('01RACEULID0000000000000000').write])
              .pipe(Effect.flip);
            expect(error.code).toBe('conditionFailed');

            // No op was applied: the concurrent write's value stands.
            const current = yield* userEntity.get({ userId: 'racey' });
            expect(current!.value.name).toBe('Before');
          }),
        );
      },
    );
  });

  describe('delete / hardDelete', () => {
    itEffect(
      'soft-deletes: get still returns the value with meta._d true',
      () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const table = IdbTable.make().primary('pk', 'sk').build();
        const userEntity = table.entity(UserSchema).primary().build();

        return provided(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* userEntity.insert({
              userId: 'del-1',
              email: 'del@example.com',
              name: 'Del',
            });

            const deleted = yield* userEntity.delete({ userId: 'del-1' });
            expect(deleted.meta._d).toBe(true);

            const afterDelete = yield* userEntity.get({ userId: 'del-1' });
            expect(afterDelete).not.toBeNull();
            expect(afterDelete!.meta._d).toBe(true);
            expect(afterDelete!.value.email).toBe('del@example.com');
          }),
        );
      },
    );

    itEffect('fails with noItemToDelete for a non-existent entity', () => {
      const layer = idbLayer(uniqueDbName(), 'std_data');
      const table = IdbTable.make().primary('pk', 'sk').build();
      const userEntity = table.entity(UserSchema).primary().build();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          const error = yield* userEntity
            .delete({ userId: 'nope' })
            .pipe(Effect.flip);
          expect(error.code).toBe('noItemToDelete');
        }),
      );
    });

    itEffect('updates a tombstone without restoring it', () => {
      const layer = idbLayer(uniqueDbName(), 'std_data');
      const table = IdbTable.make().primary('pk', 'sk').build();
      const userEntity = table.entity(UserSchema).primary().build();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          yield* userEntity.insert({
            userId: 'restore-1',
            email: 'restore@example.com',
            name: 'Before',
          });
          yield* userEntity.delete({ userId: 'restore-1' });

          const updated = yield* userEntity.update(
            { userId: 'restore-1' },
            { name: 'After' },
          );
          expect(updated.value.name).toBe('After');
          expect(updated.meta._d).toBe(true);
        }),
      );
    });

    itEffect('hardDelete removes the record entirely', () => {
      const layer = idbLayer(uniqueDbName(), 'std_data');
      const table = IdbTable.make().primary('pk', 'sk').build();
      const userEntity = table.entity(UserSchema).primary().build();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          yield* userEntity.insert({
            userId: 'hard-1',
            email: 'hard@example.com',
            name: 'Hard',
          });

          yield* userEntity.hardDelete({ userId: 'hard-1' });

          const result = yield* userEntity.get({ userId: 'hard-1' });
          expect(result).toBeNull();
        }),
      );
    });
  });

  describe('query', () => {
    itEffect('queries by primary index and decodes values', () => {
      const layer = idbLayer(uniqueDbName(), 'std_data');
      const table = IdbTable.make()
        .primary('pk', 'sk')
        .index('IDX1', 'IDX1PK', 'IDX1SK')
        .build();
      const postEntity = table
        .entity(PostSchema)
        .primary({ pk: ['authorId'] })
        .index('IDX1', 'byAuthor', { pk: ['authorId'] })
        .build();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          yield* postEntity.insert({
            authorId: 'author-1',
            postId: 'post-a',
            title: 'A',
          });
          yield* postEntity.insert({
            authorId: 'author-1',
            postId: 'post-b',
            title: 'B',
          });

          const result = yield* postEntity.query('primary', {
            pk: { authorId: 'author-1' },
            sk: { '>=': null },
          });

          const ids = result.items.map((i) => i.value.postId);
          expect(ids).toEqual(['post-a', 'post-b']);
        }),
      );
    });

    itEffect('queries by secondary index', () => {
      const layer = idbLayer(uniqueDbName(), 'std_data');
      const table = IdbTable.make()
        .primary('pk', 'sk')
        .index('IDX1', 'IDX1PK', 'IDX1SK')
        .build();
      const userEntity = table
        .entity(UserSchema)
        .primary()
        .index('IDX1', 'byEmail', { pk: ['email'] })
        .build();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          yield* userEntity.insert({
            userId: 'idx-1',
            email: 'alpha@example.com',
            name: 'Alpha',
          });

          const result = yield* userEntity.query('byEmail', {
            pk: { email: 'alpha@example.com' },
            sk: { '>=': null },
          });

          expect(result.items).toHaveLength(1);
          expect(result.items[0]!.value.name).toBe('Alpha');
        }),
      );
    });

    itEffect(
      'includes soft-deleted tombstones, matching SQLiteEntity (query does not filter _d)',
      () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const table = IdbTable.make().primary('pk', 'sk').build();
        const userEntity = table.entity(UserSchema).primary().build();

        return provided(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            yield* userEntity.insert({
              userId: 'tomb-1',
              email: 'tomb@example.com',
              name: 'Tomb',
            });
            yield* userEntity.delete({ userId: 'tomb-1' });

            const result = yield* userEntity.query('primary', {
              sk: { '>=': null },
            });

            expect(result.items).toHaveLength(1);
            expect(result.items[0]!.meta._d).toBe(true);
          }),
        );
      },
    );
  });

  describe('auto-migration on get', () => {
    itEffect('migrates a value stored at an old eschema version', () => {
      const layer = idbLayer(uniqueDbName(), 'std_data');
      const table = IdbTable.make().primary('pk', 'sk').build();
      const docEntity = table.entity(DocSchema).primary().build();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();

          // Bypass the entity layer to plant a v1-shaped record directly,
          // as if it had been written before the v2 evolution existed.
          const db = yield* IdbDB;
          yield* db.put({
            pk: 'Doc',
            sk: 'doc-1',
            _data: { docId: 'doc-1', title: 'Old Title' },
            _e: 'Doc',
            _v: 'v1',
            _u: '01ARZ3NDEKTSV4RRFFQ69G5FAV',
            _d: false,
          });

          const result = yield* docEntity.get({ docId: 'doc-1' });
          expect(result!.value).toEqual({
            docId: 'doc-1',
            title: 'Old Title',
            subtitle: 'untitled',
          });
          expect(result!.meta._v).toBe('v1');
        }),
      );
    });
  });

  describe('insertOp / updateOp', () => {
    itEffect('insertOp validates and encodes without writing', () => {
      const layer = idbLayer(uniqueDbName(), 'std_data');
      const table = IdbTable.make().primary('pk', 'sk').build();
      const userEntity = table.entity(UserSchema).primary().build();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();

          const op = yield* userEntity.insertOp({
            userId: 'op-1',
            email: 'op@example.com',
            name: 'Op',
          });

          const applied = op.apply('01OPTEST000000000000000000');
          expect(applied.write.type).toBe('put');
          expect(applied.entity.value).toMatchObject({ userId: 'op-1' });

          const notYetWritten = yield* userEntity.get({ userId: 'op-1' });
          expect(notYetWritten).toBeNull();

          const db = yield* IdbDB;
          yield* db.transact([applied.write]);

          const written = yield* userEntity.get({ userId: 'op-1' });
          expect(written).not.toBeNull();
        }),
      );
    });

    itEffect('updateOp validates, reads and encodes without writing', () => {
      const layer = idbLayer(uniqueDbName(), 'std_data');
      const table = IdbTable.make().primary('pk', 'sk').build();
      const userEntity = table.entity(UserSchema).primary().build();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          yield* userEntity.insert({
            userId: 'op-2',
            email: 'before@example.com',
            name: 'Before',
          });

          const op = yield* userEntity.updateOp(
            { userId: 'op-2' },
            { name: 'After' },
          );

          const applied = op.apply('01OPTEST000000000000000001');
          expect(applied.write.type).toBe('put');
          expect(applied.entity.value).toMatchObject({ name: 'After' });

          const stillBefore = yield* userEntity.get({ userId: 'op-2' });
          expect(stillBefore!.value.name).toBe('Before');

          const db = yield* IdbDB;
          yield* db.transact([applied.write]);

          const afterApply = yield* userEntity.get({ userId: 'op-2' });
          expect(afterApply!.value.name).toBe('After');
        }),
      );
    });

    itEffect(
      'updateOp fails with noItemToUpdate for a non-existent entity',
      () => {
        const layer = idbLayer(uniqueDbName(), 'std_data');
        const table = IdbTable.make().primary('pk', 'sk').build();
        const userEntity = table.entity(UserSchema).primary().build();

        return provided(
          layer,
          Effect.gen(function* () {
            yield* table.setup();
            const error = yield* userEntity
              .updateOp({ userId: 'nope' }, { name: 'X' })
              .pipe(Effect.flip);
            expect(error.code).toBe('noItemToUpdate');
          }),
        );
      },
    );
  });

  describe('dangerouslyRemoveAllItems', () => {
    itEffect('clears all rows from the shared table', () => {
      const layer = idbLayer(uniqueDbName(), 'std_data');
      const table = IdbTable.make().primary('pk', 'sk').build();
      const userEntity = table.entity(UserSchema).primary().build();

      return provided(
        layer,
        Effect.gen(function* () {
          yield* table.setup();
          yield* userEntity.insert({
            userId: 'clear-1',
            email: 'a@example.com',
            name: 'A',
          });
          yield* userEntity.insert({
            userId: 'clear-2',
            email: 'b@example.com',
            name: 'B',
          });

          const result = yield* table.dangerouslyRemoveAllItems(
            'I KNOW WHAT I AM DOING',
          );
          expect(result.itemsDeleted).toBe(2);

          const remaining = yield* userEntity.query('primary', {
            sk: { '>=': null },
          });
          expect(remaining.items).toHaveLength(0);
        }),
      );
    });
  });
});
