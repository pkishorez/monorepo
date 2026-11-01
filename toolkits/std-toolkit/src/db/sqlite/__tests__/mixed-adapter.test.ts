import { Effect, Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { makeDeterministicContract } from '../../std-table/__tests__/deterministic-contract.js';
import { StdTable } from '../../std-table/table/index.js';
import { makeNodeSQLite } from '../drivers/node/index.js';
import { SQLite } from '../index.js';

const schema = EntityESchema.make('Record', 'id', {
  label: Schema.String,
}).build();
const localTable = StdTable.make('mixed-local')
  .primary('pk', 'sk')
  .entity(schema, (e) => e.primary())
  .build();
const remoteTable = StdTable.make('mixed-remote')
  .primary('pk', 'sk')
  .entity(schema, (e) => e.primary())
  .build();

describe('mixed Table bindings', () => {
  it('composes distinct definitions backed by SQLite and another runtime', async () => {
    const database = makeNodeSQLite({ path: ':memory:' });
    const sqlite = SQLite.make(localTable, { database });
    const deterministic = makeDeterministicContract(remoteTable.logicalName);
    await Effect.runPromise(
      SQLite.setup(localTable, { mode: 'persistent', database }),
    );

    const result = await Effect.runPromise(
      Effect.all([
        localTable.Record.insert({ id: 'local', label: 'SQLite' }),
        remoteTable.Record.insert({ id: 'remote', label: 'deterministic' }),
      ]).pipe(Effect.provide(Layer.merge(sqlite.layer, deterministic.layer))),
    );

    expect(result.map(({ value }) => value.label)).toEqual([
      'SQLite',
      'deterministic',
    ]);
  });
});
