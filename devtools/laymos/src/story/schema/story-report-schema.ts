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
    "One recorded assertion outcome pinning a Question's answer to its captured proof.",
});

export const QuestionSectionSchema = Schema.Union([
  Schema.Struct({
    kind: Schema.Literal('trace'),
    trace: CapturedTraceSchema,
  }),
  Schema.Struct({
    kind: Schema.Literal('flow'),
    flow: RecordedFlowSchema,
  }),
]).annotate({
  title: 'Question Section',
  description:
    "One captured artifact of a Question's proof run: a trace or a flow.",
});

export const StoryVerdictSchema = Schema.Literals([
  'passed',
  'failed',
  'errored',
]);

export const QuestionReportSchema = Schema.Struct({
  slug: Schema.String,
  verdict: StoryVerdictSchema,
  result: Schema.optional(JsonValueSchema),
  error: Schema.optional(Schema.String),
  assertions: Schema.Array(StoryAssertionSchema),
  sections: Schema.Array(QuestionSectionSchema),
}).annotate({
  title: 'Question Report',
  description:
    "The structured record of one Question's proof run: the captured result (or error), the assertions pinning the answer, and any captured sections.",
});

export const StoryReportSchema = Schema.Struct({
  id: Schema.String,
  verdict: StoryVerdictSchema,
  questions: Schema.Array(QuestionReportSchema),
}).annotate({
  title: 'Story Report',
  description:
    "The structured record of one Story run, attached to the Story tree by the Story's id: one Question report per authored Question, in order.",
});

export type CapturedTrace = typeof CapturedTraceSchema.Type;
export type RecordedFlow = typeof RecordedFlowSchema.Type;
export type StoryAssertion = typeof StoryAssertionSchema.Type;
export type QuestionSection = typeof QuestionSectionSchema.Type;
export type QuestionReport = typeof QuestionReportSchema.Type;
export type StoryVerdict = typeof StoryVerdictSchema.Type;
export type StoryReport = typeof StoryReportSchema.Type;
