import { describe, expect, it } from 'vitest';
import { DynamoTable } from '../src/table/index.js';
import { validateEnvironment } from './setup.js';

const env = validateEnvironment();

describe('dynamoTable Configuration', () => {
  it('should create table with single primary key', () => {
    const table = DynamoTable.make(env.tableName, {
      region: 'us-east-1',
      accessKey: env.accessKey!,
      secretKey: env.secretKey!,
      endpoint: env.dynamoUrl,
    })
      .primary('id', 'sort')
      .build();

    expect(table.primary).toEqual({ pk: 'id', sk: 'sort' });
    expect(table.secondaryIndexes).toEqual({});
    expect(table.name).toBe(env.tableName);
  });

  it('should create table with composite primary key', () => {
    const table = DynamoTable.make(env.tableName, {
      region: 'us-east-1',
      accessKey: env.accessKey!,
      secretKey: env.secretKey!,
      endpoint: env.dynamoUrl,
    })
      .primary('pkey', 'skey')
      .build();

    expect(table.primary).toEqual({ pk: 'pkey', sk: 'skey' });
  });

  it('should add GSI with single key', () => {
    const table = DynamoTable.make(env.tableName, {
      region: 'us-east-1',
      accessKey: env.accessKey!,
      secretKey: env.secretKey!,
      endpoint: env.dynamoUrl,
    })
      .primary('pkey', 'skey')
      .gsi('GSI1', 'gsi1pk')
      .build();

    expect(table.secondaryIndexes.GSI1).toEqual({ pk: 'gsi1pk' });
  });

  it('should add GSI with composite key', () => {
    const table = DynamoTable.make(env.tableName, {
      region: 'us-east-1',
      accessKey: env.accessKey!,
      secretKey: env.secretKey!,
      endpoint: env.dynamoUrl,
    })
      .primary('pkey', 'skey')
      .gsi('GSI1', 'gsi1pk', 'gsi1sk')
      .build();

    expect(table.secondaryIndexes.GSI1).toEqual({ pk: 'gsi1pk', sk: 'gsi1sk' });
  });

  it('should add multiple GSIs', () => {
    const table = DynamoTable.make(env.tableName, {
      region: 'us-east-1',
      accessKey: env.accessKey!,
      secretKey: env.secretKey!,
      endpoint: env.dynamoUrl,
    })
      .primary('pkey', 'skey')
      .gsi('GSI1', 'gsi1pk', 'gsi1sk')
      .gsi('GSI2', 'gsi2pk', 'gsi2sk')
      .build();

    expect(table.secondaryIndexes.GSI1).toEqual({ pk: 'gsi1pk', sk: 'gsi1sk' });
    expect(table.secondaryIndexes.GSI2).toEqual({ pk: 'gsi2pk', sk: 'gsi2sk' });
  });

  it('should add LSI', () => {
    const table = DynamoTable.make(env.tableName, {
      region: 'us-east-1',
      accessKey: env.accessKey!,
      secretKey: env.secretKey!,
      endpoint: env.dynamoUrl,
    })
      .primary('pkey', 'skey')
      .lsi('LSI1', 'lsi1skey')
      .build();

    expect(table.secondaryIndexes.LSI1).toEqual({ pk: 'pkey', sk: 'lsi1skey' });
  });

  it('should chain GSIs and LSIs', () => {
    const table = DynamoTable.make(env.tableName, {
      region: 'us-east-1',
      accessKey: env.accessKey!,
      secretKey: env.secretKey!,
      endpoint: env.dynamoUrl,
    })
      .primary('pkey', 'skey')
      .gsi('GSI1', 'gsi1pk', 'gsi1sk')
      .gsi('GSI2', 'gsi2pk', 'gsi2sk')
      .lsi('LSI1', 'lsi1skey')
      .build();

    expect(table.primary).toEqual({ pk: 'pkey', sk: 'skey' });
    expect(table.secondaryIndexes.GSI1).toEqual({ pk: 'gsi1pk', sk: 'gsi1sk' });
    expect(table.secondaryIndexes.GSI2).toEqual({ pk: 'gsi2pk', sk: 'gsi2sk' });
    expect(table.secondaryIndexes.LSI1).toEqual({ pk: 'pkey', sk: 'lsi1skey' });
  });

  it('should type items correctly with generic parameter', () => {
    interface TestItem {
      name: string;
      email: string;
      age: number;
    }

    const table = DynamoTable.make(env.tableName, {
      region: 'us-east-1',
      accessKey: env.accessKey!,
      secretKey: env.secretKey!,
      endpoint: env.dynamoUrl,
    })
      .primary('id', 'sort')
      .build<TestItem>();

    // Type test - this should compile without errors
    const _typeTest: typeof table = table;
    expect(table).toBeDefined();
  });
});