import { Schema } from 'effect';

const nonEmpty = Schema.String.check(
  Schema.makeFilter((value) => value.trim().length > 0),
);
export const createStateStoreInput = Schema.Struct({
  name: nonEmpty,
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
