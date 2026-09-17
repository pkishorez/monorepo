import { Schema } from 'effect';

export type AttributeValue =
  | string
  | number
  | boolean
  | null
  | readonly AttributeValue[]
  | { readonly [key: string]: AttributeValue };

export const AttributeValueSchema: Schema.Codec<AttributeValue> = Schema.Union([
  Schema.String,
  Schema.Number,
  Schema.Boolean,
  Schema.Null,
  Schema.Array(Schema.suspend(() => AttributeValueSchema)),
  Schema.Record(
    Schema.String,
    Schema.suspend(() => AttributeValueSchema),
  ),
]) as unknown as Schema.Codec<AttributeValue>;

export const AttributesSchema = Schema.Record(
  Schema.String,
  AttributeValueSchema,
);

export const SeveritySchema = Schema.Literals([
  'debug',
  'info',
  'warning',
  'error',
]);

export const ActivationOutcomeSchema = Schema.Literals([
  'completed',
  'failed',
  'interrupted',
]);

export const entryKinds = [
  'event',
  'message',
  'activation-start',
  'activation-end',
  'wait',
  'resume',
  'check',
  'close',
] as const;

/** What every Entry carries, whatever its kind. */
const EntryBase = {
  id: Schema.String,
  flowId: Schema.String,
  participantName: Schema.String,
  name: Schema.String,
  /** The order this Entry's Origin recorded it in. */
  sequence: Schema.Number,
  /** Milliseconds since the epoch on the recording clock; display only. */
  timestamp: Schema.Number,
  severity: SeveritySchema,
  origin: Schema.optional(Schema.String),
  attributes: Schema.optional(AttributesSchema),
  /** The Trace Link: set when the Entry was recorded inside a span. */
  traceId: Schema.optional(Schema.String),
  spanId: Schema.optional(Schema.String),
};

export const EventEntrySchema = Schema.Struct({
  kind: Schema.Literal('event'),
  ...EntryBase,
});

export const MessageEntrySchema = Schema.Struct({
  kind: Schema.Literal('message'),
  ...EntryBase,
  messageId: Schema.String,
  destination: Schema.String,
  replyTo: Schema.optional(Schema.String),
});

export const ActivationStartEntrySchema = Schema.Struct({
  kind: Schema.Literal('activation-start'),
  ...EntryBase,
  activationId: Schema.String,
});

export const ActivationEndEntrySchema = Schema.Struct({
  kind: Schema.Literal('activation-end'),
  ...EntryBase,
  activationId: Schema.String,
  outcome: ActivationOutcomeSchema,
});

export const WaitEntrySchema = Schema.Struct({
  kind: Schema.Literal('wait'),
  ...EntryBase,
});

export const ResumeEntrySchema = Schema.Struct({
  kind: Schema.Literal('resume'),
  ...EntryBase,
});

export const CheckEntrySchema = Schema.Struct({
  kind: Schema.Literal('check'),
  ...EntryBase,
  passed: Schema.Boolean,
});

export const CloseEntrySchema = Schema.Struct({
  kind: Schema.Literal('close'),
  ...EntryBase,
});

export const EntrySchema = Schema.Union([
  EventEntrySchema,
  MessageEntrySchema,
  ActivationStartEntrySchema,
  ActivationEndEntrySchema,
  WaitEntrySchema,
  ResumeEntrySchema,
  CheckEntrySchema,
  CloseEntrySchema,
]).annotate({
  title: 'Flow Entry',
  description: 'One recorded fact in a Flow Journal.',
});

export type Severity = typeof SeveritySchema.Type;
export type ActivationOutcome = typeof ActivationOutcomeSchema.Type;
export type EntryKind = (typeof entryKinds)[number];
export type EventEntry = typeof EventEntrySchema.Type;
export type MessageEntry = typeof MessageEntrySchema.Type;
export type ActivationStartEntry = typeof ActivationStartEntrySchema.Type;
export type ActivationEndEntry = typeof ActivationEndEntrySchema.Type;
export type WaitEntry = typeof WaitEntrySchema.Type;
export type ResumeEntry = typeof ResumeEntrySchema.Type;
export type CheckEntry = typeof CheckEntrySchema.Type;
export type CloseEntry = typeof CloseEntrySchema.Type;
export type Entry = typeof EntrySchema.Type;
