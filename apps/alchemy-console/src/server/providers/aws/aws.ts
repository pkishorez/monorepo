import { Effect, Layer } from 'effect';
import {
  Credentials,
  fromAwsCredentialIdentity,
} from '@distilled.cloud/aws/Credentials';
import { Region, type RegionName } from '@distilled.cloud/aws/Region';
import { getCallerIdentity } from '@distilled.cloud/aws/sts';
import {
  ProviderFailure,
  type awsSecret,
} from '../../../shared/contracts/credentials/index.ts';
import * as dynamodb from './dynamodb.ts';

type Secret = typeof awsSecret.Type;
type Row = {
  status?: string;
  props?: unknown;
  attr?: unknown;
  removalPolicy?: string;
};
const tableType = 'AWS.DynamoDB.Table';
// STS is global; any region signs a caller-identity request.
const identityRegion = 'us-east-1';

const environment = (secret: Secret, region: string) =>
  Layer.mergeAll(
    Layer.succeed(
      Credentials,
      Effect.succeed(fromAwsCredentialIdentity(secret, region as RegionName)),
    ),
    Layer.succeed(Region, Effect.succeed(region as RegionName)),
  );

// The AWS error text says whether the keys, the region, or DynamoDB permissions are the problem.
const detail = (error: unknown) => {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : String(error);
  return message.length > 400 ? `${message.slice(0, 400)}…` : message;
};

/** Everything Console knows about AWS: credentials and deleting DynamoDB tables. */
export const aws = {
  kind: 'aws' as const,
  needsRegion: true,
  verify: (secret: Secret) =>
    Effect.gen(function* () {
      const identity = yield* getCallerIdentity({});
      if (!identity.Account)
        return yield* Effect.fail(
          new ProviderFailure({
            code: 'failed',
            reason: 'AWS did not report an account for these keys.',
          }),
        );
      return { account: identity.Account };
    }).pipe(
      Effect.provide(environment(secret, identityRegion)),
      Effect.catch((error) =>
        error instanceof ProviderFailure
          ? Effect.fail(error)
          : Effect.fail(
              new ProviderFailure({
                code: 'permission',
                reason: `AWS rejected these keys: ${detail(error)}`,
              }),
            ),
      ),
      Effect.withSpan('AwsProvider.verify'),
    ),
  owns: (resourceType: string) => resourceType.startsWith('AWS.'),
  supports: (resourceType: string) => resourceType === tableType,
  locate: (row: Row) => dynamodb.locate(row),
  check: (secret: Secret, region: string | null, row: Row) =>
    Effect.gen(function* () {
      if (!region) return 'Choose the AWS region for this stage.';
      const identity = yield* getCallerIdentity({});
      if (!identity.Account)
        return 'Could not determine the AWS account for this credential.';
      return yield* dynamodb
        .check(row, region, identity.Account)
        .pipe(Effect.provide(environment(secret, region)));
    }).pipe(
      Effect.provide(environment(secret, region ?? identityRegion)),
      Effect.catch((error) =>
        Effect.succeed(
          `Could not verify this table with the selected AWS credential: ${detail(error)}`,
        ),
      ),
    ),
  layer: (secret: Secret, region: string | null) =>
    region
      ? dynamodb
          .providers()
          .pipe(Layer.provideMerge(environment(secret, region)))
      : Layer.empty,
};
