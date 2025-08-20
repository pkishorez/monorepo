/* eslint-disable no-console */
import { afterAll, beforeAll, describe, it } from "vitest";
import { AWSSDKClient } from "./clients/aws-sdk-client.js";
import { EffectClient } from "./clients/effect-client.js";
import {
  generateTestItems,
  tableSchema,
  TEST_TABLE_NAME,
  testItems,
} from "./shared/test-data.js";

interface BenchmarkResult {
  operation: string;
  awsTime: number;
  effectTime: number;
  difference: number;
  improvement: string;
}

describe("comprehensive Performance Benchmark", () => {
  let awsClient: AWSSDKClient;
  let effectClient: EffectClient;
  const benchmarkResults: BenchmarkResult[] = [];

  const clientConfig = {
    region: "us-east-1",
    endpoint: "http://localhost:8000",
    credentials: {
      accessKeyId: "local",
      secretAccessKey: "local",
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

    // Insert test data
    for (const item of testItems) {
      await awsClient.putItem(TEST_TABLE_NAME, item);
    }
  }, 60000);

  afterAll(async () => {
    // Print comprehensive benchmark results
    console.log(`\n${"=".repeat(80)}`);
    console.log("📊 COMPREHENSIVE DYNAMODB CLIENT BENCHMARK RESULTS");
    console.log("=".repeat(80));

    console.log("\n🏆 Performance Summary:");
    console.log("-".repeat(80));
    console.log(
      `${"Operation".padEnd(25) + "AWS SDK (ms)".padEnd(15) + "Effect (ms)".padEnd(15) + "Difference".padEnd(15)}Winner`,
    );
    console.log("-".repeat(80));

    let awsWins = 0;
    let effectWins = 0;
    let ties = 0;

    for (const result of benchmarkResults) {
      const winner =
        Math.abs(result.difference) < 5
          ? "~Tie"
          : result.difference < 0
            ? "Effect"
            : "AWS SDK";

      if (winner === "AWS SDK") awsWins++;
      else if (winner === "Effect") effectWins++;
      else ties++;

      console.log(
        result.operation.padEnd(25) +
          result.awsTime.toFixed(1).padEnd(15) +
          result.effectTime.toFixed(1).padEnd(15) +
          `${result.difference > 0 ? "+" : ""}${result.difference.toFixed(1)}%`.padEnd(
            15,
          ) +
          winner,
      );
    }

    console.log("-".repeat(80));
    console.log(
      `📈 Overall Score: AWS SDK: ${awsWins} wins, Effect: ${effectWins} wins, Ties: ${ties}`,
    );

    const totalAwsTime = benchmarkResults.reduce(
      (sum, r) => sum + r.awsTime,
      0,
    );
    const totalEffectTime = benchmarkResults.reduce(
      (sum, r) => sum + r.effectTime,
      0,
    );
    const overallDiff = ((totalEffectTime - totalAwsTime) / totalAwsTime) * 100;

    console.log(
      `⏱️  Total Time: AWS SDK: ${totalAwsTime.toFixed(1)}ms, Effect: ${totalEffectTime.toFixed(1)}ms`,
    );
    console.log(
      `🎯 Overall Performance: Effect is ${overallDiff.toFixed(1)}% ${overallDiff > 0 ? "slower" : "faster"} than AWS SDK`,
    );

    console.log("\n💡 Analysis:");
    if (Math.abs(overallDiff) < 10) {
      console.log("• Performance is very similar between both clients");
    } else if (overallDiff > 0) {
      console.log("• AWS SDK has better raw performance");
      console.log(
        "• Effect client trades some performance for functional programming benefits",
      );
    } else {
      console.log("• Effect client has better performance");
    }

    console.log("• Effect provides better error handling and composability");
    console.log(
      "• AWS SDK is more direct but Effect enables functional composition",
    );
    console.log(
      "• Choose based on your team's preferences: FP vs imperative style",
    );
    console.log("=".repeat(80));

    // Cleanup
    try {
      await awsClient.deleteTable(TEST_TABLE_NAME);
    } catch {
      // Table cleanup failed
    }
  });

  async function benchmark(
    name: string,
    awsOperation: () => Promise<any>,
    effectOperation: () => Promise<any>,
    iterations: number = 5,
  ): Promise<void> {
    // Warm up
    await awsOperation();
    await effectOperation();

    const awsTimes: number[] = [];
    const effectTimes: number[] = [];

    // Benchmark AWS SDK
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await awsOperation();
      awsTimes.push(performance.now() - start);
    }

    // Benchmark Effect client
    for (let i = 0; i < iterations; i++) {
      const start = performance.now();
      await effectOperation();
      effectTimes.push(performance.now() - start);
    }

    const awsAvg = awsTimes.reduce((a, b) => a + b, 0) / awsTimes.length;
    const effectAvg =
      effectTimes.reduce((a, b) => a + b, 0) / effectTimes.length;
    const difference = ((effectAvg - awsAvg) / awsAvg) * 100;

    benchmarkResults.push({
      operation: name,
      awsTime: awsAvg,
      effectTime: effectAvg,
      difference,
      improvement: difference < 0 ? "Effect faster" : "AWS SDK faster",
    });
  }

  it("should benchmark all core operations", async () => {
    // Single item operations
    await benchmark(
      "PutItem",
      () =>
        awsClient.putItem(TEST_TABLE_NAME, {
          pk: `BENCH_AWS_${Date.now()}`,
          sk: "DATA",
          name: "AWS Bench User",
          age: 30,
          email: "aws@bench.com",
          status: "active",
        }),
      () =>
        effectClient.putItem(TEST_TABLE_NAME, {
          pk: `BENCH_EFFECT_${Date.now()}`,
          sk: "DATA",
          name: "Effect Bench User",
          age: 30,
          email: "effect@bench.com",
          status: "active",
        }),
    );

    await benchmark(
      "GetItem",
      () => awsClient.getItem(TEST_TABLE_NAME, { pk: "USER#1", sk: "PROFILE" }),
      () =>
        effectClient.getItem(TEST_TABLE_NAME, { pk: "USER#1", sk: "PROFILE" }),
    );

    await benchmark(
      "UpdateItem",
      () =>
        awsClient.updateItem(
          TEST_TABLE_NAME,
          { pk: "USER#2", sk: "PROFILE" },
          "SET age = :age",
          { ":age": Math.floor(Math.random() * 50) + 20 },
        ),
      () =>
        effectClient.updateItem(
          TEST_TABLE_NAME,
          { pk: "USER#2", sk: "PROFILE" },
          "SET age = :age",
          { ":age": Math.floor(Math.random() * 50) + 20 },
        ),
    );

    // Query operations
    await benchmark(
      "Query-PK",
      () => awsClient.query(TEST_TABLE_NAME, "pk = :pk", { ":pk": "USER#1" }),
      () =>
        effectClient.query(TEST_TABLE_NAME, "pk = :pk", { ":pk": "USER#1" }),
    );

    await benchmark(
      "Query-GSI",
      () =>
        awsClient.query(
          TEST_TABLE_NAME,
          "gsi1pk = :gsi1pk",
          { ":gsi1pk": "STATUS#active" },
          undefined,
          "GSI1",
          undefined,
          5,
        ),
      () =>
        effectClient.query(
          TEST_TABLE_NAME,
          "gsi1pk = :gsi1pk",
          { ":gsi1pk": "STATUS#active" },
          undefined,
          "GSI1",
          undefined,
          5,
        ),
    );

    // Scan operations
    await benchmark(
      "Scan",
      () =>
        awsClient.scan(TEST_TABLE_NAME, undefined, undefined, undefined, 10),
      () =>
        effectClient.scan(TEST_TABLE_NAME, undefined, undefined, undefined, 10),
    );

    await benchmark(
      "Scan-Filter",
      () =>
        awsClient.scan(
          TEST_TABLE_NAME,
          "#status = :status",
          { ":status": "active" },
          { "#status": "status" },
          10,
        ),
      () =>
        effectClient.scan(
          TEST_TABLE_NAME,
          "#status = :status",
          { ":status": "active" },
          { "#status": "status" },
          10,
        ),
    );

    // Batch operations
    await benchmark(
      "BatchWrite-10",
      async () => {
        const items = generateTestItems(10).map((item) => ({
          ...item,
          pk: `AWS_BATCH_${item.pk}`,
        }));
        await awsClient.batchWriteItem(TEST_TABLE_NAME, items);
      },
      async () => {
        const items = generateTestItems(10).map((item) => ({
          ...item,
          pk: `EFFECT_BATCH_${item.pk}`,
        }));
        await effectClient.batchWriteItem(TEST_TABLE_NAME, items);
      },
      3,
    );

    // Prepare some data for batch get
    const batchGetKeys = Array.from({ length: 10 }, (_, i) => ({
      pk: `PERF#${i}`,
      sk: "DATA",
    }));
    for (let i = 0; i < 10; i++) {
      await awsClient.putItem(TEST_TABLE_NAME, {
        pk: `PERF#${i}`,
        sk: "DATA",
        name: `Batch User ${i}`,
        age: 20 + i,
        email: `batch${i}@test.com`,
        status: "active",
      });
    }

    await benchmark(
      "BatchGet-10",
      () => awsClient.batchGetItem(TEST_TABLE_NAME, batchGetKeys.slice(0, 10)),
      () =>
        effectClient.batchGetItem(TEST_TABLE_NAME, batchGetKeys.slice(0, 10)),
      3,
    );

    // Table operations
    await benchmark(
      "ListTables",
      () => awsClient.listTables(),
      () => effectClient.listTables(),
    );

    await benchmark(
      "DescribeTable",
      () => awsClient.describeTable(TEST_TABLE_NAME),
      () => effectClient.describeTable(TEST_TABLE_NAME),
    );
  }, 120000); // 2 minute timeout for comprehensive benchmark
});

