import { Effect, Layer } from 'effect';
import {
  Credentials,
  fromAwsCredentialIdentity,
} from '@distilled.cloud/aws/Credentials';
import { Region, type RegionName } from '@distilled.cloud/aws/Region';
import { getCallerIdentity } from '@distilled.cloud/aws/sts';
import type { awsConnection } from '../../../../shared/contracts/state-stores/index.ts';
import * as dynamodb from '../dynamodb/index.ts';

type Connection = typeof awsConnection.Type;
const environment = (connection: Connection) =>
  Layer.mergeAll(
    Layer.succeed(
      Credentials,
      Effect.succeed(
        fromAwsCredentialIdentity(connection, connection.region as RegionName),
      ),
    ),
    Layer.succeed(Region, Effect.succeed(connection.region as RegionName)),
  );

export const providers = (connection: Connection | null | undefined) =>
  connection
    ? dynamodb.providers().pipe(Layer.provideMerge(environment(connection)))
    : Layer.empty;

export const check = (
  connection: Connection,
  row: { attr?: unknown; removalPolicy?: string },
) =>
  Effect.gen(function* () {
    const identity = yield* getCallerIdentity({});
    if (!identity.Account)
      return 'Could not determine the AWS account for this connection.';
    return yield* dynamodb.check(row, connection.region, identity.Account);
  }).pipe(
    Effect.provide(environment(connection)),
    Effect.catch((error) =>
      Effect.succeed(
        `Could not verify this table with the saved AWS credentials: ${detail(error)}`,
      ),
    ),
  );

// The AWS error text says whether the keys, the region, or DynamoDB permissions are the problem.
const detail = (error: unknown) => {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : String(error);
  return message.length > 400 ? `${message.slice(0, 400)}…` : message;
};
