import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { JsonSchema } from '../raw/index.js';
import { QuestionAnswerSchema } from '../wire/index.js';

export const TOOL_KINDS = [
  'read',
  'write',
  'edit',
  'delete',
  'bash',
  'search',
  'web',
  'subagent',
  'todo',
  'question',
  'mcp',
  'other',
] as const;
export type ToolKind = (typeof TOOL_KINDS)[number];

export const UsageSchema = Schema.Struct({
  inputTokens: Schema.Finite,
  outputTokens: Schema.Finite,
  cacheReadTokens: Schema.optionalKey(Schema.Finite),
  cacheWriteTokens: Schema.optionalKey(Schema.Finite),
  costUsd: Schema.optionalKey(Schema.Finite),
});
export type Usage = typeof UsageSchema.Type;

/** `interrupted`: the server stopped while the turn ran, found at the next start. */
export const TURN_END_STATUSES = [
  'done',
  'failed',
  'cancelled',
  'interrupted',
] as const;
export type TurnEndStatus = (typeof TURN_END_STATUSES)[number];

/**
 * Text or reasoning a harness did not stream. Streamed text reaches clients
 * only as textChunks; its whole block stays in Raw.
 */
const Text = Schema.Struct({
  type: Schema.Literal('text'),
  text: Schema.String,
  streamId: Schema.optionalKey(Schema.String),
});
const Reasoning = Schema.Struct({
  type: Schema.Literal('reasoning'),
  text: Schema.String,
  streamId: Schema.optionalKey(Schema.String),
});
/**
 * A few sentences of a text or reasoning block, in order. The chunks of one
 * `streamId`, joined, are the whole block; tools are never chunked.
 */
const TextChunk = Schema.Struct({
  type: Schema.Literal('textChunk'),
  streamId: Schema.String,
  channel: Schema.Literals(['text', 'reasoning']),
  text: Schema.String,
});
const ToolCall = Schema.Struct({
  type: Schema.Literal('toolCall'),
  /** The harness's own tool call id; a subagent's Messages carry it as `agentId`. */
  id: Schema.String,
  tool: Schema.Literals(TOOL_KINDS),
  /** The harness's own tool name, such as `Read` or `commandExecution`. */
  name: Schema.String,
  /** One line a person reads: `src/auth/login.ts`, `pnpm test`. */
  title: Schema.String,
  input: JsonSchema,
});
/** An image a tool gave back, such as a file read: whole, in base64. */
const ToolImage = Schema.Struct({
  mediaType: Schema.String,
  data: Schema.String,
});
const ToolResult = Schema.Struct({
  type: Schema.Literal('toolResult'),
  toolCallId: Schema.String,
  /** Its text; the images it gave back are `images`, never cut. */
  output: Schema.String,
  /** Output was cut for the projection; Raw keeps all of it. */
  truncated: Schema.Boolean,
  isError: Schema.Boolean,
  images: Schema.optionalKey(Schema.Array(ToolImage)),
});
/**
 * What the user answered to an Agent Question the call asked, by Item id,
 * as the harness gave it to the agent; null when they declined. A secret's
 * answer is recorded as `(hidden)`. Apart from the call's toolResult, which
 * is what the agent was told.
 */
const QuestionAnswered = Schema.Struct({
  type: Schema.Literal('questionAnswered'),
  toolCallId: Schema.String,
  answers: Schema.NullOr(QuestionAnswerSchema),
});
/** A file sent with a user message, as a Message shows it. */
const TurnAttachment = Schema.Struct({
  name: Schema.String,
  mime: Schema.String,
  /** Bytes. */
  size: Schema.Finite,
  /** Base64, for images only. */
  data: Schema.optionalKey(Schema.String),
  /** Where the engine saved a file that is not an image. */
  path: Schema.optionalKey(Schema.String),
});
const TurnStartedV1 = Schema.Struct({
  type: Schema.Literal('turnStarted'),
  text: Schema.String,
  /** Sent while the turn was already running. */
  steered: Schema.Boolean,
  attachments: Schema.optionalKey(Schema.Array(TurnAttachment)),
  /** An Agent-started Turn: the agent began it, so `text` is empty. */
  agentStarted: Schema.optionalKey(Schema.Boolean),
});
const TurnStarted = Schema.Struct({
  ...TurnStartedV1.fields,
  /**
   * A Resumed Turn: the engine started it to continue one a stop cut off,
   * and `text` is the prompt it sent the agent, not words of yours.
   */
  resumed: Schema.optionalKey(Schema.Boolean),
});
const TurnEnded = Schema.Struct({
  type: Schema.Literal('turnEnded'),
  status: Schema.Literals(TURN_END_STATUSES),
  usage: Schema.optionalKey(UsageSchema),
  error: Schema.optionalKey(Schema.String),
});
/** Tokens one model call used, for a harness that reports them as it goes. */
const UsagePart = Schema.Struct({
  type: Schema.Literal('usage'),
  usage: UsageSchema,
});
const ErrorPart = Schema.Struct({
  type: Schema.Literal('error'),
  message: Schema.String,
});
const ClaudeCompaction = Schema.Struct({
  type: Schema.Literal('claude.compaction'),
  trigger: Schema.String,
});
const CodexPlan = Schema.Struct({
  type: Schema.Literal('codex.plan'),
  steps: Schema.Array(
    Schema.Struct({ step: Schema.String, status: Schema.String }),
  ),
});
/** Understood, but not modelled yet: shown as one plain row. */
const Other = Schema.Struct({
  type: Schema.Literal('other'),
  label: Schema.String,
});

/** Every kind of Part, with the turnStarted of one Message version. */
const partsWith = <S extends typeof TurnStartedV1 | typeof TurnStarted>(
  turnStarted: S,
) =>
  Schema.Union([
    Text,
    Reasoning,
    TextChunk,
    ToolCall,
    ToolResult,
    QuestionAnswered,
    turnStarted,
    TurnEnded,
    UsagePart,
    ErrorPart,
    ClaudeCompaction,
    CodexPlan,
    Other,
  ]);

export const PartSchema = partsWith(TurnStarted);
export type Part = typeof PartSchema.Type;

export const ROLES = ['user', 'assistant', 'tool', 'system'] as const;
export type Role = (typeof ROLES)[number];

/**
 * The projected form of one Raw record, the same across every Coding Harness.
 * Never stored: `project(raw)` makes it on every read, with the Raw's id.
 */
export const MessageSchema = EntityESchema.make('AiMessage', 'id', {
  sessionId: Schema.String,
  turnId: Schema.String,
  /** null for the main agent; else the id of the toolCall that spawned this subagent. */
  agentId: Schema.NullOr(Schema.String),
  role: Schema.Literals(ROLES),
  parts: Schema.Array(partsWith(TurnStartedV1)),
  at: Schema.Finite,
})
  // A turnStarted may say it was Resumed; every v1 part reads as it was.
  .evolve('v2', { parts: Schema.Array(PartSchema) }, (v1) => v1)
  .build();

export type Message = typeof MessageSchema.Type;

/**
 * Which `project` functions a Message came from. Bump it whenever a
 * harness's projection changes what it makes, so devices that kept
 * Messages throw them away and sync afresh.
 */
export const PROJECTION_VERSION = 5;

/** What a harness's `project` decides; the engine adds the ids and time. */
export type Projected = Pick<Message, 'agentId' | 'role' | 'parts'>;
