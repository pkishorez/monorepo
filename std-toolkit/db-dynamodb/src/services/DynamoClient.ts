import { AwsClient } from "aws4fetch";
import * as Effect from "effect/Effect";
import { DynamodbError, type AwsErrorMeta } from "../errors.js";
import type { AwsCredentials, DynamoTableConfig } from "../types/index.js";

/**
 * Extracts the error name from an AWS error type string.
 * AWS errors are often formatted as "namespace#ErrorName".
 *
 * @param awsErrorType - The full AWS error type string
 * @returns The extracted error name
 */
function extractErrorName(awsErrorType: string): string {
  const parts = awsErrorType.split("#");
  return parts.length > 1 ? parts[1]! : awsErrorType;
}

/**
 * Creates an AWS4-authenticated client for making signed requests.
 *
 * @param config - Configuration with region and credentials
 * @returns An AwsClient instance for making signed requests
 */
async function createAwsClient(config: {
  region: string;
  credentials: AwsCredentials;
}) {
  const clientConfig: Record<string, unknown> = {
    accessKeyId: config.credentials.accessKeyId,
    secretAccessKey: config.credentials.secretAccessKey,
    service: "dynamodb",
    region: config.region,
  };

  if (config.credentials.sessionToken) {
    clientConfig.sessionToken = config.credentials.sessionToken;
  }

  return new AwsClient(clientConfig as any);
}

/**
 * Interface for the DynamoDB client with Effect-based operations.
 */
export interface DynamoDBClient {
  /** Retrieves a single item by its primary key */
  getItem(input: unknown): Effect.Effect<any, any>;
  /** Creates or replaces an item */
  putItem(input: unknown): Effect.Effect<any, any>;
  /** Updates attributes of an existing item */
  updateItem(input: unknown): Effect.Effect<any, any>;
  /** Deletes a single item by its primary key */
  deleteItem(input: unknown): Effect.Effect<any, any>;
  /** Queries items using a key condition expression */
  query(input: unknown): Effect.Effect<any, any>;
  /** Scans all items in a table or index */
  scan(input: unknown): Effect.Effect<any, any>;
  /** Executes a transactional write of multiple items */
  transactWriteItems(input: unknown): Effect.Effect<any, any>;
  /** Creates a new DynamoDB table */
  createTable(input: unknown): Effect.Effect<any, any>;
  /** Deletes a DynamoDB table */
  deleteTable(input: unknown): Effect.Effect<any, any>;
  /** Retrieves metadata about a table */
  describeTable(input: unknown): Effect.Effect<any, any>;
}

/**
 * Creates a DynamoDB client that uses AWS4 signing for authentication.
 * Uses the aws4fetch library to make signed HTTP requests to the DynamoDB API.
 *
 * @param config - Configuration for the DynamoDB connection
 * @returns A DynamoDBClient with Effect-wrapped operations
 * @throws Error if credentials are not provided
 */
export function createDynamoDB(config: DynamoTableConfig): DynamoDBClient {
  const region = config.region ?? "us-east-1";
  const endpoint =
    config.endpoint ?? `https://dynamodb.${region}.amazonaws.com/`;

  if (!config.credentials) {
    throw new Error("DynamoDB credentials are required");
  }

  const clientPromise = createAwsClient({
    region,
    credentials: config.credentials,
  });

  const makeRequest = (methodName: string, input: unknown) =>
    Effect.gen(function* () {
      const client = yield* Effect.promise(() => clientPromise);
      const action = methodName.charAt(0).toUpperCase() + methodName.slice(1);
      const body = JSON.stringify(input || {});

      const headers: Record<string, string> = {
        "Content-Type": "application/x-amz-json-1.0",
        "X-Amz-Target": `DynamoDB_20120810.${action}`,
        "Content-Length": body.length.toString(),
      };

      yield* Effect.logDebug("DynamoDB Request", {
        action,
        endpoint,
        headers,
        input,
      });

      const response = yield* Effect.promise(() =>
        client.fetch(endpoint, {
          method: "POST",
          headers,
          body,
        }),
      ).pipe(Effect.timeout("30 seconds"));

      const responseText = yield* Effect.promise(() => response.text());
      const statusCode = response.status;

      yield* Effect.logDebug("DynamoDB Response", {
        action,
        statusCode,
        responseText,
      });

      if (statusCode >= 200 && statusCode < 300) {
        if (!responseText) return {};
        return JSON.parse(responseText);
      }

      let errorData: Record<string, unknown> = {};
      try {
        errorData = JSON.parse(responseText);
      } catch {}

      let errorType = "UnknownError";
      let errorMessage = "Unknown error";

      if (errorData && typeof errorData === "object") {
        errorType =
          (errorData.__type as string) ||
          (errorData.code as string) ||
          "UnknownError";
        errorMessage =
          (errorData.Message as string) ||
          (errorData.message as string) ||
          "Unknown error";
      }

      const requestId =
        response.headers.get("x-amzn-requestid") ||
        response.headers.get("x-amz-request-id") ||
        undefined;

      const errorMeta: AwsErrorMeta = requestId
        ? { statusCode, requestId }
        : { statusCode };

      const simpleErrorName = extractErrorName(errorType);

      switch (simpleErrorName) {
        case "ThrottlingException":
        case "TooManyRequestsException":
        case "ProvisionedThroughputExceededException":
        case "RequestLimitExceeded":
          return yield* Effect.fail(DynamodbError.throttling(errorMeta));
        case "ServiceUnavailable":
        case "InternalServerError":
          return yield* Effect.fail(DynamodbError.serviceUnavailable(errorMeta));
        case "RequestTimeout":
          return yield* Effect.fail(DynamodbError.requestTimeout(errorMeta));
        case "AccessDeniedException":
          return yield* Effect.fail(DynamodbError.accessDenied(errorMeta));
        case "UnauthorizedException":
        case "UnrecognizedClientException":
          return yield* Effect.fail(DynamodbError.unauthorized(errorMeta));
        case "ValidationException":
          return yield* Effect.fail(DynamodbError.validationException(errorMeta));
        default:
          return yield* Effect.fail(
            DynamodbError.unknownAwsError(simpleErrorName, errorMessage, errorMeta),
          );
      }
    });

  return {
    getItem: (input) => makeRequest("getItem", input),
    putItem: (input) => makeRequest("putItem", input),
    updateItem: (input) => makeRequest("updateItem", input),
    deleteItem: (input) => makeRequest("deleteItem", input),
    query: (input) => makeRequest("query", input),
    scan: (input) => makeRequest("scan", input),
    transactWriteItems: (input) => makeRequest("transactWriteItems", input),
    createTable: (input) => makeRequest("createTable", input),
    deleteTable: (input) => makeRequest("deleteTable", input),
    describeTable: (input) => makeRequest("describeTable", input),
  };
}
