/* eslint-disable no-console */
import { afterAll, beforeAll, describe, it } from 'vitest';
import { AWSSDKClient } from './clients/aws-sdk-client.js';
import { EffectClient } from './clients/effect-client.js';
import { tableSchema, TEST_TABLE_NAME, testItems } from './shared/test-data.js';

describe('simple AWS SDK vs Effect Client Comparison', () => {
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

    // Clean up and create table
    try {
      await awsClient.deleteTable(TEST_TABLE_NAME);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch {
      // Table might not exist
    }

    await awsClient.createTable(tableSchema);
    await awsClient.waitForTableReady(TEST_TABLE_NAME);

    // Insert some test data
    for (const item of testItems.slice(0, 2)) {
      await awsClient.putItem(TEST_TABLE_NAME, item);
    }
  }, 30000);

  afterAll(async () => {
    try {
      await awsClient.deleteTable(TEST_TABLE_NAME);
    } catch {
      // Table cleanup failed
    }
  });

  async function measureOperation<T>(
    name: string,
    awsOp: () => Promise<T>,
    effectOp: () => Promise<T>,
    iterations: number = 3,
  ): Promise<void> {
    console.log(`\n🔍 Testing ${name}...`);

    // Warm up
    try {
      await awsOp();
      await effectOp();
    } catch (error) {
      console.log(`⚠️ Warm up failed for ${name}:`, error);
      return;
    }

    const awsTimes: number[] = [];
    const effectTimes: number[] = [];

    // Measure AWS SDK
    for (let i = 0; i < iterations; i++) {
      try {
        const start = performance.now();
        await awsOp();
        awsTimes.push(performance.now() - start);
      } catch (error) {
        console.log(`❌ AWS SDK ${name} failed:`, error);
        return;
      }
    }

    // Measure Effect client
    for (let i = 0; i < iterations; i++) {
      try {
        const start = performance.now();
        await effectOp();
        effectTimes.push(performance.now() - start);
      } catch (error) {
        console.log(`❌ Effect client ${name} failed:`, error);
        return;
      }
    }

    const awsAvg = awsTimes.reduce((a, b) => a + b, 0) / awsTimes.length;
    const effectAvg =
      effectTimes.reduce((a, b) => a + b, 0) / effectTimes.length;
    const difference = ((effectAvg - awsAvg) / awsAvg) * 100;

    console.log(`📊 ${name} Results:`);
    console.log(`  AWS SDK:    ${awsAvg.toFixed(2)}ms (avg)`);
    console.log(`  Effect:     ${effectAvg.toFixed(2)}ms (avg)`);
    console.log(
      `  Difference: ${difference > 0 ? '+' : ''}${difference.toFixed(1)}% (Effect vs AWS SDK)`,
    );

    const winner =
      Math.abs(difference) < 5 ? 'Tie' : difference < 0 ? 'Effect' : 'AWS SDK';
    console.log(`  Winner:     ${winner}`);
  }

  it('should compare basic operations', async () => {
    console.log(
      '\n🚀 Starting AWS SDK vs Effect Client Performance Comparison',
    );
    console.log('='.repeat(60));

    // Test ListTables
    await measureOperation(
      'ListTables',
      () => awsClient.listTables(),
      () => effectClient.listTables(),
    );

    // Test GetItem
    await measureOperation(
      'GetItem',
      () => awsClient.getItem(TEST_TABLE_NAME, { pk: 'USER#1', sk: 'PROFILE' }),
      () =>
        effectClient.getItem(TEST_TABLE_NAME, { pk: 'USER#1', sk: 'PROFILE' }),
    );

    // Test PutItem
    await measureOperation(
      'PutItem',
      () =>
        awsClient.putItem(TEST_TABLE_NAME, {
          pk: `TEST_AWS_${Date.now()}`,
          sk: 'DATA',
          name: 'AWS Test User',
          age: 30,
          email: 'aws@test.com',
          status: 'active',
        }),
      () =>
        effectClient.putItem(TEST_TABLE_NAME, {
          pk: `TEST_EFFECT_${Date.now()}`,
          sk: 'DATA',
          name: 'Effect Test User',
          age: 30,
          email: 'effect@test.com',
          status: 'active',
        }),
    );

    // Test DescribeTable
    await measureOperation(
      'DescribeTable',
      () => awsClient.describeTable(TEST_TABLE_NAME),
      () => effectClient.describeTable(TEST_TABLE_NAME),
    );

    // Test Scan with limit
    await measureOperation(
      'Scan',
      () => awsClient.scan(TEST_TABLE_NAME, undefined, undefined, undefined, 5),
      () =>
        effectClient.scan(TEST_TABLE_NAME, undefined, undefined, undefined, 5),
    );

    console.log('='.repeat(60));
    console.log('✅ Performance comparison completed!');
    console.log('\nKey takeaways:');
    console.log('• Both clients connect to the same local DynamoDB instance');
    console.log('• Small differences may be due to implementation overhead');
    console.log('• Effect client provides functional programming benefits');
    console.log('• AWS SDK is more direct but Effect enables composition');
    console.log("• Choose based on your team's architectural preferences");
  }, 60000);
});

