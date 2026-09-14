import type { CustomEvent, StreamChunk, UIMessage } from '@tanstack/ai';
import { Effect, Schema } from 'effect';

export const COMMON_EVENTS = {
  SESSION_ID: 'agent.session-id',
  PERMISSION_REQUEST: 'agent.permission.request',
  PERMISSION_RESOLVED: 'agent.permission.resolved',
  QUESTION: 'agent.question',
  FILE_CHANGED: 'agent.file.changed',
  PHASE: 'agent.phase',
} as const;

export const CLAUDE_EVENTS = {
  SUBAGENT: 'claude.subagent',
  SKILL_LOAD: 'claude.skill.loaded',
  COMPACTION: 'claude.compaction',
} as const;

export const CODEX_EVENTS = {
  PLAN: 'codex.plan',
  COMMAND: 'codex.command',
  MCP: 'codex.mcp',
  REQUEST_RESOLVED: 'codex.request.resolved',
} as const;

export const AGENT_EVENT_NAMES = [
  ...Object.values(COMMON_EVENTS),
  ...Object.values(CLAUDE_EVENTS),
  ...Object.values(CODEX_EVENTS),
] as const;

export interface NamedCustomEvent<Name extends string, Value> {
  readonly type: 'CUSTOM';
  readonly name: Name;
  readonly value: Value;
  readonly timestamp?: number;
  readonly messageId?: string;
}

export type CommonEvent =
  | NamedCustomEvent<
      typeof COMMON_EVENTS.SESSION_ID,
      { readonly sessionId: string }
    >
  | NamedCustomEvent<
      typeof COMMON_EVENTS.PERMISSION_REQUEST,
      {
        readonly requestId: string;
        readonly toolName: string;
        readonly input: unknown;
        readonly title?: string;
      }
    >
  | NamedCustomEvent<
      typeof COMMON_EVENTS.PERMISSION_RESOLVED,
      { readonly requestId: string; readonly answer: Answer }
    >
  | NamedCustomEvent<
      typeof COMMON_EVENTS.QUESTION,
      {
        readonly requestId: string;
        readonly questions: ReadonlyArray<AgentQuestion>;
      }
    >
  | NamedCustomEvent<
      typeof COMMON_EVENTS.FILE_CHANGED,
      {
        readonly path: string;
        readonly operation: 'created' | 'updated' | 'deleted';
      }
    >
  | NamedCustomEvent<typeof COMMON_EVENTS.PHASE, { readonly phase: string }>;

export type ClaudeEvent =
  | NamedCustomEvent<typeof CLAUDE_EVENTS.SUBAGENT, { readonly event: unknown }>
  | NamedCustomEvent<
      typeof CLAUDE_EVENTS.SKILL_LOAD,
      { readonly skill: string }
    >
  | NamedCustomEvent<
      typeof CLAUDE_EVENTS.COMPACTION,
      { readonly status: string }
    >;

export type CodexEvent =
  | NamedCustomEvent<typeof CODEX_EVENTS.PLAN, { readonly text: string }>
  | NamedCustomEvent<typeof CODEX_EVENTS.COMMAND, { readonly event: unknown }>
  | NamedCustomEvent<typeof CODEX_EVENTS.MCP, { readonly event: unknown }>
  | NamedCustomEvent<
      typeof CODEX_EVENTS.REQUEST_RESOLVED,
      { readonly requestId: string; readonly answer: CodexAnswer }
    >;

export type AgentEvent = CommonEvent | ClaudeEvent | CodexEvent;
export type AgentChunk<TEvent extends AgentEvent = AgentEvent> =
  | Exclude<StreamChunk, CustomEvent>
  | TEvent;

export interface RunChunk<TEvent extends AgentEvent = AgentEvent> {
  readonly runId: string;
  readonly sequence: number;
  readonly chunk: AgentChunk<TEvent>;
}

export interface AgentQuestion {
  readonly id: string;
  readonly prompt: string;
  readonly choices?: ReadonlyArray<string>;
}

export type Answer =
  | { readonly behavior: 'allow'; readonly updatedInput?: unknown }
  | { readonly behavior: 'deny'; readonly message?: string };

export type ClaudeAnswer = Answer;

export type CodexAnswer =
  | {
      readonly type: 'approval';
      readonly decision:
        | 'accept'
        | 'acceptForSession'
        | 'decline'
        | 'cancel'
        | {
            readonly acceptWithExecpolicyAmendment: {
              readonly execpolicy_amendment: ReadonlyArray<string>;
            };
          }
        | {
            readonly applyNetworkPolicyAmendment: {
              readonly network_policy_amendment: {
                readonly host: string;
                readonly action: 'allow' | 'deny';
              };
            };
          };
      readonly reason?: string;
    }
  | {
      readonly type: 'question';
      readonly answers: Readonly<Record<string, ReadonlyArray<string>>>;
    }
  | {
      readonly type: 'permissions';
      readonly permissions: {
        readonly network?: { readonly enabled: boolean | null };
        readonly fileSystem?: {
          readonly read: ReadonlyArray<string> | null;
          readonly write: ReadonlyArray<string> | null;
        };
      };
      readonly scope: 'turn' | 'session';
      readonly strictAutoReview?: boolean;
    }
  | {
      readonly type: 'elicitation';
      readonly action: 'accept' | 'decline' | 'cancel';
      readonly content: unknown;
      readonly metadata: unknown;
    };

export type HarnessId = 'claude' | 'codex';
export type RunStatus =
  | 'running'
  | 'waiting'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type ThreadStatus = 'idle' | 'running' | 'waiting';

export class RunConflict extends Schema.TaggedError<RunConflict>()(
  'RunConflict',
  { runId: Schema.String },
) {}

export class ThreadBusy extends Schema.TaggedError<ThreadBusy>()('ThreadBusy', {
  threadId: Schema.String,
  activeRunId: Schema.String,
}) {}

export class ThreadNotFound extends Schema.TaggedError<ThreadNotFound>()(
  'ThreadNotFound',
  { threadId: Schema.String },
) {}

export class RunNotFound extends Schema.TaggedError<RunNotFound>()(
  'RunNotFound',
  { runId: Schema.String },
) {}

export class RequestNotFound extends Schema.TaggedError<RequestNotFound>()(
  'RequestNotFound',
  { runId: Schema.String, requestId: Schema.String },
) {}

export class HostMismatch extends Schema.TaggedError<HostMismatch>()(
  'HostMismatch',
  { runId: Schema.String, expectedHost: Schema.String },
) {}

export class HarnessFailed extends Schema.TaggedError<HarnessFailed>()(
  'HarnessFailed',
  { harness: Schema.Literals(['claude', 'codex']), message: Schema.String },
) {}

export class RunLogFailed extends Schema.TaggedError<RunLogFailed>()(
  'RunLogFailed',
  { operation: Schema.String, message: Schema.String },
) {}

export const AiErrorSchema = Schema.Union([
  RunConflict,
  ThreadBusy,
  ThreadNotFound,
  RunNotFound,
  RequestNotFound,
  HostMismatch,
  HarnessFailed,
  RunLogFailed,
]);

export type AiError = typeof AiErrorSchema.Type;

export interface PendingRequest {
  readonly requestId: string;
  readonly kind: 'permission' | 'question';
  readonly createdAt: number;
}

export interface ThreadState {
  readonly threadId: string;
  readonly status: ThreadStatus;
  readonly activeRunId?: string;
  readonly sessionId?: string;
  readonly pending?: ReadonlyArray<PendingRequest>;
}

export interface UserTurn {
  readonly id: string;
  readonly content: string;
}

export interface HarnessContext {
  readonly cwd: string;
  readonly sessionId?: string;
  readonly signal: AbortSignal;
  readonly emit: (chunk: AgentChunk) => Effect.Effect<void, unknown>;
}

export type AiCustomPart = {
  readonly type: 'custom';
  readonly name: AgentEvent['name'];
  readonly data: unknown;
};

export type AiMessagePart = UIMessage['parts'][number] | AiCustomPart;

const openEvent = <const Fields extends Schema.Struct.Fields>(fields: Fields) =>
  Schema.StructWithRest(Schema.Struct(fields), [
    Schema.Record(Schema.String, Schema.Unknown),
  ]);

const AgentChunkStructuralSchema = Schema.Union([
  openEvent({
    type: Schema.Literal('RUN_STARTED'),
    threadId: Schema.String,
    runId: Schema.String,
  }),
  openEvent({
    type: Schema.Literal('RUN_FINISHED'),
    threadId: Schema.String,
    runId: Schema.String,
  }),
  openEvent({ type: Schema.Literal('RUN_ERROR'), message: Schema.String }),
  openEvent({
    type: Schema.Literal('TEXT_MESSAGE_START'),
    messageId: Schema.String,
  }),
  openEvent({
    type: Schema.Literal('TEXT_MESSAGE_CONTENT'),
    messageId: Schema.String,
    delta: Schema.String,
  }),
  openEvent({
    type: Schema.Literal('TEXT_MESSAGE_END'),
    messageId: Schema.String,
  }),
  openEvent({
    type: Schema.Literal('TOOL_CALL_START'),
    toolCallId: Schema.String,
    toolCallName: Schema.String,
  }),
  openEvent({
    type: Schema.Literal('TOOL_CALL_ARGS'),
    toolCallId: Schema.String,
    delta: Schema.String,
  }),
  openEvent({
    type: Schema.Literal('TOOL_CALL_END'),
    toolCallId: Schema.String,
  }),
  openEvent({
    type: Schema.Literal('TOOL_CALL_RESULT'),
    messageId: Schema.String,
    toolCallId: Schema.String,
    content: Schema.Unknown,
  }),
  openEvent({ type: Schema.Literal('STEP_STARTED'), stepName: Schema.String }),
  openEvent({ type: Schema.Literal('STEP_FINISHED'), stepName: Schema.String }),
  openEvent({
    type: Schema.Literal('MESSAGES_SNAPSHOT'),
    messages: Schema.Array(Schema.Unknown),
  }),
  openEvent({
    type: Schema.Literal('STATE_SNAPSHOT'),
    snapshot: Schema.Unknown,
  }),
  openEvent({
    type: Schema.Literal('STATE_DELTA'),
    delta: Schema.Array(Schema.Unknown),
  }),
  openEvent({
    type: Schema.Literals([
      'REASONING_START',
      'REASONING_MESSAGE_START',
      'REASONING_MESSAGE_END',
      'REASONING_END',
    ]),
    messageId: Schema.String,
  }),
  openEvent({
    type: Schema.Literal('REASONING_MESSAGE_CONTENT'),
    messageId: Schema.String,
    delta: Schema.String,
  }),
  openEvent({
    type: Schema.Literal('REASONING_ENCRYPTED_VALUE'),
    subtype: Schema.String,
    entityId: Schema.String,
    encryptedValue: Schema.String,
  }),
  openEvent({
    type: Schema.Literal('CUSTOM'),
    name: Schema.Literals(AGENT_EVENT_NAMES),
    value: Schema.Unknown,
  }),
]);

// TanStack does not export a runtime schema for its StreamChunk union.
export const AgentChunkSchema = AgentChunkStructuralSchema as Schema.Codec<
  AgentChunk,
  unknown
>;

const ContentSourceSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('data'),
    value: Schema.String,
    mimeType: Schema.String,
  }),
  Schema.Struct({
    type: Schema.Literal('url'),
    value: Schema.String,
    mimeType: Schema.optional(Schema.String),
  }),
]);

const MediaPartSchema = (type: 'image' | 'audio' | 'video' | 'document') =>
  Schema.Struct({
    type: Schema.Literal(type),
    source: ContentSourceSchema,
    metadata: Schema.optional(Schema.Unknown),
  });

const StructuralMessagePartSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('text'),
    content: Schema.String,
    metadata: Schema.optional(Schema.Unknown),
  }),
  MediaPartSchema('image'),
  MediaPartSchema('audio'),
  MediaPartSchema('video'),
  MediaPartSchema('document'),
  Schema.Struct({
    type: Schema.Literal('tool-call'),
    id: Schema.String,
    name: Schema.String,
    arguments: Schema.String,
    input: Schema.optional(Schema.Unknown),
    state: Schema.String,
    approval: Schema.optional(Schema.Unknown),
    output: Schema.optional(Schema.Unknown),
    metadata: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    type: Schema.Literal('tool-result'),
    id: Schema.optional(Schema.String),
    name: Schema.optional(Schema.String),
    toolCallId: Schema.String,
    content: Schema.Unknown,
    state: Schema.String,
    error: Schema.optional(Schema.String),
    metadata: Schema.optional(Schema.Unknown),
    createdAt: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    type: Schema.Literal('thinking'),
    content: Schema.String,
    stepId: Schema.optional(Schema.String),
    signature: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal('structured-output'),
    status: Schema.Literals(['streaming', 'complete', 'error']),
    partial: Schema.optional(Schema.Unknown),
    data: Schema.optional(Schema.Unknown),
    raw: Schema.String,
    reasoning: Schema.optional(Schema.String),
    errorMessage: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal('ui-resource'),
    resource: Schema.Struct({
      uri: Schema.String,
      mimeType: Schema.String,
      text: Schema.optional(Schema.String),
      blob: Schema.optional(Schema.String),
    }),
    serverId: Schema.optional(Schema.String),
    toolCallId: Schema.String,
    toolName: Schema.String,
    meta: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    type: Schema.Literal('custom'),
    name: Schema.Literals(AGENT_EVENT_NAMES),
    data: Schema.Unknown,
  }),
]);

// Schema boundary: this structural schema mirrors TanStack's closed part union
// and adds ai-toolkit's custom part.
export const AiMessagePartSchema = StructuralMessagePartSchema as Schema.Codec<
  AiMessagePart,
  unknown
>;

export const RunChunkSchema = Schema.Struct({
  runId: Schema.String,
  sequence: Schema.Int,
  chunk: AgentChunkSchema,
});

export const ClaudeRunChunkSchema = RunChunkSchema as Schema.Codec<
  RunChunk<CommonEvent | ClaudeEvent>,
  unknown
>;

export const CodexRunChunkSchema = RunChunkSchema as Schema.Codec<
  RunChunk<CommonEvent | CodexEvent>,
  unknown
>;

export const UserTurnSchema = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
});

export const AnswerSchema = Schema.Union([
  Schema.Struct({
    behavior: Schema.Literal('allow'),
    updatedInput: Schema.optional(Schema.Unknown),
  }),
  Schema.Struct({
    behavior: Schema.Literal('deny'),
    message: Schema.optional(Schema.String),
  }),
]);

export const ClaudeAnswerSchema = AnswerSchema;

export const CodexAnswerSchema = Schema.Union([
  Schema.Struct({
    type: Schema.Literal('approval'),
    decision: Schema.Union([
      Schema.Literals(['accept', 'acceptForSession', 'decline', 'cancel']),
      Schema.Struct({
        acceptWithExecpolicyAmendment: Schema.Struct({
          execpolicy_amendment: Schema.Array(Schema.String),
        }),
      }),
      Schema.Struct({
        applyNetworkPolicyAmendment: Schema.Struct({
          network_policy_amendment: Schema.Struct({
            host: Schema.String,
            action: Schema.Literals(['allow', 'deny']),
          }),
        }),
      }),
    ]),
    reason: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    type: Schema.Literal('question'),
    answers: Schema.Record(Schema.String, Schema.Array(Schema.String)),
  }),
  Schema.Struct({
    type: Schema.Literal('permissions'),
    permissions: Schema.Struct({
      network: Schema.optional(
        Schema.Struct({ enabled: Schema.NullOr(Schema.Boolean) }),
      ),
      fileSystem: Schema.optional(
        Schema.Struct({
          read: Schema.NullOr(Schema.Array(Schema.String)),
          write: Schema.NullOr(Schema.Array(Schema.String)),
        }),
      ),
    }),
    scope: Schema.Literals(['turn', 'session']),
    strictAutoReview: Schema.optional(Schema.Boolean),
  }),
  Schema.Struct({
    type: Schema.Literal('elicitation'),
    action: Schema.Literals(['accept', 'decline', 'cancel']),
    content: Schema.Unknown,
    metadata: Schema.Unknown,
  }),
]);

export const ThreadStateSchema = Schema.Struct({
  threadId: Schema.String,
  status: Schema.Literals(['idle', 'running', 'waiting']),
  activeRunId: Schema.optional(Schema.String),
  sessionId: Schema.optional(Schema.String),
  pending: Schema.optional(
    Schema.Array(
      Schema.Struct({
        requestId: Schema.String,
        kind: Schema.Literals(['permission', 'question']),
        createdAt: Schema.Number,
      }),
    ),
  ),
});

export const customEvent = <Name extends AgentEvent['name'], Value>(
  name: Name,
  value: Value,
  messageId?: string,
): NamedCustomEvent<Name, Value> => ({
  type: 'CUSTOM',
  name,
  value,
  timestamp: Date.now(),
  ...(messageId === undefined ? {} : { messageId }),
});

export * from './mailbox.js';
