import { Schema } from 'effect';
import { readStageTarget } from '../state-address/index.ts';

export const resourceTarget = Schema.Struct({
  ...readStageTarget.fields,
  resource: Schema.String.check(Schema.makeFilter((value) => value.length > 0)),
});

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

export const resourceSummariesView = Schema.Struct({
  storeName: Schema.String,
  data: Schema.Array(resourceSummaryView),
});
export const stageView = Schema.Struct({
  storeName: Schema.String,
  data: Schema.Struct({
    resources: Schema.Array(resourceSummaryView),
    outputs: Schema.Json,
  }),
});
export const resourceStateView = Schema.Struct({
  storeName: Schema.String,
  data: Schema.NullOr(persistedStateView),
});
