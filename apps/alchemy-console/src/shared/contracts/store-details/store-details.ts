import { Schema } from 'effect';

const common = {
  fqn: Schema.String,
  logicalId: Schema.String,
  downstream: Schema.Array(Schema.String),
  namespace: Schema.optional(Schema.Json),
};

// Preserve provider-specific and future fields as validated JSON.
const resource = Schema.StructWithRest(
  Schema.Struct({
    ...common,
    kind: Schema.optional(Schema.Literal('resource')),
    resourceType: Schema.String,
    instanceId: Schema.String,
    providerVersion: Schema.Number,
    status: Schema.Literals([
      'creating',
      'created',
      'updating',
      'updated',
      'deleting',
      'replacing',
      'replaced',
    ]),
    bindings: Schema.Array(Schema.Json),
    props: Schema.optional(Schema.Json),
    attr: Schema.optional(Schema.Json),
    old: Schema.optional(Schema.Json),
    removalPolicy: Schema.optional(Schema.Literals(['retain', 'destroy'])),
    providerMode: Schema.optional(Schema.Literals(['live', 'local'])),
    deleteFirst: Schema.optional(Schema.Boolean),
    adopting: Schema.optional(Schema.Boolean),
  }),
  [Schema.Record(Schema.String, Schema.Json)],
);

const action = Schema.StructWithRest(
  Schema.Struct({
    ...common,
    kind: Schema.Literal('action'),
    actionType: Schema.String,
    status: Schema.Literals(['running', 'ran']),
    inputHash: Schema.String,
    input: Schema.Json,
    output: Schema.optional(Schema.Json),
  }),
  [Schema.Record(Schema.String, Schema.Json)],
);

export const persistedStateView = Schema.Union([resource, action]);

// Row-level view of a resource; null type and status mean the state was unreadable or gone.
export const resourceSummaryView = Schema.Struct({
  fqn: Schema.String,
  kind: Schema.Literals(['resource', 'action']),
  type: Schema.NullOr(Schema.String),
  status: Schema.NullOr(Schema.String),
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
