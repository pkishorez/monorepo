/* eslint-disable no-console */
/* eslint-disable unused-imports/no-unused-vars */
import type { CreateTableInput } from 'dynamodb-client';
import process from 'node:process';
import { config } from 'dotenv';
import {
  createDynamoDB,
  ResourceInUseException,
  ResourceNotFoundException,
} from 'dynamodb-client';
import { Effect } from 'effect';
import { beforeAll } from 'vitest';
import { DynamoTable } from '../src/table/index.js';

config();

// Table schema configuration
const TABLE_SCHEMA: Omit<CreateTableInput, 'TableName'> = {
  KeySchema: [
    { AttributeName: 'pkey', KeyType: 'HASH' },
    { AttributeName: 'skey', KeyType: 'RANGE' },
  ],
  AttributeDefinitions: [
    { AttributeName: 'pkey', AttributeType: 'S' },
    { AttributeName: 'skey', AttributeType: 'S' },
    { AttributeName: 'gsi1pk', AttributeType: 'S' },
    { AttributeName: 'gsi1sk', AttributeType: 'S' },
    { AttributeName: 'gsi2pk', AttributeType: 'S' },
    { AttributeName: 'gsi2sk', AttributeType: 'S' },
    { AttributeName: 'lsi1skey', AttributeType: 'S' },
  ],
  GlobalSecondaryIndexes: [
    {
      IndexName: 'GSI1',
      KeySchema: [
        { AttributeName: 'gsi1pk', KeyType: 'HASH' },
        { AttributeName: 'gsi1sk', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
    {
      IndexName: 'GSI2',
      KeySchema: [
        { AttributeName: 'gsi2pk', KeyType: 'HASH' },
        { AttributeName: 'gsi2sk', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
  LocalSecondaryIndexes: [
    {
      IndexName: 'LSI1',
      KeySchema: [
        { AttributeName: 'pkey', KeyType: 'HASH' },
        { AttributeName: 'lsi1skey', KeyType: 'RANGE' },
      ],
      Projection: { ProjectionType: 'ALL' },
    },
  ],
  BillingMode: 'PAY_PER_REQUEST',
};

interface TestEnvironment {
  tableName: string;
  dynamoUrl: string;
}

function validateEnvironment(): TestEnvironment {
  const tableName = process.env.TEST_AWS_TABLE_NAME;
  const dynamoUrl = process.env.TEST_AWS_DYNAMODB_URL;

  if (!tableName || !dynamoUrl) {
    throw new Error(
      'Missing required test environment variables. Please check your .env file for TEST_AWS_TABLE_NAME and TEST_AWS_DYNAMODB_URL.',
    );
  }

  return { tableName, dynamoUrl };
}

function createDynamoClient(endpoint: string) {
  return createDynamoDB({
    region: 'us-east-1',
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test',
    },
    endpoint,
  });
}

async function tableExists(
  client: ReturnType<typeof createDynamoDB>,
  tableName: string,
): Promise<boolean> {
  try {
    await Effect.runPromise(client.describeTable({ TableName: tableName }));
    return true;
  } catch (error) {
    if (error instanceof ResourceNotFoundException) {
      return false;
    }
    throw error;
  }
}

async function createTableIfNotExists(
  client: ReturnType<typeof createDynamoDB>,
  tableName: string,
): Promise<void> {
  try {
    const exists = await tableExists(client, tableName);
    if (exists) {
      console.log(`✅ Table '${tableName}' already exists`);
      return;
    }

    console.log(`🔧 Creating table '${tableName}'...`);
    await Effect.runPromise(
      client.createTable({
        TableName: tableName,
        ...TABLE_SCHEMA,
      }),
    );
    console.log(`✅ Table '${tableName}' created successfully`);
  } catch (error) {
    if (error instanceof ResourceInUseException) {
      console.log(`✅ Table '${tableName}' already exists`);
      return;
    }
    console.error(
      `❌ Failed to create table '${tableName}':`,
      (error as Error).message,
    );
    throw error;
  }
}

async function waitForTableActive(
  client: ReturnType<typeof createDynamoDB>,
  tableName: string,
  maxAttempts: number = 30,
): Promise<void> {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const result = await Effect.runPromise(
        client.describeTable({ TableName: tableName }),
      );

      if (result.Table?.TableStatus === 'ACTIVE') {
        console.log(`✅ Table '${tableName}' is active`);
        return;
      }

      if (attempt < maxAttempts) {
        console.log(
          `⏳ Waiting for table '${tableName}' to become active (attempt ${attempt}/${maxAttempts})...`,
        );
        await new Promise((resolve) => setTimeout(resolve, 1000));
      }
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw new Error(
    `Table '${tableName}' did not become active within ${maxAttempts} seconds`,
  );
}

export async function setupTestDatabase(): Promise<{
  tableName: string;
  client: ReturnType<typeof createDynamoDB>;
}> {
  const env = validateEnvironment();
  const client = createDynamoClient(env.dynamoUrl);

  await createTableIfNotExists(client, env.tableName);
  await waitForTableActive(client, env.tableName);

  return { tableName: env.tableName, client };
}

// Global setup with proper error handling
let setupCompleted = false;
let setupError: Error | null = null;

beforeAll(async () => {
  try {
    await setupTestDatabase();
    setupCompleted = true;
  } catch (error) {
    setupError = error as Error;
    console.error('❌ Test database setup failed:', setupError.message);
    throw error; // This will cause all tests to be skipped
  }
}, 60000); // 60 second timeout for setup

// Export the table instance
export const table = (() => {
  const env = validateEnvironment();
  return DynamoTable.make(env.tableName, {
    region: 'us-east-1',
    accessKey: 'test',
    secretKey: 'test',
    endpoint: env.dynamoUrl,
  })
    .primary('pkey', 'skey')
    .gsi('GSI1', 'gsi1pk', 'gsi1sk')
    .gsi('GSI2', 'gsi2pk', 'gsi2sk')
    .lsi('LSI1', 'lsi1skey')
    .build();
})();

// Helper to check if setup was successful
export function ensureSetupCompleted(): void {
  if (setupError) {
    throw new Error(`Test setup failed: ${setupError.message}`);
  }
  if (!setupCompleted) {
    throw new Error('Test setup has not completed yet');
  }
}

export async function cleanTable(): Promise<void> {
  try {
    let lastEvaluatedKey: any;

    do {
      const scanOptions = lastEvaluatedKey
        ? { Limit: 100, ExclusiveStartKey: lastEvaluatedKey }
        : { Limit: 100 };

      const scanResult = await Effect.runPromise(table.scan(scanOptions));

      if (scanResult.Items && scanResult.Items.length > 0) {
        for (const item of scanResult.Items) {
          try {
            await Effect.runPromise(
              table.deleteItem({
                pkey: item.pkey,
                skey: item.skey,
              }),
            );
          } catch (error) {
            // Ignore individual delete errors
          }
        }
      }

      lastEvaluatedKey = scanResult.LastEvaluatedKey;
    } while (lastEvaluatedKey);
  } catch (error) {
    // Ignore cleanup errors
  }
}

// Export utilities for testing
export {
  createDynamoClient,
  createTableIfNotExists,
  TABLE_SCHEMA,
  tableExists,
  validateEnvironment,
  waitForTableActive,
};
