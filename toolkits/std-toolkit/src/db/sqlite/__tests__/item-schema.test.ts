import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from '../../index.js';
import type { EncodedItem } from '../../std-table/contract/index.js';
import { itemSchema } from '../item-schema/index.js';

const table = StdTable.make('people')
  .primary('PK', 'SK')
  .gsi('byEmail', 'GSI1PK', 'GSI1SK')
  .build();

const schema = itemSchema(table);

const item: EncodedItem = {
  pk: 'Person|organization-1',
  sk: 'person-1',
  meta: {
    _e: 'Person',
    _u: '2026-08-13T00:00:00.000Z',
    _d: false,
  },
  data: { _v: 'v2', email: 'person@example.com', name: 'Person' },
  keys: {
    GSI1PK: 'Person|person@example.com',
    GSI1SK: 'person-1',
  },
};

const row = {
  PK: item.pk,
  SK: item.sk,
  _e: item.meta._e,
  _v: String(item.data._v),
  _u: item.meta._u,
  _d: 0,
  data: JSON.stringify(item.data),
  GSI1PK: item.keys.GSI1PK!,
  GSI1SK: item.keys.GSI1SK!,
};

describe('SQLite item schema', () => {
  it('decodes an encoded item into a row and encodes it back', () => {
    expect(Schema.decodeSync(schema)(item)).toEqual(row);
    expect(Schema.encodeSync(schema)(row)).toEqual(item);
  });

  it('fails with a parse error on a malformed row', async () => {
    const result = await Effect.runPromise(
      Effect.result(Schema.encodeEffect(schema)({ ...row, data: 7 })),
    );
    expect(result._tag).toBe('Failure');
  });
});
