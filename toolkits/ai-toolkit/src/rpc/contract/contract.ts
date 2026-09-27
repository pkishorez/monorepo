import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  AiErrorSchema,
  CLAUDE_MODELS,
  CODEX_MODELS,
  ClaudeAnswerSchema,
  CodexAnswerSchema,
  UserTurnSchema,
} from '../../runtime/protocol/index.js';

export {
  CLAUDE_MODELS,
  CLAUDE_PARTS,
  CODEX_MODELS,
  CODEX_PARTS,
  COMMON_PARTS,
  CUSTOM_PART_NAMES,
  HarnessFailed,
  RUN_STATUSES,
  RequestNotFound,
  RunConflict,
  RunNotFound,
  THREAD_STATUSES,
  ThreadBusy,
  ThreadNotFound,
} from '../../runtime/protocol/index.js';
export type {
  AgentQuestion,
  AiCustomPart,
  AiMessagePart,
  Answer,
  ClaudeAnswer,
  ClaudePart,
  CodexAnswer,
  CodexPart,
  CommonPart,
  HarnessId,
  RunStatus,
  ThreadStatus,
  UserTurn,
} from '../../runtime/protocol/index.js';

const ClaudeOptions = {
  permissionMode: Schema.optional(
    Schema.Literals([
      'default',
      'acceptEdits',
      'bypassPermissions',
      'dontAsk',
      'auto',
    ]),
  ),
  allowDangerouslySkipPermissions: Schema.optional(Schema.Boolean),
  maxTurns: Schema.optional(Schema.Int),
  permissionTimeoutMs: Schema.optional(Schema.Int),
};

const ThinkingOptions = {
  thinking: Schema.optional(Schema.Struct({ budgetTokens: Schema.Int })),
};

const claudeStartPayload = <
  Model extends (typeof CLAUDE_MODELS)[number],
  Options extends Schema.Struct.Fields,
>(
  model: Model,
  options: Options,
) =>
  Schema.Struct({
    threadId: Schema.String,
    runId: Schema.String,
    message: UserTurnSchema,
    model: Schema.Literal(model),
    options: Schema.Struct(options),
  });

// Haiku does not support extended thinking.
const ClaudeStartPayload = Schema.Union([
  claudeStartPayload('claude-opus-4-6', {
    ...ThinkingOptions,
    ...ClaudeOptions,
  }),
  claudeStartPayload('claude-sonnet-4-6', {
    ...ThinkingOptions,
    ...ClaudeOptions,
  }),
  claudeStartPayload('claude-haiku-4-5', ClaudeOptions),
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

const CodexStartPayload = Schema.Struct({
  threadId: Schema.String,
  runId: Schema.String,
  message: UserTurnSchema,
  model: Schema.Literals(CODEX_MODELS),
  options: CodexOptionsSchema,
});

export type ClaudeStartInput = typeof ClaudeStartPayload.Type;
export type CodexStartInput = typeof CodexStartPayload.Type;

export const AiRpcError = AiErrorSchema;

const CancelRun = Rpc.make('cancelRun', {
  payload: Schema.Struct({
    runId: Schema.String,
    reason: Schema.optional(Schema.String),
  }),
  success: Schema.Void,
  error: AiRpcError,
});

const ClaudeStart = Rpc.make('claudeStart', {
  payload: ClaudeStartPayload,
  success: Schema.Void,
  error: AiRpcError,
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
  success: Schema.Void,
  error: AiRpcError,
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

export class CommonRpc extends RpcGroup.make(CancelRun) {}
export class ClaudeRpc extends RpcGroup.make(ClaudeStart, ClaudeRespond) {}
export class CodexRpc extends RpcGroup.make(CodexStart, CodexRespond) {}

/** The execution contract. Every observable fact arrives through the AI Table. */
export class AiRpc extends CommonRpc.merge(ClaudeRpc).merge(CodexRpc) {}
