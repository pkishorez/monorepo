import { Effect, Layer, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../eschema/index.js';
import { makeDeterministicContract } from '../../std-table/__tests__/deterministic-contract.js';
import { StdTable } from '../../std-table/table/index.js';
import { makeNodeSQLite } from '../drivers/node/index.js';
import { SQLite } from '../index.js';

const localTable = StdTable.make('mixed-local').primary('pk', 'sk').build();
const remoteTable = StdTable.make('mixed-remote').primary('pk', 'sk').build();
const schema = EntityESchema.make('Record', 'id', {
  label: Schema.String,
}).build();
const localRecord = localTable.entity(schema).primary().build();
const remoteRecord = remoteTable.entity(schema).primary().build();

describe('mixed Table bindings', () => {
  it('composes distinct definitions backed by SQLite and another runtime', async () => {
    const sqlite = SQLite.make(localTable, {
      database: makeNodeSQLite({ path: ':memory:' }),
    });
    const deterministic = makeDeterministicContract(remoteTable.logicalName);
    await Effect.runPromise(sqlite.setup);

    const result = await Effect.runPromise(
      Effect.all([
        localRecord.insert({ id: 'local', label: 'SQLite' }),
        remoteRecord.insert({ id: 'remote', label: 'deterministic' }),
      ]).pipe(Effect.provide(Layer.merge(sqlite.layer, deterministic.layer))),
    );

    expect(result.map(({ value }) => value.label)).toEqual([
      'SQLite',
      'deterministic',
    ]);
  });
});
