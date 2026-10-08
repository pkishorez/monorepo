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

export { JsonValueSchema };

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

const SpanStatusSchema = Schema.Literals([
  'error',
  'interrupted',
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
    'Evidence: every span and log recorded while a Proof ran, its phases and Steps included.',
});

export const ProofAssertionSchema = Schema.Struct({
  description: Schema.String,
  passed: Schema.Boolean,
}).annotate({
  title: 'Proof Assertion',
  description: 'One recorded assertion outcome inside a phase.',
});

export const PhaseNameSchema = Schema.Literals(['prepare', 'act', 'verify']);

export const PhaseStatusSchema = Schema.Literals([
  'passed',
  'failed',
  'errored',
  'skipped',
]);

export const PhaseReportSchema = Schema.Struct({
  phase: PhaseNameSchema,
  status: PhaseStatusSchema,
  /** Milliseconds since the Proof run began. */
  startedAt: Schema.Number,
  endedAt: Schema.Number,
  value: Schema.optional(JsonValueSchema),
  error: Schema.optional(Schema.String),
  assertions: Schema.Array(ProofAssertionSchema),
}).annotate({
  title: 'Phase Report',
  description:
    'How one phase of a Proof run went: its status, the value it returned or the error it died with, and its assertions.',
});

export const StepKindSchema = Schema.Literals([
  'open',
  'click',
  'type',
  'press',
  'scroll',
  'gesture',
  'wait',
  'screenshot',
  'raw',
  'close',
]);

export const StepSchema = Schema.Struct({
  name: Schema.String,
  kind: StepKindSchema,
  tab: Schema.String,
  phase: PhaseNameSchema,
  /** Milliseconds since the Proof run began. */
  startedAt: Schema.Number,
  endedAt: Schema.Number,
  passed: Schema.Boolean,
  error: Schema.optional(Schema.String),
  /** Evidence file of the screen when the Step ended, relative to the Proof's Evidence folder. */
  screenshot: Schema.NullOr(Schema.String),
}).annotate({
  title: 'Step',
  description: 'One named move of a Browser Proof on one Tab.',
});

export const FrameSchema = Schema.Struct({
  /** Milliseconds since the Proof run began. */
  at: Schema.Number,
  /** Evidence file, relative to the Proof's Evidence folder. */
  file: Schema.String,
});

export const DeviceKindSchema = Schema.Literals(['desktop', 'mobile']);

export const RecordingSchema = Schema.Struct({
  tab: Schema.String,
  device: Schema.String,
  deviceKind: DeviceKindSchema,
  viewport: Schema.Struct({ width: Schema.Number, height: Schema.Number }),
  /** Milliseconds since the Proof run began when the Tab opened and closed. */
  openedAt: Schema.Number,
  closedAt: Schema.Number,
  frames: Schema.Array(FrameSchema),
}).annotate({
  title: 'Recording',
  description:
    "What one Tab's screen did during a Proof run: every frame, raw and untrimmed, on the Proof's one clock.",
});

export const ProofVerdictSchema = Schema.Literals([
  'passed',
  'failed',
  'errored',
  'unprepared',
]);

export const ProofReportSchema = Schema.Struct({
  id: Schema.String,
  verdict: ProofVerdictSchema,
  /** Epoch milliseconds when the run began. */
  startedAt: Schema.Number,
  /** Milliseconds the whole run took. */
  duration: Schema.Number,
  /** Set when the run died outside any phase, such as a timeout. */
  error: Schema.optional(Schema.String),
  phases: Schema.Array(PhaseReportSchema),
  trace: Schema.NullOr(CapturedTraceSchema),
  steps: Schema.Array(StepSchema),
  recordings: Schema.Array(RecordingSchema),
}).annotate({
  title: 'Proof Report',
  description:
    'The record of one Proof run, attached to the Story tree by Proof id: the verdict, each phase, and the Evidence.',
});

export const ProofRunEventSchema = Schema.Union([
  Schema.Struct({ _tag: Schema.Literal('Started'), id: Schema.String }),
  Schema.Struct({
    _tag: Schema.Literal('Finished'),
    report: ProofReportSchema,
  }),
]).annotate({
  title: 'Proof Run Event',
  description: 'A Stories run streams one Started and one Finished per Proof.',
});

export type CapturedTrace = typeof CapturedTraceSchema.Type;
export type ProofAssertion = typeof ProofAssertionSchema.Type;
export type PhaseName = typeof PhaseNameSchema.Type;
export type PhaseStatus = typeof PhaseStatusSchema.Type;
export type PhaseReport = typeof PhaseReportSchema.Type;
export type StepKind = typeof StepKindSchema.Type;
export type Step = typeof StepSchema.Type;
export type Frame = typeof FrameSchema.Type;
export type DeviceKind = typeof DeviceKindSchema.Type;
export type Recording = typeof RecordingSchema.Type;
export type ProofVerdict = typeof ProofVerdictSchema.Type;
export type ProofReport = typeof ProofReportSchema.Type;
export type ProofRunEvent = typeof ProofRunEventSchema.Type;
