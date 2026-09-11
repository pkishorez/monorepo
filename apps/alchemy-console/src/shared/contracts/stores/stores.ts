import { Schema } from 'effect';

const nonEmpty = Schema.String.check(
  Schema.makeFilter((value) => value.trim().length > 0),
);
export const createStoreInput = Schema.Struct({
  name: nonEmpty,
  // The Cloudflare credential whose account hosts the Alchemy state store.
  stateCredentialId: nonEmpty,
  // Further credentials this store may use while deleting stages.
  grants: Schema.Array(nonEmpty),
});
export const updateStoreInput = Schema.Struct({
  id: nonEmpty,
  name: nonEmpty,
  grants: Schema.Array(nonEmpty),
});

export const storeView = Schema.Struct({
  id: Schema.String,
  userId: Schema.String,
  name: Schema.String,
  state: Schema.Struct({
    provider: Schema.Literal('cloudflare'),
    credentialId: Schema.String,
  }),
  grants: Schema.Array(Schema.String),
  createdAt: Schema.String,
  updatedAt: Schema.String,
});

export class StoreError extends Schema.Error<StoreError>(
  'alchemy-console/StoreError',
)({
  _tag: Schema.tag('StoreError'),
  reason: Schema.optional(Schema.String),
  code: Schema.Literals([
    'not-found',
    'managed-stack',
    'credential-missing',
    'non-empty',
    'remote-error',
    'storage-error',
    'cloudflare-permission',
    'state-store-missing',
    'discovery-failed',
  ]),
}) {}
