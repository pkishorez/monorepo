import { Schema } from 'effect';

export type RecordedFlowAttributeValue =
  | string
  | number
  | boolean
  | null
  | readonly RecordedFlowAttributeValue[]
  | { readonly [key: string]: RecordedFlowAttributeValue };

export const RecordedFlowAttributeValueSchema: Schema.Codec<RecordedFlowAttributeValue> =
  Schema.Union([
    Schema.String,
    Schema.Number,
    Schema.Boolean,
    Schema.Null,
    Schema.Array(Schema.suspend(() => RecordedFlowAttributeValueSchema)),
    Schema.Record(
      Schema.String,
      Schema.suspend(() => RecordedFlowAttributeValueSchema),
    ),
  ]) as unknown as Schema.Codec<RecordedFlowAttributeValue>;

const AttributesSchema = Schema.optional(
  Schema.Record(Schema.String, RecordedFlowAttributeValueSchema),
);

const ItemBase = {
  id: Schema.String,
  participantName: Schema.String,
  name: Schema.String,
  timestamp: Schema.Number,
  attributes: AttributesSchema,
};

export const RecordedFlowSeveritySchema = Schema.Literals([
  'debug',
  'error',
  'info',
  'warning',
]);

export const FlowActivityStatusSchema = Schema.Literals([
  'error',
  'interrupted',
  'running',
  'success',
  'unset',
]);

export const ActivationOutcomeKindSchema = Schema.Literals([
  'completed',
  'failed',
  'interrupted',
]);

export const RecordedFlowActivityLogSchema = Schema.Struct({
  timestamp: Schema.Number,
  severity: RecordedFlowSeveritySchema,
  message: Schema.String,
  attributes: AttributesSchema,
});

export const RecordedFlowActivitySchema = Schema.Struct({
  kind: Schema.Literal('activity'),
  ...ItemBase,
  duration: Schema.NullOr(Schema.Number),
  status: FlowActivityStatusSchema,
  traceId: Schema.String,
  spanId: Schema.String,
  logs: Schema.optional(Schema.Array(RecordedFlowActivityLogSchema)),
});

export const RecordedFlowLocalEventSchema = Schema.Struct({
  kind: Schema.Literal('local-event'),
  ...ItemBase,
  severity: RecordedFlowSeveritySchema,
});

export const RecordedFlowMessageSchema = Schema.Struct({
  kind: Schema.Literal('message'),
  ...ItemBase,
  severity: RecordedFlowSeveritySchema,
  destination: Schema.String,
  messageId: Schema.String,
  replyTo: Schema.optional(Schema.String),
});

export const RecordedFlowActivationStartSchema = Schema.Struct({
  kind: Schema.Literal('activation-start'),
  ...ItemBase,
  severity: RecordedFlowSeveritySchema,
});

export const RecordedFlowActivationEndSchema = Schema.Struct({
  kind: Schema.Literal('activation-end'),
  ...ItemBase,
  severity: RecordedFlowSeveritySchema,
  outcome: ActivationOutcomeKindSchema,
});

export const RecordedFlowStateSchema = Schema.Struct({
  kind: Schema.Literal('state'),
  ...ItemBase,
  severity: RecordedFlowSeveritySchema,
  state: Schema.Record(Schema.String, RecordedFlowAttributeValueSchema),
  merged: Schema.Record(Schema.String, RecordedFlowAttributeValueSchema),
});

export const RecordedFlowItemSchema = Schema.Union([
  RecordedFlowActivitySchema,
  RecordedFlowActivationEndSchema,
  RecordedFlowActivationStartSchema,
  RecordedFlowLocalEventSchema,
  RecordedFlowMessageSchema,
  RecordedFlowStateSchema,
]);

export const RecordedFlowActivationSchema = Schema.Struct({
  participantName: Schema.String,
  name: Schema.String,
  startItemId: Schema.String,
  endItemId: Schema.NullOr(Schema.String),
  startTimestamp: Schema.Number,
  endTimestamp: Schema.NullOr(Schema.Number),
  outcome: Schema.NullOr(ActivationOutcomeKindSchema),
});

export const RecordedFlowWarningSchema = Schema.Struct({
  recordType: Schema.Literals(['log', 'span']),
  recordId: Schema.String,
  message: Schema.String,
});

export const RecordedFlowSchema = Schema.Struct({
  id: Schema.String,
  latestTimestamp: Schema.Number,
  items: Schema.Array(RecordedFlowItemSchema),
  activations: Schema.Array(RecordedFlowActivationSchema),
  warnings: Schema.Array(RecordedFlowWarningSchema),
}).annotate({
  title: 'Recorded Flow',
  description: 'A Flow derived from its recorded spans and logs.',
});

export type FlowActivityStatus = typeof FlowActivityStatusSchema.Type;
export type RecordedFlowSeverity = typeof RecordedFlowSeveritySchema.Type;
export type RecordedFlowActivityLog = typeof RecordedFlowActivityLogSchema.Type;
export type RecordedFlowActivity = typeof RecordedFlowActivitySchema.Type;
export type RecordedFlowLocalEvent = typeof RecordedFlowLocalEventSchema.Type;
export type RecordedFlowMessage = typeof RecordedFlowMessageSchema.Type;
export type RecordedFlowActivationStart =
  typeof RecordedFlowActivationStartSchema.Type;
export type RecordedFlowActivationEnd =
  typeof RecordedFlowActivationEndSchema.Type;
export type RecordedFlowState = typeof RecordedFlowStateSchema.Type;
export type RecordedFlowItem = typeof RecordedFlowItemSchema.Type;
export type RecordedFlowActivation = typeof RecordedFlowActivationSchema.Type;
export type RecordedFlowWarning = typeof RecordedFlowWarningSchema.Type;
export type RecordedFlow = typeof RecordedFlowSchema.Type;
