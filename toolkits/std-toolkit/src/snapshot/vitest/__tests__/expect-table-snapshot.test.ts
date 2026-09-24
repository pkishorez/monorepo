import { readFile } from 'node:fs/promises';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from '../../../db/index.js';
import { EntityESchema, ESchema, toSchema } from '../../../eschema/index.js';
import { Snapshot } from '../../index.js';
import { expectTableSnapshot } from '../index.js';

const Address = ESchema.make('Address', { city: Schema.String }).build();

const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  address: toSchema(Address),
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (previous) => ({
    ...previous,
    priority: 'low' as const,
  }))
  .build();

const board = StdTable.make('board')
  .primary('pk', 'sk')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();
board
  .entity(Task)
  .primary({ pk: ['boardId'] })
  .index('GSI1', 'byTitle', { pk: ['title'], sk: ['taskId'] })
  .build();

describe('expectTableSnapshot', () => {
  it('matches the committed table snapshot file', async () => {
    await expectTableSnapshot(board, './fixtures/board.snapshot.json');
  });

  it('commits a document the toolkit can read back and diff', async () => {
    const stored = JSON.parse(
      await readFile(
        new URL('./fixtures/board.snapshot.json', import.meta.url),
        'utf8',
      ),
    );
    expect(stored._v).toBe('v1');
    const file = await Effect.runPromise(Snapshot.decodeTableFile(stored));
    expect(file.snapshot).toEqual(board.snapshot());
    expect(file.goldenRows.map(({ schema, to }) => `${schema}:${to}`)).toEqual([
      'Task:v2',
    ]);
    expect(Snapshot.diffTableFile(file, file)).toEqual([]);
  });
});
