import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../../eschema/index.js';
import { contractLayer } from '../../contract/index.js';
import { StdTable } from '../../table/index.js';
import { makeDeterministicContract } from '../../__tests__/deterministic-contract.js';

const note = EntityESchema.make('Note', 'id', { title: Schema.String }).build();
const task = EntityESchema.make('Task', 'id', { title: Schema.String }).build();

const makeBoard = (logicalName: string) => {
  const table = StdTable.make(logicalName)
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .build();
  const notes = table
    .entity(note)
    .primary({ pk: ['title'] })
    .build();
  const tasks = table
    .entity(task)
    .primary({ pk: ['title'] })
    .build();
  const deterministic = makeDeterministicContract(logicalName, table);
  const layer = contractLayer(logicalName, deterministic.contract);
  return { table, notes, tasks, deterministic, layer };
};

describe('table state', () => {
  it('reads as empty on a table that never wrote it', async () => {
    const { table, layer } = makeBoard('state-empty');
    const state = await Effect.runPromise(
      table.state().pipe(Effect.provide(layer)),
    );
    expect(state).toEqual({ snapshot: null, entities: {}, backfill: [] });
  });

  it('moves one entity epoch when that entity is wiped, and no other', async () => {
    const { table, notes, tasks, layer } = makeBoard('state-entity-wipe');
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        yield* table.verifySnapshot();
        yield* notes.insert({ id: 'n1', title: 'a' });
        yield* tasks.insert({ id: 't1', title: 'b' });
        const before = yield* table.state();
        const wiped = yield* notes.dangerouslyRemoveAllItems(
          'I KNOW WHAT I AM DOING',
        );
        const after = yield* table.state();
        return { before, wiped, after };
      }).pipe(Effect.provide(layer)),
    );
    expect(outcome.wiped.itemsDeleted).toBe(1);
    expect(outcome.wiped.epoch).toBe(outcome.after.entities['Note']?.epoch);
    expect(outcome.after.entities['Note']?.epoch).not.toBe(
      outcome.before.entities['Note']?.epoch,
    );
    expect(outcome.after.entities['Task']?.epoch).toBe(
      outcome.before.entities['Task']?.epoch,
    );
    expect(outcome.after.snapshot).toEqual(outcome.before.snapshot);
  });

  it('mints an epoch for an entity wiped before enforcement ever ran', async () => {
    const { table, notes, layer } = makeBoard('state-wipe-first');
    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        const wiped = yield* notes.dangerouslyRemoveAllItems(
          'I KNOW WHAT I AM DOING',
        );
        return { wiped, state: yield* table.state() };
      }).pipe(Effect.provide(layer)),
    );
    expect(outcome.wiped.epoch).toBeTruthy();
    expect(outcome.state.snapshot).toBeNull();
    expect(Object.keys(outcome.state.entities)).toEqual(['Note']);
  });

  it('keeps the baseline but renews every epoch and settles every need when the table is wiped', async () => {
    const logicalName = 'state-table-wipe';
    const narrow = StdTable.make(logicalName)
      .primary('pk', 'sk')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();
    narrow
      .entity(note)
      .primary({ pk: ['title'] })
      .build();
    const { table, notes, layer } = makeBoard(logicalName);

    const outcome = await Effect.runPromise(
      Effect.gen(function* () {
        yield* narrow.verifySnapshot();
        // Task joins with an index: safe, plus a backfill owed for its pattern.
        const wide = StdTable.make(logicalName)
          .primary('pk', 'sk')
          .gsi('GSI1', 'GSI1PK', 'GSI1SK')
          .build();
        wide
          .entity(note)
          .primary({ pk: ['title'] })
          .index('GSI1', 'byTitle', { pk: ['title'], sk: ['title'] })
          .build();
        wide
          .entity(task)
          .primary({ pk: ['title'] })
          .build();
        yield* wide.verifySnapshot();
        yield* notes.insert({ id: 'n1', title: 'a' });
        const before = yield* table.state();
        const wiped = yield* wide.dangerouslyRemoveAllItems(
          'I KNOW WHAT I AM DOING',
        );
        const after = yield* wide.state();
        // Nothing to bootstrap: the baseline survived the wipe.
        yield* wide.verifySnapshot();
        return { before, wiped, after, settled: yield* wide.state() };
      }).pipe(Effect.provide(layer)),
    );

    expect(outcome.before.backfill).toHaveLength(1);
    expect(outcome.wiped.itemsDeleted).toBe(1); // the note; the record is not counted
    expect(outcome.after.snapshot).toEqual(outcome.before.snapshot);
    expect(outcome.after.backfill).toEqual([]);
    expect(Object.keys(outcome.wiped.epochs).sort()).toEqual(['Note', 'Task']);
    for (const name of ['Note', 'Task']) {
      expect(outcome.after.entities[name]?.epoch).toBe(
        outcome.wiped.epochs[name],
      );
      expect(outcome.after.entities[name]?.epoch).not.toBe(
        outcome.before.entities[name]?.epoch,
      );
    }
    expect(outcome.settled).toEqual(outcome.after);
  });
});
