import { readFile } from 'node:fs/promises';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { StdTable } from '../../std-table/table/index.js';
import { expectTableShippable } from '../index.js';

// Task gains an owner in v2, a gap version: no v1 row knows it, so a
// Backfill fills it, here by reading the Owner entity.
const Task = EntityESchema.make('Task', 'taskId', {
  projectId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { owner: Schema.String })
  .build();
const Owner = EntityESchema.make('Owner', 'ownerId', {
  name: Schema.String,
}).build();

const never = './fixtures/never-written.snapshot.json';
const neverWritten = new URL(never, import.meta.url);

describe('expectTableShippable over Backfills', () => {
  it('passes a gap whose Backfill succeeds for every row', async () => {
    const table = StdTable.make('tracker')
      .primary('pk', 'sk')
      .entity(Task, (e) => e.primary({ pk: ['projectId'] }))
      .entity(Owner, (e) => e.primary())
      .backfill('task-owner', {
        entity: 'Task',
        to: 'v2',
        run: (task) => Effect.succeed({ ...task, owner: 'unassigned' }),
      })
      .build();
    await expectTableShippable(table, './fixtures/tracker.snapshot.json');
  });

  it('fails a Backfill that needs a row the other entity may not hold, naming it', async () => {
    const table = StdTable.make('tracker')
      .primary('pk', 'sk')
      .entity(Task, (e) => e.primary({ pk: ['projectId'] }))
      .entity(Owner, (e) => e.primary())
      .backfill('task-owner', {
        entity: 'Task',
        to: 'v2',
        run: (task, db) =>
          Effect.gen(function* () {
            const { items } = yield* db.Owner.query('primary', {
              pk: {},
              '>=': null,
            });
            const [first] = items;
            if (first === undefined) return yield* Effect.fail('no owner');
            return { ...task, owner: first.value.name };
          }),
      })
      .build();
    await expect(expectTableShippable(table, never)).rejects.toThrow(
      /Backfills that do not bring every row[\s\S]*Backfill "task-owner" \(Task v1 → v2\): .*its run failed: no owner\n {2}stored row: \{[^\n]*"_v":"v1"[^\n]*\}\n {2}other entities: empty[\s\S]*must succeed for every row[\s\S]*-u does not change this/,
    );
    await expect(readFile(neverWritten)).rejects.toThrow(/ENOENT/);
  });

  it('seeds the other entities too, and reports the rows it seeded', async () => {
    const table = StdTable.make('tracker')
      .primary('pk', 'sk')
      .entity(Task, (e) => e.primary({ pk: ['projectId'] }))
      .entity(Owner, (e) => e.primary())
      .backfill('task-owner', {
        entity: 'Task',
        to: 'v2',
        run: (task, db) =>
          Effect.gen(function* () {
            const { items } = yield* db.Owner.query('primary', {
              pk: {},
              '>=': null,
            });
            if (items.length > 0) return yield* Effect.fail('an owner exists');
            return { ...task, owner: 'unassigned' };
          }),
      })
      .build();
    await expect(expectTableShippable(table, never)).rejects.toThrow(
      /Backfill "task-owner"[^\n]*an owner exists\n {2}stored row: [^\n]*\n {2}other rows: \{"Owner":\[\{[^\n]*"ownerId"/,
    );
  });

  it('fails a Backfill that changes the id, naming it', async () => {
    const table = StdTable.make('tracker')
      .primary('pk', 'sk')
      .entity(Task, (e) => e.primary({ pk: ['projectId'] }))
      .backfill('task-renumber', {
        entity: 'Task',
        to: 'v2',
        run: (task) =>
          Effect.succeed({ ...task, taskId: `${task.taskId}!`, owner: 'ann' }),
      })
      .build();
    await expect(expectTableShippable(table, never)).rejects.toThrow(
      /Backfill "task-renumber" \(Task v1 → v2\): [^\n]*derives a different key[^\n]*an entity key never changes/,
    );
  });

  it('fails a Backfill that moves a row to another partition key', async () => {
    const table = StdTable.make('tracker')
      .primary('pk', 'sk')
      .entity(Task, (e) => e.primary({ pk: ['projectId'] }))
      .backfill('task-move', {
        entity: 'Task',
        to: 'v2',
        run: (task) =>
          Effect.succeed({ ...task, projectId: 'elsewhere', owner: 'ann' }),
      })
      .build();
    await expect(expectTableShippable(table, never)).rejects.toThrow(
      /Backfill "task-move" \(Task v1 → v2\): [^\n]*derives a different key/,
    );
  });
});
