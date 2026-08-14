import { Effect, Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { StdTable } from '../../index.js';
import type { EncodedItem } from '../../std-table/contract/index.js';
import { decodeKey, itemSchema } from '../item-schema/index.js';

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
    _v: 'v2',
    _u: '2026-08-13T00:00:00.000Z',
    _d: false,
  },
  data: { email: 'person@example.com', name: 'Person' },
  keys: {
    GSI1PK: 'Person|person@example.com',
    GSI1SK: 'person-1',
  },
};

describe('IndexedDB item schema', () => {
  it('decodes an encoded item into a stored record and encodes it back', () => {
    const record = Schema.decodeSync(schema)(item);

    expect(record).toEqual({
      pk: item.pk,
      sk: item.sk,
      _e: item.meta._e,
      _v: item.meta._v,
      _u: item.meta._u,
      _d: item.meta._d,
      data: item.data,
      GSI1PK: item.keys.GSI1PK,
      GSI1SK: item.keys.GSI1SK,
    });
    expect(decodeKey(item)).toEqual([item.pk, item.sk]);
    expect(Schema.encodeSync(schema)(record)).toEqual(item);
  });

  it('fails with a parse error on a malformed record', async () => {
    const result = await Effect.runPromise(
      Effect.result(Schema.encodeEffect(schema)({ pk: 'only' })),
    );
    expect(result._tag).toBe('Failure');
  });
});
