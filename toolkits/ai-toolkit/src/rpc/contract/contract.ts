import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  claude,
  codex,
  common,
  type ClaudeProtocol,
  type CodexProtocol,
  type CommonProtocol,
} from '../../runtime/protocol/index.js';

export { claude, codex, common };
export type { ClaudeProtocol, CodexProtocol, CommonProtocol };

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
  Model extends (typeof claude.models)[number],
  Options extends Schema.Struct.Fields,
>(
  model: Model,
  options: Options,
) =>
  Schema.Struct({
    threadId: Schema.String,
    runId: Schema.String,
    message: common.schemas.userTurn,
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
  message: common.schemas.userTurn,
  model: Schema.Literals(codex.models),
  options: CodexOptionsSchema,
});

export type ClaudeStartInput = typeof ClaudeStartPayload.Type;
export type CodexStartInput = typeof CodexStartPayload.Type;

export const AiRpcError = common.schemas.aiError;

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
    answer: claude.schemas.answer,
  }),
  success: Schema.Void,
  error: AiRpcError,
});

const ClaudeGetAccountUsage = Rpc.make('claudeGetAccountUsage', {
  success: claude.schemas.accountUsage,
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
    answer: codex.schemas.answer,
  }),
  success: Schema.Void,
  error: AiRpcError,
});

const CodexGetAccountUsage = Rpc.make('codexGetAccountUsage', {
  success: codex.schemas.accountUsage,
  error: AiRpcError,
});

export class CommonRpc extends RpcGroup.make(CancelRun) {}
export class ClaudeRpc extends RpcGroup.make(
  ClaudeStart,
  ClaudeRespond,
  ClaudeGetAccountUsage,
) {}
export class CodexRpc extends RpcGroup.make(
  CodexStart,
  CodexRespond,
  CodexGetAccountUsage,
) {}

/** Run facts arrive through the AI Table; account usage is read live. */
export class AiRpc extends CommonRpc.merge(ClaudeRpc).merge(CodexRpc) {}
