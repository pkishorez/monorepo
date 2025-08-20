import type { AWSClientConfig } from "./client.js";
// Re-export types and client functionality
// Create a convenience function for creating a DynamoDB client
import type { DynamoDB } from "./services/dynamodb/types.js";
import { createDynamoDBProxy } from "./client.js";

export {
  type AWSClientConfig,
  type AwsCredentials,
  type AwsRegion,
  AWSServiceClient,
  createDynamoDBProxy,
} from "./client.js";

// Re-export error types
export {
  AccessDeniedException,
  type AwsErrorMeta,
  type CommonAwsError,
  RequestTimeout,
  ServiceUnavailable,
  ThrottlingException,
  UnauthorizedException,
  UnknownError,
  ValidationException,
} from "./error.js";

// Re-export generated DynamoDB types
export * from "./services/dynamodb/types.js";

/**
 * Create a new DynamoDB client with Effect support
 *
 * @example
 * ```typescript
 * import { createDynamoDB } from "dynamodb-client";
 *
 * const dynamodb = createDynamoDB({ region: "us-west-2" });
 *
 * // Use the client
 * const result = await Effect.runPromise(
 *   dynamodb.listTables({ Limit: 10 })
 * );
 * ```
 */
export function createDynamoDB(config?: AWSClientConfig): DynamoDB {
  return createDynamoDBProxy<DynamoDB>(config);
}

