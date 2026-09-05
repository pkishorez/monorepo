import { Schema } from 'effect';
import { describe, expect, it } from 'vitest';
import { EntityESchema } from '../../../../eschema/index.js';
import { StdTable } from '../../table/index.js';
import { derivedIndexes } from '../storage.js';

const table = StdTable.make('storage-test')
  .primary('pk', 'sk')
  .lsi('LSI1', 'LSI1SK')
  .gsi('GSI1', 'GSI1PK', 'GSI1SK')
  .build();

const recordSchema = EntityESchema.make('Record', 'recordId', {
  category: Schema.String,
  label: Schema.String,
}).build();

const record = table
  .entity(recordSchema)
  .primary({ pk: ['category'] })
  .index('LSI1', 'byLabel', { sk: ['label'] })
  .index('GSI1', 'byCategoryAndLabel', {
    pk: ['category'],
    sk: ['label'],
  })
  .build();

describe('portable entity storage', () => {
  it('stores only physical secondary index keys', () => {
    const indexes = derivedIndexes(record, {
      _v: 'v1',
      category: 'documents',
      label: 'report',
      recordId: 'record-1',
    });

    expect(Object.keys(indexes).sort()).toEqual(['GSI1PK', 'GSI1SK', 'LSI1SK']);
    expect(indexes).not.toHaveProperty('pk');
    expect(indexes).not.toHaveProperty('undefined');
  });
});
