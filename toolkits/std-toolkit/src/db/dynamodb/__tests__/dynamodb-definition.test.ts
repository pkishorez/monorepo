import { describe, expect, it } from 'vitest';
import { StdTable } from '../../index.js';
import { DynamoDB } from '../index.js';

describe('DynamoDB table definition', () => {
  it('projects portable topology without physical configuration', () => {
    const table = StdTable.make('people')
      .primary('pk', 'sk')
      .lsi('LSI1', 'LSI1SK')
      .gsi('GSI1', 'GSI1PK', 'GSI1SK')
      .build();
    const definition = DynamoDB.getTableDefinition(table);
    expect(definition).not.toHaveProperty('TableName');
    expect(definition.LocalSecondaryIndexes?.[0]?.IndexName).toBe('LSI1');
    expect(definition.GlobalSecondaryIndexes?.[0]?.IndexName).toBe('GSI1');
    expect(definition.BillingMode).toBe('PAY_PER_REQUEST');
  });
});
