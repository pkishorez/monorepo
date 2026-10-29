import { readFile, writeFile } from 'node:fs/promises';
import { Effect, Schema } from 'effect';
import { afterEach, describe, expect, it } from 'vitest';
import { EntityESchema, ESchema } from '../../../eschema/index.js';
import { TableSnapshot } from '../../../snapshot/index.js';
import { StdTable } from '../../std-table/table/index.js';
import { expectTableShippable } from '../index.js';

const Address = ESchema.make('Address', { city: Schema.String }).build();

const makeBoard = (title = Schema.String) => {
  const Task = EntityESchema.make('Task', 'taskId', {
    boardId: Schema.String,
    title,
    address: Address.schema,
  })
    .evolve(
      'v2',
      { priority: Schema.Literals(['low', 'high']) },
      (previous) => ({
        ...previous,
        priority: 'low' as const,
      }),
    )
    .build();
  const table = StdTable.make('board')
    .primary('pk', 'sk')
    .gsi('GSI1', 'GSI1PK', 'GSI1SK')
    .entity(Task, (e) =>
      e
        .primary({ pk: ['boardId'] })
        .index('GSI1', 'byTitle', { pk: ['title'], sk: ['taskId'] }),
    )
    .build();
  return table;
};

const board = makeBoard();
// The committed file holds a plain title in v1 and v2; a minimum length on it
// would refuse stored rows, so it is a breaking edit of both shipped versions.
const tightened = () => makeBoard(Schema.String.check(Schema.isMinLength(3)));

const file = './fixtures/board.snapshot.json';
const fixture = new URL('./fixtures/board.snapshot.json', import.meta.url);

/** Runs `body` as if vitest were started with `-u`. */
const asIfUpdating = async (body: () => Promise<void>) => {
  const state = expect.getState().snapshotState as unknown as {
    _updateSnapshot: string;
  };
  const previous = state._updateSnapshot;
  state._updateSnapshot = 'all';
  try {
    await body();
  } finally {
    state._updateSnapshot = previous;
  }
};

let source: string;
const keepFixture = async () => {
  source = await readFile(fixture, 'utf8');
};
afterEach(async () => {
  if (source !== undefined) await writeFile(fixture, source);
});

describe('expectTableShippable', () => {
  it('passes when the table matches its committed file and every version upgrades', async () => {
    await expectTableShippable(board, file);
  });

  it('commits a stamped document the toolkit reads back as the current snapshot', async () => {
    const stored = JSON.parse(await readFile(fixture, 'utf8'));
    expect(stored._v).toBe('v1');
    const snapshot = await Effect.runPromise(TableSnapshot.parse(stored));
    expect(snapshot).toEqual(TableSnapshot.capture(board));
  });

  it('compares the committed file as data, so formatting never fails the test', async () => {
    await keepFixture();
    await writeFile(fixture, JSON.stringify(JSON.parse(source)));
    await expectTableShippable(board, file);
  });

  it('fails on an unreadable file, and -u does not replace it', async () => {
    await keepFixture();
    await writeFile(fixture, JSON.stringify({ _v: 'v1', schemas: 'old' }));
    await expect(expectTableShippable(board, file)).rejects.toThrow(
      /cannot be read as a table snapshot[\s\S]*Restore it from version control/,
    );
    // An unreadable baseline would otherwise let -u accept a breaking change unseen.
    await asIfUpdating(() =>
      expect(expectTableShippable(tightened(), file)).rejects.toThrow(
        /-u does not replace it/,
      ),
    );
  });

  describe('a breaking change', () => {
    it('fails, naming the change and that nothing accepts it', async () => {
      await expect(expectTableShippable(tightened(), file)).rejects.toThrow(
        /Breaking changes against .*board\.snapshot\.json[\s\S]*Task v1[\s\S]*-u does not accept a breaking change, and nothing else does/,
      );
    });

    it('is not accepted by -u, and the file is left as it was', async () => {
      await keepFixture();
      await asIfUpdating(() =>
        expect(expectTableShippable(tightened(), file)).rejects.toThrow(
          /-u does not accept a breaking change/,
        ),
      );
      expect(await readFile(fixture, 'utf8')).toBe(source);
    });
  });

  it('fails on a stored version that does not upgrade, even with -u', async () => {
    const Task = EntityESchema.make('Task', 'taskId', {
      boardId: Schema.String,
    })
      .evolve('v2', { done: Schema.Boolean }, (old) => ({
        ...old,
        boardId: old.boardId.toUpperCase(),
        done: false,
      }))
      .build();
    const table = StdTable.make('moving')
      .primary('pk', 'sk')
      .entity(Task, (e) => e.primary({ pk: ['boardId'] }))
      .build();
    await asIfUpdating(() =>
      expect(
        expectTableShippable(table, './fixtures/never-written.snapshot.json'),
      ).rejects.toThrow(
        /do not upgrade[\s\S]*Task v1 → v2: unchanged failed: boardId changed[\s\S]*-u does not change this/,
      ),
    );
    await expect(
      readFile(
        new URL('./fixtures/never-written.snapshot.json', import.meta.url),
      ),
    ).rejects.toThrow(/ENOENT/);
  });

  it('refuses a table with no registered entities', async () => {
    const table = StdTable.make('empty').primary('pk', 'sk').build();
    await expect(expectTableShippable(table, file)).rejects.toThrow(
      /no registered entities/,
    );
  });
});
