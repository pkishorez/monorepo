import type { Effect } from 'effect';
import type { DynamoDBClientService } from './generated/types.js';
import {
  makeSignedRequest,
  type DynamoDBClientConfig,
} from './signed-request.js';
import { DynamoDBClientError } from '../../domain/client-error/index.js';

type ClientMethod<T> = T extends (
  input: infer Input,
) => Effect.Effect<infer Output, infer Error, infer Requirements>
  ? (
      input: Input,
    ) => Effect.Effect<Output, Error | DynamoDBClientError, Requirements>
  : never;

export type DynamoDBClient = {
  readonly [Key in keyof DynamoDBClientService]: ClientMethod<
    DynamoDBClientService[Key]
  >;
};

export const makeDynamoDBClient = (
  config: DynamoDBClientConfig,
): DynamoDBClient => {
  const request = makeSignedRequest(config);

  return new Proxy({} as DynamoDBClient, {
    get: (_target, property) => {
      if (typeof property !== 'string' || property === 'then') return undefined;
      const operation = `${property.charAt(0).toUpperCase()}${property.slice(1)}`;
      return (input: unknown) => request(operation, input);
    },
  });
};

export { type DynamoDBClientConfig } from './signed-request.js';
export { DynamoDBClientError } from '../../domain/client-error/index.js';
export type {
  DynamoDBCredentialProvider,
  DynamoDBCredentials,
  DynamoDBCredentialsInput,
} from './credential-provider.js';
