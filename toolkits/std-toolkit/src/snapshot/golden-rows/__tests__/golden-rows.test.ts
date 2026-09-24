import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from '../../../db/index.js';
import {
  EntityESchema,
  ESchema,
  ValueESchema,
  toSchema,
  type AnyEntityESchema,
} from '../../../eschema/index.js';
import { Snapshot } from '../../index.js';
import { captureTableSnapshotFile, GoldenRowError } from '../index.js';

const Address = ESchema.make('Address', { city: Schema.String })
  .evolve('v2', { country: Schema.String }, (previous) => ({
    ...previous,
    country: 'unknown',
  }))
  .build();

const Priority = ValueESchema.make('Priority', Schema.String)
  .evolve('v2', Schema.Number, (previous) => previous.length)
  .build();

const taskV1 = () =>
  EntityESchema.make('Task', 'taskId', {
    title: Schema.String,
    done: Schema.Boolean,
    address: toSchema(Address),
    priority: toSchema(Priority),
  });

const Task = taskV1()
  .evolve('v2', { tags: Schema.Array(Schema.String) }, (previous) => ({
    ...previous,
    tags: [],
  }))
  .evolve('v3', { done: null, status: Schema.String }, ({ done, ...rest }) => ({
    ...rest,
    status: done ? 'done' : 'open',
  }))
  .build();

const TaskRewritten = taskV1()
  .evolve('v2', { tags: Schema.Array(Schema.String) }, (previous) => ({
    ...previous,
    tags: ['migrated'],
  }))
  .evolve('v3', { done: null, status: Schema.String }, ({ done, ...rest }) => ({
    ...rest,
    status: done ? 'done' : 'open',
  }))
  .build();

const TaskExtended = taskV1()
  .evolve('v2', { tags: Schema.Array(Schema.String) }, (previous) => ({
    ...previous,
    tags: [],
  }))
  .evolve('v3', { done: null, status: Schema.String }, ({ done, ...rest }) => ({
    ...rest,
    status: done ? 'done' : 'open',
  }))
  .evolve('v4', { archived: Schema.Boolean }, (previous) => ({
    ...previous,
    archived: false,
  }))
  .build();

const board = (task: AnyEntityESchema) => {
  const table = StdTable.make('board').primary('pk', 'sk').build();
  table
    .entity(task)
    .primary({ pk: ['title'] })
    .build();
  return table;
};

const capture = (
  table: ReturnType<typeof board>,
  prior?: Awaited<ReturnType<typeof captureFile>>,
) => Effect.runPromise(captureTableSnapshotFile(table, prior));
const captureFile = (table: ReturnType<typeof board>) =>
  Effect.runPromise(captureTableSnapshotFile(table));

describe('golden rows', () => {
  it('pins every migration step of every reachable ESchema with twenty replayable rows', async () => {
    const file = await captureFile(board(Task));

    expect(
      file.goldenRows.map(({ schema, from, to, rows }) => ({
        schema,
        from,
        to,
        rows: rows.length,
      })),
    ).toEqual([
      { schema: 'Address', from: 'v1', to: 'v2', rows: 20 },
      { schema: 'Priority', from: 'v1', to: 'v2', rows: 20 },
      { schema: 'Task', from: 'v1', to: 'v2', rows: 20 },
      { schema: 'Task', from: 'v2', to: 'v3', rows: 20 },
    ]);
    const step = file.goldenRows.find(
      ({ schema, to }) => schema === 'Task' && to === 'v3',
    )!;
    for (const { input, output } of step.rows) {
      expect(input).toMatchObject({ _v: 'v2' });
      expect(output).toMatchObject({ _v: 'v3' });
      expect(output).not.toHaveProperty('done');
      // Nested values persist stamped, so the row is exactly what a table holds.
      expect((input as { address: { _v: string } }).address._v).toBe('v2');
      expect((input as { priority: { _v: string } }).priority._v).toBe('v2');
    }
    expect(file.snapshot).toEqual(board(Task).snapshot());
  });

  it('draws the same rows on every run', async () => {
    const first = await captureFile(board(Task));
    const second = await captureFile(board(Task));
    expect(second).toEqual(first);
  });

  it('replays the stored inputs of a prior file instead of drawing new ones', async () => {
    const prior = await captureFile(board(Task));
    const handWritten = {
      _v: 'v1',
      taskId: 't1',
      title: 'Write the plan',
      done: true,
      address: { _v: 'v2', city: 'Lisbon', country: 'PT' },
      priority: { _v: 'v2', value: 3 },
    };
    const edited = {
      ...prior,
      goldenRows: prior.goldenRows.map((step) =>
        step.schema === 'Task' && step.from === 'v1'
          ? { ...step, rows: [{ input: handWritten, output: null }] }
          : step,
      ),
    };

    const replayed = await capture(board(Task), edited);

    const step = replayed.goldenRows.find(
      ({ schema, from }) => schema === 'Task' && from === 'v1',
    )!;
    expect(step.rows).toHaveLength(1);
    expect(step.rows[0]?.input).toEqual(handWritten);
    expect(step.rows[0]?.output).toEqual({
      ...handWritten,
      _v: 'v2',
      tags: [],
    });
  });

  it('reports a rewritten migration as a breaking change against the prior file', async () => {
    const prior = await captureFile(board(Task));
    const current = await capture(board(TaskRewritten), prior);

    const changes = Snapshot.diffTableFile(prior, current);

    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({
      impact: 'breaking',
      action: 'edited',
      subject: { kind: 'migration', name: 'Task', version: 'v2' },
    });
    expect(changes[0]?.edits.length).toBeGreaterThan(0);
    expect(Snapshot.renderChanges(changes)).toContain('Migration Task → v2');
  });

  it('keeps an appended version safe and leaves earlier steps untouched', async () => {
    const prior = await captureFile(board(Task));
    const current = await capture(board(TaskExtended), prior);

    const changes = Snapshot.diffTableFile(prior, current);

    expect(changes.map(({ impact }) => impact)).toEqual(['safe']);
    expect(
      current.goldenRows.filter(({ schema }) => schema === 'Task'),
    ).toHaveLength(3);
    expect(current.goldenRows.filter(({ to }) => to !== 'v4')).toEqual(
      prior.goldenRows,
    );
  });

  it('fails when a migration cannot handle a value its previous version holds', async () => {
    const Fragile = ESchema.make('Fragile', { name: Schema.String })
      .evolve('v2', { upper: Schema.String }, (previous) => {
        if (previous.name === '') throw new Error('empty name');
        return { ...previous, upper: previous.name.toUpperCase() };
      })
      .build();
    const table = StdTable.make('fragile').primary('pk', 'sk').build();
    table.singleEntity(Fragile).default({ name: 'x', upper: 'X' });

    const outcome = await Effect.runPromise(
      captureTableSnapshotFile(table).pipe(Effect.result),
    );

    expect(outcome._tag).toBe('Failure');
    if (outcome._tag === 'Failure') {
      expect(outcome.failure).toBeInstanceOf(GoldenRowError);
      expect(outcome.failure.message).toMatch(
        /^Fragile v1 → v2: the migration failed/,
      );
    }
  });
});
