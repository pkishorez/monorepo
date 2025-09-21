import type { AwsErrorMeta } from './error.js';
import { AwsClient } from 'aws4fetch';
import * as Data from 'effect/Data';
import * as Effect from 'effect/Effect';
import {
  AccessDeniedException,
  RequestTimeout,
  ServiceUnavailable,
  ThrottlingException,
  UnauthorizedException,
  ValidationException,
} from './error.js';

// Helper function to extract simple error name from AWS namespaced error type
function extractErrorName(awsErrorType: string): string {
  // AWS returns errors like "com.amazonaws.dynamodb.v20120810#ResourceNotFoundException"
  // We need to extract "ResourceNotFoundException"
  const parts = awsErrorType.split('#');
  return parts.length > 1 ? parts[1] : awsErrorType;
}

// Helper to create service-specific error dynamically
function createServiceError(
  errorName: string,
  errorMeta: AwsErrorMeta & { message?: string },
) {
  // Create a tagged error dynamically with the correct error name
  const ErrorClass = Data.TaggedError(errorName)<
    AwsErrorMeta & { message?: string }
  >;
  return new ErrorClass(errorMeta);
}

// Types
export type AwsRegion = string;

export interface AwsCredentials {
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly sessionToken?: string;
}

// Client configuration options
export interface AWSClientConfig {
  readonly region?: string;
  readonly credentials?: AwsCredentials;
  readonly endpoint?: string;
}

// Base AWS service class that DynamoDB extends
export abstract class AWSServiceClient {
  protected readonly config: Required<AWSClientConfig>;
  constructor(config?: AWSClientConfig) {
    this.config = {
      region: config?.region ?? 'us-east-1',
      credentials: config?.credentials ?? (undefined as any), // Will be resolved later
      endpoint: config?.endpoint ?? (undefined as any), // Will be resolved per service
    };
  }
}

// Promise-based AWS client creator
async function createAwsClient(config: Required<AWSClientConfig>) {
  // Use provided credentials or fall back to AWS credential chain
  const credentials = config.credentials;

  const clientConfig: any = {
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    service: 'dynamodb',
    region: config.region,
  };

  if (credentials.sessionToken) {
    clientConfig.sessionToken = credentials.sessionToken;
  }

  return new AwsClient(clientConfig);
}

// DynamoDB-specific service proxy creator
export function createDynamoDBProxy<T>(config: AWSClientConfig = {}): T {
  const resolvedConfig: Required<AWSClientConfig> = {
    region: config.region ?? 'us-east-1',
    credentials: config.credentials ?? (undefined as any), // Will be resolved later
    endpoint: config.endpoint ?? (undefined as any), // Will be resolved per service
  };

  const _client: Promise<AwsClient> = createAwsClient(resolvedConfig);

  return new Proxy(
    {},
    {
      get(_, methodName: string | symbol) {
        if (typeof methodName !== 'string') {
          return undefined;
        }

        return (input: unknown) =>
          Effect.gen(function* () {
            const client = yield* Effect.promise(() => _client);

            // Convert camelCase method to PascalCase action
            const action =
              methodName.charAt(0).toUpperCase() + methodName.slice(1);

            // Build AWS JSON 1.0 request body
            const body = JSON.stringify(input || {});

            // Build headers for AWS JSON 1.0 protocol
            const headers: Record<string, string> = {
              'Content-Type': 'application/x-amz-json-1.0',
              'X-Amz-Target': `DynamoDB_20120810.${action}`,
              'Content-Length': body.length.toString(),
            };

            // Use custom endpoint or construct regional AWS endpoint
            const endpoint = resolvedConfig.endpoint
              ? resolvedConfig.endpoint
              : `https://dynamodb.${resolvedConfig.region}.amazonaws.com/`;

            // Log the AWS request
            yield* Effect.logDebug('DynamoDB Request', {
              action,
              endpoint,
              headers,
              input,
              body,
            });

            const response = yield* Effect.promise(() =>
              client.fetch(endpoint, {
                method: 'POST',
                headers,
                body,
              }),
            ).pipe(Effect.timeout('30 seconds'));

            const responseText = yield* Effect.promise(() => response.text());
            const statusCode = response.status;

            // Log the AWS response
            yield* Effect.logDebug('DynamoDB Response', {
              action,
              statusCode,
              headers: (() => {
                const headersObj: Record<string, string> = {};
                response.headers.forEach((value, key) => {
                  headersObj[key] = value;
                });
                return headersObj;
              })(),
              responseText,
            });

            if (statusCode >= 200 && statusCode < 300) {
              // Success
              if (!responseText) return {};
              return JSON.parse(responseText);
            } else {
              // Error handling for AWS JSON 1.0 protocol
              let errorData: any = {};
              try {
                errorData = JSON.parse(responseText);
              } catch {
                // If response isn't JSON, treat as unknown error
              }

              // Extract error info from AWS JSON format
              let errorType = 'UnknownError';
              let errorMessage = 'Unknown error';

              if (errorData && typeof errorData === 'object') {
                errorType =
                  errorData.__type || errorData.code || 'UnknownError';
                errorMessage =
                  errorData.Message || errorData.message || 'Unknown error';
              }

              // Get request ID from headers
              const requestId =
                response.headers.get('x-amzn-requestid') ||
                response.headers.get('x-amz-request-id') ||
                undefined;

              const errorMeta: AwsErrorMeta = requestId
                ? { statusCode, requestId }
                : { statusCode };

              // Extract simple error name from AWS namespaced error type
              const simpleErrorName = extractErrorName(errorType);

              // Map to specific error types
              switch (simpleErrorName) {
                case 'ThrottlingException':
                case 'TooManyRequestsException':
                case 'ProvisionedThroughputExceededException':
                case 'RequestLimitExceeded':
                  yield* Effect.fail(new ThrottlingException(errorMeta));
                  break;
                case 'ServiceUnavailable':
                case 'InternalServerError':
                  yield* Effect.fail(new ServiceUnavailable(errorMeta));
                  break;
                case 'RequestTimeout':
                  yield* Effect.fail(new RequestTimeout(errorMeta));
                  break;
                case 'AccessDeniedException':
                  yield* Effect.fail(new AccessDeniedException(errorMeta));
                  break;
                case 'UnauthorizedException':
                case 'UnrecognizedClientException':
                  yield* Effect.fail(new UnauthorizedException(errorMeta));
                  break;
                case 'ValidationException':
                  yield* Effect.fail(new ValidationException(errorMeta));
                  break;
                default:
                  // All service-specific errors - create dynamically with correct _tag
                  yield* Effect.fail(
                    createServiceError(simpleErrorName, {
                      ...errorMeta,
                      message: errorMessage,
                    }),
                  );
              }
            }
          });
      },
    },
  ) as T;
}
