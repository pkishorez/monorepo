import { Schema } from 'effect';

const name = Schema.String.check(
  Schema.makeFilter((value) => value.length > 0),
);
export const storeTarget = Schema.Struct({ storeId: name });
export const stackTarget = Schema.Struct({
  ...storeTarget.fields,
  stack: name,
});
export const readStageTarget = Schema.Struct({
  ...stackTarget.fields,
  stage: name,
});
export const namesView = Schema.Struct({
  storeName: Schema.String,
  data: Schema.Array(Schema.String),
});

export class StoreDetailsError extends Schema.Error<StoreDetailsError>(
  'alchemy-console/StoreDetailsError',
)({
  _tag: Schema.tag('StoreDetailsError'),
  reason: Schema.optional(Schema.String),
  code: Schema.Literals([
    'not-found',
    'storage-error',
    'remote-error',
    'invalid-state',
    'unsupported-endpoint',
    'timeout',
    'cloudflare-permission',
    'state-store-missing',
    'discovery-failed',
  ]),
}) {}
