import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../../eschema/index.js';
import { changedFields, makeCollectionItemSchema } from '../index.js';

const schema = EntityESchema.make('Todo', 'id', {
  count: Schema.Number,
}).build();

describe('CollectionItem schema', () => {
  it('accepts the latest decoded item', () => {
    const result = makeCollectionItemSchema(schema)['~standard'].validate({
      id: 'one',
      count: 2,
      _meta: { _e: 'Todo', _v: 'v1', _u: '1', _d: false },
    });

    expect(result).toMatchObject({ value: { id: 'one', count: 2 } });
  });

  it('rejects an encoded item', () => {
    const result = makeCollectionItemSchema(schema)['~standard'].validate({
      _v: 'v1',
      id: 'one',
      count: '2',
    } as never);

    expect(result).toHaveProperty('issues');
  });
});

describe('changedFields', () => {
  it('includes a field the update removed', () => {
    expect(changedFields({ id: 'a', text: 'hello' }, { id: 'a' })).toEqual([
      'text',
    ]);
  });
});
