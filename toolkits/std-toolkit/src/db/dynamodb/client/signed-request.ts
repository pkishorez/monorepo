import { AwsClient } from 'aws4fetch';
import { Effect } from 'effect';
import { DynamoDBClientError } from './client-error.js';
import type { DynamoDBCredentialsInput } from './credential-provider.js';
import { resolveCredentials } from './credential-provider.js';

export interface DynamoDBClientConfig {
  readonly region?: string;
  readonly credentials: DynamoDBCredentialsInput;
  readonly endpoint?: string;
}

const errorName = (value: string): string => {
  const separator = value.indexOf('#');
  return separator === -1 ? value : value.slice(separator + 1);
};

const makeAwsClient = async (
  config: DynamoDBClientConfig,
): Promise<AwsClient> => {
  const credentials = await resolveCredentials(config.credentials);
  return new AwsClient({
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    ...(credentials.sessionToken
      ? { sessionToken: credentials.sessionToken }
      : {}),
    service: 'dynamodb',
    region: config.region ?? 'us-east-1',
  });
};

export const makeSignedRequest = (config: DynamoDBClientConfig) => {
  const region = config.region ?? 'us-east-1';
  const endpoint =
    config.endpoint ?? `https://dynamodb.${region}.amazonaws.com/`;

  return (operation: string, input: unknown): Effect.Effect<unknown, unknown> =>
    Effect.gen(function* () {
      const client = yield* Effect.tryPromise({
        try: () => makeAwsClient(config),
        catch: (cause) => new DynamoDBClientError({ operation, cause }),
      });
      const body = JSON.stringify(input ?? {});

      const response = yield* Effect.tryPromise({
        try: () =>
          client.fetch(endpoint, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/x-amz-json-1.0',
              'X-Amz-Target': `DynamoDB_20120810.${operation}`,
              'Content-Length': String(new TextEncoder().encode(body).length),
            },
            body,
          }),
        catch: (cause) => new DynamoDBClientError({ operation, cause }),
      }).pipe(
        Effect.timeout('30 seconds'),
        Effect.mapError((cause) =>
          cause instanceof DynamoDBClientError
            ? cause
            : new DynamoDBClientError({ operation, cause }),
        ),
      );

      const responseText = yield* Effect.tryPromise({
        try: () => response.text(),
        catch: (cause) =>
          new DynamoDBClientError({
            operation,
            cause,
            statusCode: response.status,
          }),
      });

      if (response.ok) {
        if (!responseText) return {};
        return yield* Effect.try({
          try: () => JSON.parse(responseText),
          catch: (cause) =>
            new DynamoDBClientError({
              operation,
              cause,
              statusCode: response.status,
              response: responseText,
            }),
        });
      }

      let responseBody: Record<string, unknown> = {};
      try {
        responseBody = JSON.parse(responseText) as Record<string, unknown>;
      } catch {
        return yield* Effect.fail(
          new DynamoDBClientError({
            operation,
            cause: responseText,
            statusCode: response.status,
            response: responseText,
          }),
        );
      }

      const requestId =
        response.headers.get('x-amzn-requestid') ??
        response.headers.get('x-amz-request-id') ??
        undefined;
      const tag = errorName(
        String(responseBody.__type ?? responseBody.code ?? 'UnknownAwsError'),
      );
      const awsError = {
        ...responseBody,
        _tag: tag,
        statusCode: response.status,
        ...(requestId ? { requestId } : {}),
      };

      if (tag === 'UnknownAwsError') {
        return yield* Effect.fail(
          new DynamoDBClientError({
            operation,
            cause: awsError,
            statusCode: response.status,
            ...(requestId ? { requestId } : {}),
            response: responseBody,
          }),
        );
      }

      return yield* Effect.fail(awsError);
    });
};
