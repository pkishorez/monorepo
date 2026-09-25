import { readFile, writeFile } from 'node:fs/promises';
import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from '../../../db/index.js';
import { EntityESchema, ESchema, toSchema } from '../../../eschema/index.js';
import { TableSnapshot } from '../../index.js';
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

const fixture = new URL('./fixtures/board.snapshot.json', import.meta.url);

describe('expectTableSnapshot', () => {
  it('matches the committed table snapshot file', async () => {
    await expectTableSnapshot(board, './fixtures/board.snapshot.json');
  });

  it('commits a stamped document the toolkit reads back as the current snapshot', async () => {
    const stored = JSON.parse(await readFile(fixture, 'utf8'));
    expect(stored._v).toBe('v1');
    const snapshot = await Effect.runPromise(TableSnapshot.parse(stored));
    expect(snapshot).toEqual(TableSnapshot.capture(board));
    expect(TableSnapshot.diff(snapshot, TableSnapshot.capture(board))).toEqual(
      [],
    );
  });

  it('compares the committed file as data, so formatting never fails the test', async () => {
    const source = await readFile(fixture, 'utf8');
    try {
      await writeFile(fixture, JSON.stringify(JSON.parse(source)));
      await expectTableSnapshot(board, './fixtures/board.snapshot.json');
    } finally {
      await writeFile(fixture, source);
    }
  });
});
