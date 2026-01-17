#!/usr/bin/env bun

/**
 * Generate Effect types for DynamoDB from Smithy specs
 *
 * This script generates TypeScript types with Effect integration specifically
 * for DynamoDB service from the AWS Smithy models.
 * Fetches specs from the AWS GitHub repository.
 *
 * Usage:
 *   bun src/generate.ts [output-path]
 *
 * Examples:
 *   bun src/generate.ts                                    # Default output
 *   bun src/generate.ts src/services/dynamodb/types.ts     # Custom output path
 */

import process from "node:process";
import { NodeFileSystem, NodeHttpClient } from "@effect/platform-node";
import { Effect } from "effect";
import { generateDynamoDBTypes } from "./generate/index.js";

// CLI handling
if (import.meta.main) {
  const args = process.argv.slice(2);
  const outputPath = args[0];

  const program = generateDynamoDBTypes(outputPath).pipe(
    Effect.provide(NodeFileSystem.layer),
    Effect.provide(NodeHttpClient.layer),
  );

  Effect.runPromise(program).catch(console.error);
}

export { generateDynamoDBCode, generateDynamoDBTypes } from "./generate/index.js";