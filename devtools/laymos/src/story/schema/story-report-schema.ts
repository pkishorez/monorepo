import { Schema } from 'effect';

const JsonValueSchema: Schema.Codec<JsonValue> = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
  Schema.Null,
  Schema.Array(Schema.suspend(() => JsonValueSchema)),
  Schema.Record(
    Schema.String,
    Schema.suspend(() => JsonValueSchema),
  ),
]) as unknown as Schema.Codec<JsonValue>;

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const SpanStatusSchema = Schema.Literals([
  'error',
  'running',
  'success',
  'unset',
]);

const CapturedEventSchema = Schema.Struct({
  name: Schema.String,
  timestamp: Schema.Number,
  attributes: Schema.Record(Schema.String, JsonValueSchema),
});

const CapturedSpanSchema = Schema.Struct({
  traceId: Schema.String,
  spanId: Schema.String,
  parentSpanId: Schema.NullOr(Schema.String),
  name: Schema.String,
  startTime: Schema.Number,
  endTime: Schema.NullOr(Schema.Number),
  status: SpanStatusSchema,
  attributes: Schema.Record(Schema.String, JsonValueSchema),
  events: Schema.Array(CapturedEventSchema),
});

const CapturedLogSchema = Schema.Struct({
  id: Schema.String,
  spanId: Schema.NullOr(Schema.String),
  timestamp: Schema.Number,
  level: Schema.Literals(['Fatal', 'Error', 'Warn', 'Info', 'Debug', 'Trace']),
  message: JsonValueSchema,
  annotations: Schema.Record(Schema.String, JsonValueSchema),
});

export const CapturedTraceSchema = Schema.Struct({
  spans: Schema.Array(CapturedSpanSchema),
  logs: Schema.Array(CapturedLogSchema),
  truncated: Schema.Boolean,
}).annotate({
  title: 'Captured Trace',
  description:
    "A Story artifact: every span and log recorded while a Story's traced region ran.",
});

const FlowSeveritySchema = Schema.Literals([
  'debug',
  'error',
  'info',
  'warning',
]);

const RecordedFlowActivitySchema = Schema.Struct({
  kind: Schema.Literal('activity'),
  id: Schema.String,
  participantName: Schema.String,
  name: Schema.String,
  timestamp: Schema.Number,
  duration: Schema.NullOr(Schema.Number),
  status: SpanStatusSchema,
  traceId: Schema.String,
  spanId: Schema.String,
});

const RecordedFlowLocalEventSchema = Schema.Struct({
  kind: Schema.Literal('local-event'),
  id: Schema.String,
  participantName: Schema.String,
  name: Schema.String,
  timestamp: Schema.Number,
  severity: FlowSeveritySchema,
  status: Schema.optional(
    Schema.Literals(['cancelled', 'completed', 'failed']),
  ),
});

const RecordedFlowMessageSchema = Schema.Struct({
  kind: Schema.Literal('message'),
  id: Schema.String,
  participantName: Schema.String,
  name: Schema.String,
  timestamp: Schema.Number,
  severity: FlowSeveritySchema,
  destination: Schema.String,
});

const RecordedFlowWarningSchema = Schema.Struct({
  recordType: Schema.Literals(['log', 'span']),
  recordId: Schema.String,
  message: Schema.String,
});

export const RecordedFlowSchema = Schema.Struct({
  id: Schema.String,
  status: Schema.Literals(['active', 'cancelled', 'completed', 'failed']),
  latestTimestamp: Schema.Number,
  items: Schema.Array(
    Schema.Union([
      RecordedFlowActivitySchema,
      RecordedFlowLocalEventSchema,
      RecordedFlowMessageSchema,
    ]),
  ),
  warnings: Schema.Array(RecordedFlowWarningSchema),
}).annotate({
  title: 'Recorded Flow',
  description:
    "A Story artifact: one Flow derived from the spans and logs recorded while a Story's flow region ran.",
});

export const StoryAssertionSchema = Schema.Struct({
  description: Schema.String,
  passed: Schema.Boolean,
}).annotate({
  title: 'Story Assertion',
  description:
    'One recorded Story assertion outcome, grouped under the Story section it verifies.',
});

const sectionAssertions = Schema.Array(StoryAssertionSchema);

export const StorySectionSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('trace'),
    description: Schema.String,
    trace: CapturedTraceSchema,
    assertions: sectionAssertions,
  }),
  Schema.Struct({
    kind: Schema.Literal('flow'),
    description: Schema.String,
    flow: RecordedFlowSchema,
    assertions: sectionAssertions,
  }),
  Schema.Struct({
    kind: Schema.Literal('exec'),
    description: Schema.String,
    assertions: sectionAssertions,
  }),
]).annotate({
  title: 'Story Section',
  description:
    'One sectioned step of a Story run: a described trace, flow, or generic execution plus the Story assertions that verify it.',
});

export const StoryVerdictSchema = Schema.Literals([
  'passed',
  'failed',
  'errored',
]);

export const StoryReportSchema = Schema.Struct({
  id: Schema.String,
  verdict: StoryVerdictSchema,
  sections: Schema.Array(StorySectionSchema),
  error: Schema.optional(Schema.String),
}).annotate({
  title: 'Story Report',
  description:
    "The structured record of one Story run, attached to the Story tree by the Story's id: verdict and the ordered Story sections.",
});

export type CapturedTrace = typeof CapturedTraceSchema.Type;
export type RecordedFlow = typeof RecordedFlowSchema.Type;
export type StoryAssertion = typeof StoryAssertionSchema.Type;
export type StorySection = typeof StorySectionSchema.Type;
export type StoryVerdict = typeof StoryVerdictSchema.Type;
export type StoryReport = typeof StoryReportSchema.Type;
