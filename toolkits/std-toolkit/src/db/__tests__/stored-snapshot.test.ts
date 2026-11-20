import { Effect, Schema, type Layer } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../eschema/index.js';
import { TableSnapshot } from '../../snapshot/index.js';
import {
  StdTable,
  storedTableSnapshot,
  type StdTableService,
} from '../index.js';
import { Memory } from '../memory/index.js';
import { SQLite } from '../sqlite/index.js';
import { inMemoryDrivers } from '../sqlite/__tests__/drivers.js';
import { StdTableService as Service } from '../std-table/contract/index.js';
import { checkTableSnapshot, type TableMode } from '../table-snapshot/index.js';

const makeTable = () => {
  // Declared out of name order: the Stored snapshot keeps the declared order.
  const table = StdTable.make('notes')
    .primary('pk', 'sk')
    .lsi('LSI2', 'LSI2SK')
    .lsi('LSI1', 'LSI1SK')
    .build();
  table
    .entity(
      EntityESchema.make('Note', 'noteId', { title: Schema.String }).build(),
    )
    .primary()
    .build();
  return table;
};

type Table = ReturnType<typeof makeTable>;

const run = <A, E>(
  layer: Layer.Layer<StdTableService<'notes'>>,
  effect: Effect.Effect<A, E, StdTableService<'notes'>>,
) => Effect.runPromise(effect.pipe(Effect.provide(layer)));

/** What every read should find once the code's snapshot is set up under `mode`. */
const expectSetUp = async (
  table: Table,
  layer: Layer.Layer<StdTableService<'notes'>>,
  mode: TableMode,
) => {
  expect(await run(layer, storedTableSnapshot(table))).toEqual({
    snapshot: TableSnapshot.capture(table),
    mode,
    localIndexOrder: ['LSI2', 'LSI1'],
  });
  const { snapshot, entity, version } = table.storedSnapshot;
  const record = await run(layer, snapshot.get());
  expect(record.meta._u).not.toBe('');
  expect(record.value.mode).toBe(mode);
  expect(record.value.localSecondaryIndexes.map(({ name }) => name)).toEqual([
    'LSI2',
    'LSI1',
  ]);
  const note = await run(layer, entity.get({ name: 'Note' }));
  expect(note?.value).toMatchObject({ name: 'Note', kind: 'keyed' });
  const entities = await run(
    layer,
    entity.query('primary', { pk: {}, '>=': null }),
  );
  expect(entities.items.map(({ value }) => value.name).sort()).toEqual(
    TableSnapshot.capture(table)
      .entities.map(({ name }) => name)
      .sort(),
  );
  const versions = await run(
    layer,
    version.query('primary', { pk: {}, '>=': null }, { limit: 1000 }),
  );
  expect(versions.items.map(({ value }) => value.id)).toContain('Note@v1');
  expect(await run(layer, version.get({ id: 'Note@v1' }))).not.toBeNull();
};

describe('the Stored snapshot, read by the app', () => {
  describe('on Memory', () => {
    it('is null before any setup, and __snapshot reads its default', async () => {
      const table = makeTable();
      const { layer } = Memory.make(table);
      expect(await run(layer, storedTableSnapshot(table))).toBeNull();
      const record = await run(layer, table.storedSnapshot.snapshot.get());
      expect(record.meta._u).toBe('');
      const entities = await run(
        layer,
        table.storedSnapshot.entity.query('primary', { pk: {}, '>=': null }),
      );
      expect(entities.items).toEqual([]);
    });

    it("returns the code's snapshot and mode once the check has run", async () => {
      const table = makeTable();
      const { layer } = Memory.make(table);
      await run(
        layer,
        Effect.gen(function* () {
          const { contract } = yield* Service('notes');
          yield* checkTableSnapshot({
            contract,
            snapshot: TableSnapshot.capture(table),
            mode: 'disposable',
            localIndexOrder: ['LSI2', 'LSI1'],
            wipe: () => Effect.void,
          });
        }),
      );
      await expectSetUp(table, layer, 'disposable');
    });
  });

  describe.each(inMemoryDrivers)('on SQLite (%s)', (_, makeDriver) => {
    it.each(['persistent', 'disposable'] as const)(
      "returns the code's snapshot and mode after %s setup",
      async (mode) => {
        const database = makeDriver();
        const table = makeTable();
        await Effect.runPromise(SQLite.setup(table, { mode, database }));
        await expectSetUp(table, SQLite.make(table, { database }).layer, mode);
      },
    );
  });

  it('offers no way to write the internal entities', () => {
    const { snapshot, entity, version } = makeTable().storedSnapshot;
    expect(Object.keys(snapshot).sort()).toEqual(['get', 'name', 'schema']);
    for (const surface of [entity, version])
      expect(Object.keys(surface).sort()).toEqual([
        'get',
        'name',
        'query',
        'schema',
      ]);
    for (const surface of [snapshot, entity, version])
      expect(Object.isFrozen(surface)).toBe(true);
  });
});
