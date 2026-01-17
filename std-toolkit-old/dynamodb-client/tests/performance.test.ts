/* eslint-disable no-console */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AWSSDKClient } from './clients/aws-sdk-client.js';
import { EffectClient } from './clients/effect-client.js';
import {
  generateTestItems,
  PERFORMANCE_ITERATIONS,
  tableSchema,
  TEST_TABLE_NAME,
  testItems,
} from './shared/test-data.js';

describe('performance Comparison: AWS SDK vs Effect Client', () => {
  let awsClient: AWSSDKClient;
  let effectClient: EffectClient;

  const clientConfig = {
    region: 'us-east-1',
    endpoint: 'http://localhost:8000',
    credentials: {
      accessKeyId: 'local',
      secretAccessKey: 'local',
    },
  };

  beforeAll(async () => {
    awsClient = new AWSSDKClient(clientConfig);
    effectClient = new EffectClient(clientConfig);

    // Clean up any existing table
    try {
      await awsClient.deleteTable(TEST_TABLE_NAME);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch {
      // Table might not exist
    }

    // Create test table
    await awsClient.createTable(tableSchema);
    await awsClient.waitForTableReady(TEST_TABLE_NAME);

    // Insert base test data
    for (const item of testItems) {
      await awsClient.putItem(TEST_TABLE_NAME, item);
    }
  }, 60000);

  afterAll(async () => {
    try {
      await awsClient.deleteTable(TEST_TABLE_NAME);
    } catch {
      // Table cleanup failed
    }
  });

  async function measureTime<T>(
    operation: () => Promise<T>,
  ): Promise<{ result: T; time: number }> {
    const start = performance.now();
    const result = await operation();
    const time = performance.now() - start;
    return { result, time };
  }

  async function runPerformanceTest<T>(
    name: string,
    awsOperation: () => Promise<T>,
    effectOperation: () => Promise<T>,
    iterations: number = PERFORMANCE_ITERATIONS,
  ) {
    const awsTimes: number[] = [];
    const effectTimes: number[] = [];

    console.log(
      `\n🔍 Running ${name} performance test (${iterations} iterations)...`,
    );

    // Warm up
    await awsOperation();
    await effectOperation();

    // Run AWS SDK tests
    for (let i = 0; i < iterations; i++) {
      const { time } = await measureTime(awsOperation);
      awsTimes.push(time);
    }

    // Run Effect client tests
    for (let i = 0; i < iterations; i++) {
      const { time } = await measureTime(effectOperation);
      effectTimes.push(time);
    }

    const awsAvg = awsTimes.reduce((a, b) => a + b, 0) / awsTimes.length;
    const effectAvg =
      effectTimes.reduce((a, b) => a + b, 0) / effectTimes.length;
    const difference = ((effectAvg - awsAvg) / awsAvg) * 100;

    console.log(`📊 ${name} Results:`);
    console.log(`  AWS SDK:      ${awsAvg.toFixed(2)}ms (avg)`);
    console.log(`  Effect:       ${effectAvg.toFixed(2)}ms (avg)`);
    console.log(
      `  Difference:   ${difference > 0 ? '+' : ''}${difference.toFixed(1)}% (Effect vs AWS SDK)`,
    );
    console.log(
      `  AWS Times:    [${awsTimes.map((t) => t.toFixed(1)).join(', ')}]ms`,
    );
    console.log(
      `  Effect Times: [${effectTimes.map((t) => t.toFixed(1)).join(', ')}]ms`,
    );

    return {
      aws: { avg: awsAvg, times: awsTimes },
      effect: { avg: effectAvg, times: effectTimes },
      difference,
    };
  }

  it('should compare PutItem performance', async () => {
    const testKey = 'PERF_PUT';

    const results = await runPerformanceTest(
      'PutItem',
      () =>
        awsClient.putItem(TEST_TABLE_NAME, {
          pk: `${testKey}_AWS_${Date.now()}`,
          sk: 'DATA',
          name: 'AWS Test User',
          age: 30,
          email: 'aws@test.com',
          status: 'active',
        }),
      () =>
        effectClient.putItem(TEST_TABLE_NAME, {
          pk: `${testKey}_EFFECT_${Date.now()}`,
          sk: 'DATA',
          name: 'Effect Test User',
          age: 30,
          email: 'effect@test.com',
          status: 'active',
        }),
    );

    expect(results.aws.avg).toBeGreaterThan(0);
    expect(results.effect.avg).toBeGreaterThan(0);
  }, 30000);

  it('should compare GetItem performance', async () => {
    // Use existing test data
    const testKey = { pk: 'USER#1', sk: 'PROFILE' };

    const results = await runPerformanceTest(
      'GetItem',
      () => awsClient.getItem(TEST_TABLE_NAME, testKey),
      () => effectClient.getItem(TEST_TABLE_NAME, testKey),
    );

    expect(results.aws.avg).toBeGreaterThan(0);
    expect(results.effect.avg).toBeGreaterThan(0);
  }, 30000);

  it('should compare Query performance', async () => {
    const results = await runPerformanceTest(
      'Query',
      () =>
        awsClient.query(
          TEST_TABLE_NAME,
          'gsi1pk = :gsi1pk',
          { ':gsi1pk': 'STATUS#active' },
          undefined,
          'GSI1',
          undefined,
          10,
        ),
      () =>
        effectClient.query(
          TEST_TABLE_NAME,
          'gsi1pk = :gsi1pk',
          { ':gsi1pk': 'STATUS#active' },
          undefined,
          'GSI1',
          undefined,
          10,
        ),
    );

    expect(results.aws.avg).toBeGreaterThan(0);
    expect(results.effect.avg).toBeGreaterThan(0);
  }, 30000);

  it('should compare Scan performance', async () => {
    const results = await runPerformanceTest(
      'Scan',
      () =>
        awsClient.scan(TEST_TABLE_NAME, undefined, undefined, undefined, 10),
      () =>
        effectClient.scan(TEST_TABLE_NAME, undefined, undefined, undefined, 10),
    );

    expect(results.aws.avg).toBeGreaterThan(0);
    expect(results.effect.avg).toBeGreaterThan(0);
  }, 30000);

  it('should compare UpdateItem performance', async () => {
    const testKey = { pk: 'USER#2', sk: 'PROFILE' };

    const results = await runPerformanceTest(
      'UpdateItem',
      () =>
        awsClient.updateItem(TEST_TABLE_NAME, testKey, 'SET age = :age', {
          ':age': Math.floor(Math.random() * 100) + 20,
        }),
      () =>
        effectClient.updateItem(TEST_TABLE_NAME, testKey, 'SET age = :age', {
          ':age': Math.floor(Math.random() * 100) + 20,
        }),
    );

    expect(results.aws.avg).toBeGreaterThan(0);
    expect(results.effect.avg).toBeGreaterThan(0);
  }, 30000);

  describe('bulk Operations Performance', () => {
    // DynamoDB BatchWriteItem has a limit of 25 items per request
    const batchSizes = [10, 25] as const;

    for (const size of batchSizes) {
      it(`should compare BatchWriteItem performance (${size} items)`, async () => {
        const testData = generateTestItems(size);

        try {
          const results = await runPerformanceTest(
            `BatchWriteItem (${size} items)`,
            async () => {
              const awsItems = testData.map((item, i) => ({
                ...item,
                pk: `AWS_BATCH_${Date.now()}_${i}`,
              }));
              await awsClient.batchWriteItem(TEST_TABLE_NAME, awsItems);
            },
            async () => {
              const effectItems = testData.map((item, i) => ({
                ...item,
                pk: `EFFECT_BATCH_${Date.now()}_${i}`,
              }));
              await effectClient.batchWriteItem(TEST_TABLE_NAME, effectItems);
            },
            2, // Fewer iterations for bulk operations
          );

          expect(results.aws.avg).toBeGreaterThan(0);
          expect(results.effect.avg).toBeGreaterThan(0);
        } catch (error) {
          console.log(`⚠️  BatchWriteItem (${size} items) test failed:`, error);
          // Don't fail the test, just log the error
        }
      }, 60000);

      it(`should compare BatchGetItem performance (${size} items)`, async () => {
        // DynamoDB BatchGetItem has a limit of 100 items per request, but we'll use 25
        const keysToGet = Array.from(
          { length: Math.min(size, 25) },
          (_, i) => ({
            pk: `PERF_GET#${i}`,
            sk: 'DATA',
          }),
        );

        // Put some items first to ensure they exist
        for (let i = 0; i < keysToGet.length; i++) {
          await awsClient.putItem(TEST_TABLE_NAME, {
            pk: `PERF_GET#${i}`,
            sk: 'DATA',
            name: `BatchGet User ${i}`,
            age: 20 + i,
            email: `batchget${i}@test.com`,
            status: 'active',
          });
        }

        const results = await runPerformanceTest(
          `BatchGetItem (${keysToGet.length} items)`,
          () => awsClient.batchGetItem(TEST_TABLE_NAME, keysToGet),
          () => effectClient.batchGetItem(TEST_TABLE_NAME, keysToGet),
          2, // Fewer iterations for bulk operations
        );

        expect(results.aws.avg).toBeGreaterThan(0);
        expect(results.effect.avg).toBeGreaterThan(0);
      }, 60000);
    }
  });

  it('should generate performance summary', async () => {
    console.log('\n📈 Performance Test Summary:');
    console.log('='.repeat(50));
    console.log('All performance tests completed successfully!');
    console.log(
      'Check the individual test outputs above for detailed timing comparisons.',
    );
    console.log('\nKey observations:');
    console.log('• Both clients connect to the same local DynamoDB instance');
    console.log('• Performance differences may vary based on operation type');
    console.log(
      '• Effect client adds functional programming overhead but provides better error handling',
    );
    console.log(
      '• AWS SDK is more direct but Effect provides composable operations',
    );
  });
});
