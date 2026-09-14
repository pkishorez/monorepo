import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  AiErrorSchema,
  ClaudeAnswerSchema,
  ClaudeRunChunkSchema,
  CodexAnswerSchema,
  CodexRunChunkSchema,
  RunChunkSchema,
  ThreadStateSchema,
  UserTurnSchema,
} from '../../harness/run-state/index.js';

export {
  AGENT_EVENT_NAMES,
  CLAUDE_EVENTS,
  CODEX_EVENTS,
  COMMON_EVENTS,
  HarnessFailed,
  HostMismatch,
  RequestNotFound,
  RunConflict,
  RunLogFailed,
  RunNotFound,
  ThreadBusy,
  ThreadNotFound,
} from '../../harness/run-state/index.js';
export type {
  AgentChunk,
  AgentEvent,
  AiCustomPart,
  AiMessagePart,
  Answer,
  ClaudeAnswer,
  ClaudeEvent,
  CodexAnswer,
  CodexEvent,
  CommonEvent,
  PendingRequest,
  RunChunk,
  RunStatus,
  ThreadState,
  ThreadStatus,
  UserTurn,
} from '../../harness/run-state/index.js';

const ThinkingSchema = Schema.Struct({
  budgetTokens: Schema.Int,
});

const ClaudeStartPayload = Schema.Union([
  Schema.Struct({
    threadId: Schema.String,
    runId: Schema.String,
    message: UserTurnSchema,
    model: Schema.Literal('claude-opus-4-6'),
    options: Schema.Struct({
      thinking: Schema.optional(ThinkingSchema),
      permissionMode: Schema.optional(
        Schema.Literals([
          'default',
          'acceptEdits',
          'bypassPermissions',
          'plan',
          'dontAsk',
          'auto',
        ]),
      ),
      allowDangerouslySkipPermissions: Schema.optional(Schema.Boolean),
      maxTurns: Schema.optional(Schema.Int),
      permissionTimeoutMs: Schema.optional(Schema.Int),
    }),
  }),
  Schema.Struct({
    threadId: Schema.String,
    runId: Schema.String,
    message: UserTurnSchema,
    model: Schema.Literal('claude-sonnet-4-6'),
    options: Schema.Struct({
      thinking: Schema.optional(ThinkingSchema),
      permissionMode: Schema.optional(
        Schema.Literals([
          'default',
          'acceptEdits',
          'bypassPermissions',
          'plan',
          'dontAsk',
          'auto',
        ]),
      ),
      allowDangerouslySkipPermissions: Schema.optional(Schema.Boolean),
      maxTurns: Schema.optional(Schema.Int),
      permissionTimeoutMs: Schema.optional(Schema.Int),
    }),
  }),
  Schema.Struct({
    threadId: Schema.String,
    runId: Schema.String,
    message: UserTurnSchema,
    model: Schema.Literal('claude-haiku-4-5'),
    options: Schema.Struct({
      permissionMode: Schema.optional(
        Schema.Literals([
          'default',
          'acceptEdits',
          'bypassPermissions',
          'plan',
          'dontAsk',
          'auto',
        ]),
      ),
      allowDangerouslySkipPermissions: Schema.optional(Schema.Boolean),
      maxTurns: Schema.optional(Schema.Int),
      permissionTimeoutMs: Schema.optional(Schema.Int),
    }),
  }),
]);

const CodexOptionsSchema = Schema.Struct({
  reasoningEffort: Schema.optional(
    Schema.Literals(['minimal', 'low', 'medium', 'high', 'xhigh']),
  ),
  approvalPolicy: Schema.optional(
    Schema.Literals(['untrusted', 'on-request', 'never']),
  ),
  sandbox: Schema.optional(
    Schema.Literals(['read-only', 'workspace-write', 'danger-full-access']),
  ),
  requestTimeoutMs: Schema.optional(Schema.Int),
});

const CodexStartPayload = Schema.Union([
  Schema.Struct({
    threadId: Schema.String,
    runId: Schema.String,
    message: UserTurnSchema,
    model: Schema.Literal('gpt-5.3-codex'),
    options: CodexOptionsSchema,
  }),
  Schema.Struct({
    threadId: Schema.String,
    runId: Schema.String,
    message: UserTurnSchema,
    model: Schema.Literal('gpt-5.1-codex-mini'),
    options: CodexOptionsSchema,
  }),
]);

export type ClaudeStartInput = typeof ClaudeStartPayload.Type;
export type CodexStartInput = typeof CodexStartPayload.Type;

export const AiRpcError = AiErrorSchema;

const WatchRun = Rpc.make('watchRun', {
  payload: Schema.Struct({
    runId: Schema.String,
    after: Schema.optional(Schema.Int),
  }),
  success: RunChunkSchema,
  error: AiRpcError,
  stream: true,
});

const WatchThread = Rpc.make('watchThread', {
  payload: Schema.Struct({
    threadId: Schema.String,
    after: Schema.optional(
      Schema.Struct({
        runId: Schema.String,
        sequence: Schema.Int,
      }),
    ),
  }),
  success: RunChunkSchema,
  error: AiRpcError,
  stream: true,
});

const CancelRun = Rpc.make('cancelRun', {
  payload: Schema.Struct({
    runId: Schema.String,
    reason: Schema.optional(Schema.String),
  }),
  success: Schema.Void,
  error: AiRpcError,
});

const GetThread = Rpc.make('getThread', {
  payload: Schema.Struct({ threadId: Schema.String }),
  success: ThreadStateSchema,
  error: AiRpcError,
});

const ClaudeStart = Rpc.make('claudeStart', {
  payload: ClaudeStartPayload,
  success: ClaudeRunChunkSchema,
  error: AiRpcError,
  stream: true,
});

const ClaudeRespond = Rpc.make('claudeRespond', {
  payload: Schema.Struct({
    runId: Schema.String,
    requestId: Schema.String,
    answer: ClaudeAnswerSchema,
  }),
  success: Schema.Void,
  error: AiRpcError,
});

const CodexStart = Rpc.make('codexStart', {
  payload: CodexStartPayload,
  success: CodexRunChunkSchema,
  error: AiRpcError,
  stream: true,
});

const CodexRespond = Rpc.make('codexRespond', {
  payload: Schema.Struct({
    runId: Schema.String,
    requestId: Schema.String,
    answer: CodexAnswerSchema,
  }),
  success: Schema.Void,
  error: AiRpcError,
});

export class CommonRpc extends RpcGroup.make(
  WatchRun,
  WatchThread,
  CancelRun,
  GetThread,
) {}

export class ClaudeRpc extends RpcGroup.make(ClaudeStart, ClaudeRespond) {}
export class CodexRpc extends RpcGroup.make(CodexStart, CodexRespond) {}

export class AiRpc extends CommonRpc.merge(ClaudeRpc).merge(CodexRpc) {}
