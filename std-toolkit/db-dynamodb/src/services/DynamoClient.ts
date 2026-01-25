import { AwsClient } from "aws4fetch";
import * as Effect from "effect/Effect";
import { DynamodbError, type AwsErrorMeta } from "../errors.js";
import type { AwsCredentials, DynamoTableConfig } from "../types/index.js";

function extractErrorName(awsErrorType: string): string {
  const parts = awsErrorType.split("#");
  return parts.length > 1 ? parts[1]! : awsErrorType;
}

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

export interface DynamoDBClient {
  getItem(input: unknown): Effect.Effect<any, any>;
  putItem(input: unknown): Effect.Effect<any, any>;
  updateItem(input: unknown): Effect.Effect<any, any>;
  deleteItem(input: unknown): Effect.Effect<any, any>;
  query(input: unknown): Effect.Effect<any, any>;
  scan(input: unknown): Effect.Effect<any, any>;
  transactWriteItems(input: unknown): Effect.Effect<any, any>;
  createTable(input: unknown): Effect.Effect<any, any>;
  describeTable(input: unknown): Effect.Effect<any, any>;
}

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
      } catch {
        // ignore parse errors
      }

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
    describeTable: (input) => makeRequest("describeTable", input),
  };
}
