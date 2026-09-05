import { Effect, Fiber, Schema, Stream } from 'effect';
import { describe, expect, it } from 'vitest';
import { defaultBroadcaster } from '../../../core/index.js';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../table/index.js';
import { contractLayer } from '../contract/index.js';
import { makeDeterministicContract } from './deterministic-contract.js';

describe('scan, drift, and reindex', () => {
  it('detects index drift, repairs it without a new _u or broadcast, and clears on the next check', async () => {
    const beforeTable = StdTable.make('drift-test')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();
    const afterTable = StdTable.make('drift-test')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();
    const schema = EntityESchema.make('Note', 'noteId', {
      notebook: Schema.String,
      status: Schema.String,
    }).build();
    const noteBefore = beforeTable
      .entity(schema)
      .primary({ pk: ['notebook'] })
      .build();
    const noteAfter = afterTable
      .entity(schema)
      .primary({ pk: ['notebook'] })
      .index('GSI1', 'byStatus', { pk: ['notebook'], sk: ['status'] })
      .build();

    const deterministic = makeDeterministicContract(beforeTable.logicalName);
    const layer = contractLayer(
      beforeTable.logicalName,
      deterministic.contract,
    );

    const notice = await Effect.runPromise(
      Effect.gen(function* () {
        yield* noteBefore.insert({
          noteId: 'a1',
          notebook: 'news',
          status: 'open',
        });
        const heard = yield* Effect.forkChild(
          Stream.runCollect(afterTable.subscribe().pipe(Stream.take(1))),
        );
        yield* Effect.sleep('5 millis');
        const scanned = Array.from(yield* Stream.runCollect(afterTable.scan()));
        expect(scanned).toHaveLength(1);
        const stored = scanned[0]!;
        expect(stored.keys).not.toHaveProperty('GSI1PK');

        const before = yield* afterTable.drift(stored);
        expect(before.drifted).toBe(true);
        expect(before.currentForm.keys.GSI1PK).toBeDefined();
        expect(before.currentForm.meta._u).toBe(stored.meta._u);

        yield* afterTable.reindex(before.currentForm);

        const rescanned = Array.from(
          yield* Stream.runCollect(afterTable.scan()),
        );
        expect(rescanned).toHaveLength(1);
        const repaired = rescanned[0]!;
        expect(repaired.meta._u).toBe(stored.meta._u);
        expect(repaired.keys.GSI1PK).toBeDefined();

        const after = yield* afterTable.drift(repaired);
        expect(after.drifted).toBe(false);

        yield* noteAfter.insert({
          noteId: 'a2',
          notebook: 'news',
          status: 'open',
        });
        const [received] = yield* Fiber.join(heard);
        return received;
      }).pipe(Effect.provide(layer), Effect.provide(defaultBroadcaster)),
    );

    expect((notice?.value as { noteId?: string } | undefined)?.noteId).toBe(
      'a2',
    );
  });

  it('fails with ReindexConflict when the row changed since it was read', async () => {
    const beforeTable = StdTable.make('drift-conflict-test')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();
    const afterTable = StdTable.make('drift-conflict-test')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();
    const schema = EntityESchema.make('Note', 'noteId', {
      notebook: Schema.String,
      status: Schema.String,
    }).build();
    const noteBefore = beforeTable
      .entity(schema)
      .primary({ pk: ['notebook'] })
      .build();
    const noteAfter = afterTable
      .entity(schema)
      .primary({ pk: ['notebook'] })
      .index('GSI1', 'byStatus', { pk: ['notebook'], sk: ['status'] })
      .build();

    const deterministic = makeDeterministicContract(beforeTable.logicalName);
    const layer = contractLayer(
      beforeTable.logicalName,
      deterministic.contract,
    );

    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        yield* noteBefore.insert({
          noteId: 'b1',
          notebook: 'news',
          status: 'open',
        });
        const scanned = Array.from(yield* Stream.runCollect(afterTable.scan()));
        const stored = scanned[0]!;
        const { currentForm } = yield* afterTable.drift(stored);
        yield* noteAfter.getAndUpdate(
          { noteId: 'b1', notebook: 'news' },
          { status: 'closed' },
        );
        return yield* afterTable.reindex(currentForm).pipe(Effect.result);
      }).pipe(Effect.provide(layer)),
    );

    expect(outcome._tag).toBe('Failure');
    if (outcome._tag === 'Failure')
      expect(outcome.failure.reason._tag).toBe('ReindexConflict');
  });

  it('fails with PrimaryKeyDrift when the current registration derives a different primary key', async () => {
    const beforeTable = StdTable.make('primary-drift-test')
      .primary('pk', 'sk')
      .build();
    const afterTable = StdTable.make('primary-drift-test')
      .primary('pk', 'sk')
      .build();
    const schema = EntityESchema.make('Note', 'noteId', {
      notebook: Schema.String,
      status: Schema.String,
    }).build();
    const noteBefore = beforeTable
      .entity(schema)
      .primary({ pk: ['notebook'] })
      .build();
    afterTable
      .entity(schema)
      .primary({ pk: ['status'] })
      .build();

    const deterministic = makeDeterministicContract(beforeTable.logicalName);
    const layer = contractLayer(
      beforeTable.logicalName,
      deterministic.contract,
    );

    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        yield* noteBefore.insert({
          noteId: 'c1',
          notebook: 'news',
          status: 'open',
        });
        const [stored] = Array.from(
          yield* Stream.runCollect(afterTable.scan()),
        );
        return yield* afterTable.drift(stored!).pipe(Effect.result);
      }).pipe(Effect.provide(layer)),
    );

    expect(outcome).toMatchObject({
      _tag: 'Failure',
      failure: {
        reason: {
          _tag: 'PrimaryKeyDrift',
          entity: 'Note',
        },
      },
    });
    if (outcome._tag === 'Failure') {
      const reason = outcome.failure.reason;
      if (reason._tag === 'PrimaryKeyDrift')
        expect(reason.storedKey).not.toEqual(reason.currentKey);
    }
  });

  it('persists an equivalent Read migration while reindexing', async () => {
    const beforeTable = StdTable.make('migrated-drift-test')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();
    const afterTable = StdTable.make('migrated-drift-test')
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();
    const beforeSchema = EntityESchema.make('Note', 'noteId', {
      notebook: Schema.String,
      status: Schema.String,
    }).build();
    const afterSchema = EntityESchema.make('Note', 'noteId', {
      notebook: Schema.String,
      status: Schema.String,
    })
      .evolve('v2', { label: Schema.String }, (previous) => ({
        ...previous,
        label: 'migrated',
      }))
      .build();
    const noteBefore = beforeTable
      .entity(beforeSchema)
      .primary({ pk: ['notebook'] })
      .build();
    afterTable
      .entity(afterSchema)
      .primary({ pk: ['notebook'] })
      .index('GSI1', 'byStatus', { pk: ['notebook'], sk: ['status'] })
      .build();

    const deterministic = makeDeterministicContract(beforeTable.logicalName);
    const layer = contractLayer(
      beforeTable.logicalName,
      deterministic.contract,
    );

    await Effect.runPromise(
      Effect.gen(function* () {
        yield* noteBefore.insert({
          noteId: 'd1',
          notebook: 'news',
          status: 'open',
        });
        const [stored] = Array.from(
          yield* Stream.runCollect(afterTable.scan()),
        );
        expect(stored!.data._v).toBe('v1');

        const { currentForm } = yield* afterTable.drift(stored!);
        expect(currentForm.data).toMatchObject({
          _v: 'v2',
          label: 'migrated',
        });
        expect(currentForm.meta._u).toBe(stored!.meta._u);

        yield* afterTable.reindex(currentForm);

        const [reindexed] = Array.from(
          yield* Stream.runCollect(afterTable.scan()),
        );
        expect(reindexed!.data).toMatchObject({
          _v: 'v2',
          label: 'migrated',
        });
        expect(reindexed!.meta._u).toBe(stored!.meta._u);
      }).pipe(Effect.provide(layer)),
    );
  });

  it('fails with EntityNotFound for an item whose _e is not registered on the table', async () => {
    const table = StdTable.make('drift-unknown-test')
      .primary('pk', 'sk')
      .build();
    const deterministic = makeDeterministicContract(table.logicalName);
    const layer = contractLayer(table.logicalName, deterministic.contract);

    const outcome = await Effect.runPromise(
      table
        .drift({
          pk: 'x',
          sk: 'y',
          meta: { _e: 'Ghost', _u: '1', _d: false },
          data: { _v: 'v1' },
          keys: {},
        })
        .pipe(Effect.result, Effect.provide(layer)),
    );

    expect(outcome._tag).toBe('Failure');
    if (outcome._tag === 'Failure')
      expect(outcome.failure.reason._tag).toBe('EntityNotFound');
  });
});
