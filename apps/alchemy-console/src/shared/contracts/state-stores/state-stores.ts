import { Schema } from 'effect';

const nonEmpty = Schema.String.check(
  Schema.makeFilter((value) => value.trim().length > 0),
);
export const awsConnection = Schema.Struct({
  type: Schema.Literal('aws'),
  accessKeyId: nonEmpty,
  secretAccessKey: nonEmpty,
  region: Schema.String.check(
    Schema.makeFilter((value) => /^[a-z]{2}(?:-[a-z]+)+-\d+$/.test(value)),
  ),
});
export const updateCredentialsInput = Schema.Struct({
  id: nonEmpty,
  accountId: Schema.String.check(
    Schema.makeFilter((value) => /^[a-f0-9]{32}$/i.test(value)),
  ),
  // Blank leaves the saved Cloudflare token in place when editing AWS only.
  apiToken: Schema.String,
  // Omitted preserves the saved AWS connection; null removes it.
  aws: Schema.optional(Schema.NullOr(awsConnection)),
});
export const createStateStoreInput = Schema.Struct({
  name: nonEmpty,
  aws: Schema.optional(Schema.NullOr(awsConnection)),
  connection: Schema.Struct({
    kind: Schema.Literal('cloudflare'),
    accountId: Schema.String.check(
      Schema.makeFilter((value) => /^[a-f0-9]{32}$/i.test(value)),
    ),
    apiToken: nonEmpty,
  }),
});

export const stateStoreView = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  name: Schema.String,
  aws: Schema.NullOr(
    Schema.Struct({
      type: Schema.Literal('aws'),
      accessKeyId: Schema.Literal('xxxxxxxx'),
      secretAccessKey: Schema.Literal('xxxxxxxx'),
      region: Schema.String,
    }),
  ),
  connection: Schema.Struct({
    kind: Schema.Literal('cloudflare'),
    accountId: Schema.NullOr(Schema.String),
    apiToken: Schema.NullOr(Schema.Literal('xxxxxxxx')),
    url: Schema.String,
    authToken: Schema.Literal('xxxxxxxx'),
  }),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export class StateStoreError extends Schema.Error<StateStoreError>(
  'alchemy-console/StateStoreError',
)({
  _tag: Schema.tag('StateStoreError'),
  reason: Schema.optional(Schema.String),
  code: Schema.Literals([
    'not-found',
    'managed-stack',
    'missing-credentials',
    'non-empty',
    'remote-error',
    'storage-error',
    'cloudflare-permission',
    'state-store-missing',
    'discovery-failed',
  ]),
}) {}
