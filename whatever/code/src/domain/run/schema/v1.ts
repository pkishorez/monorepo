import { Schema } from 'effect';
import { id } from 'std-toolkit/eschema';

export const CodexModelOptionsV1 = Schema.Struct({
  sandboxMode: Schema.NullOr(
    Schema.Literals(['read-only', 'workspace-write', 'danger-full-access']),
  ),
  approvalPolicy: Schema.NullOr(
    Schema.Literals(['never', 'on-failure', 'on-request', 'untrusted']),
  ),
  modelReasoningEffort: Schema.NullOr(
    Schema.Literals(['minimal', 'low', 'medium', 'high']),
  ),
  skipGitRepoCheck: Schema.NullOr(Schema.Boolean),
});

export const ClaudeCodeModelOptionsV1 = Schema.Struct({
  maxTurns: Schema.NullOr(Schema.Int.check(Schema.isGreaterThan(0))),
  permissionMode: Schema.NullOr(
    Schema.Literals(['default', 'acceptEdits', 'bypassPermissions', 'plan']),
  ),
  allowedTools: Schema.Array(Schema.String),
  disallowedTools: Schema.Array(Schema.String),
});

export const CodexRunConfigurationV1 = Schema.Struct({
  _tag: Schema.Literal('Codex'),
  model: Schema.String,
  modelOptions: CodexModelOptionsV1,
});

export const ClaudeCodeRunConfigurationV1 = Schema.Struct({
  _tag: Schema.Literal('ClaudeCode'),
  model: Schema.String,
  modelOptions: ClaudeCodeModelOptionsV1,
});

export const RunConfigurationV1 = Schema.Union([
  CodexRunConfigurationV1,
  ClaudeCodeRunConfigurationV1,
]);

const FinishReasonV1 = Schema.Literals([
  'stop',
  'length',
  'content_filter',
  'tool_calls',
]);

export const CompletedRunTerminalV1 = Schema.Struct({
  _tag: Schema.Literal('Completed'),
  finishReason: Schema.NullOr(FinishReasonV1),
});

export const FailedRunTerminalV1 = Schema.Struct({
  _tag: Schema.Literal('Failed'),
  code: Schema.NullOr(Schema.String),
  message: Schema.String,
});

export const InterruptedRunTerminalV1 = Schema.Struct({
  _tag: Schema.Literal('Interrupted'),
  code: Schema.String,
  message: Schema.String,
});

export const RunTerminalDetailsV1 = Schema.Union([
  CompletedRunTerminalV1,
  FailedRunTerminalV1,
  InterruptedRunTerminalV1,
]);

export const RunStatusV1 = Schema.Literals([
  'running',
  'completed',
  'failed',
  'interrupted',
]);

export const RunV1 = {
  threadId: id('ThreadId'),
  status: RunStatusV1,
  configuration: RunConfigurationV1,
  terminalDetails: Schema.NullOr(RunTerminalDetailsV1),
};
