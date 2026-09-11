import { Schema } from 'effect';

export const alchemyManagedStackName = 'CloudflareStateStore';
export const isAlchemyManagedStack = (stack: string) =>
  stack === alchemyManagedStackName;
export const compareStackNames = (left: string, right: string) => {
  const managedOrder =
    Number(isAlchemyManagedStack(right)) - Number(isAlchemyManagedStack(left));
  return managedOrder || (left < right ? -1 : left > right ? 1 : 0);
};

const name = Schema.String.check(
  Schema.makeFilter((value) => value.length > 0 && value.length <= 512),
);
export const storeTarget = Schema.Struct({ storeId: name });
export const stackTarget = Schema.Struct({
  ...storeTarget.fields,
  stack: name,
});
export const stageTarget = Schema.Struct({
  ...stackTarget.fields,
  stage: name,
});
export const namesView = Schema.Struct({
  storeName: Schema.String,
  data: Schema.Array(Schema.String),
});

export class BrowseError extends Schema.Error<BrowseError>(
  'alchemy-console/BrowseError',
)({
  _tag: Schema.tag('BrowseError'),
  reason: Schema.optional(Schema.String),
  code: Schema.Literals([
    'not-found',
    'storage-error',
    'remote-error',
    'invalid-state',
    'unsupported-endpoint',
    'timeout',
  ]),
}) {}
