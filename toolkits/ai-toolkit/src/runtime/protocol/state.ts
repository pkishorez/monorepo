import { Schema } from 'effect';
import type {
  AiCustomPart,
  AiThinkingPart,
  AiToolCallPart,
  AiToolResultPart,
} from './parts.js';

export type HarnessId = 'claude' | 'codex';

export const HARNESS_IDS = ['claude', 'codex'] as const;

export const CLAUDE_MODELS = [
  'claude-opus-4-6',
  'claude-sonnet-4-6',
  'claude-haiku-4-5',
] as const;

export const CODEX_MODELS = [
  'gpt-6-astra',
  'gpt-5.6-sol',
  'gpt-5.6-terra',
  'gpt-5.6-luna',
  'gpt-5.5',
  'gpt-5.3-codex',
] as const;

export const RUN_STATUSES = [
  'running',
  'waiting',
  'completed',
  'failed',
  'cancelled',
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const THREAD_STATUSES = [
  'idle',
  'running',
  'waiting-question',
  'waiting-approval',
  'cancelled',
  'failed',
] as const;
export type ThreadStatus = (typeof THREAD_STATUSES)[number];

export const ACTIVE_RUN_STATUSES: ReadonlyArray<RunStatus> = [
  'running',
  'waiting',
];
export const ACTIVE_THREAD_STATUSES: ReadonlyArray<ThreadStatus> = [
  'running',
  'waiting-question',
  'waiting-approval',
];

export interface UserTurn {
  readonly id: string;
  readonly content: string;
}

export const UserTurnSchema = Schema.Struct({
  id: Schema.String,
  content: Schema.String,
});

interface RunInput {
  readonly threadId: string;
  readonly runId: string;
  readonly message: UserTurn;
  readonly model: string;
}

export interface ClaudeRunInput extends RunInput {
  readonly options: {
    readonly thinking?: { readonly budgetTokens: number } | undefined;
    readonly permissionMode?:
      | 'default'
      | 'acceptEdits'
      | 'bypassPermissions'
      | 'dontAsk'
      | 'auto'
      | undefined;
    readonly allowDangerouslySkipPermissions?: boolean | undefined;
    readonly maxTurns?: number | undefined;
    readonly permissionTimeoutMs?: number | undefined;
  };
}

export interface CodexRunInput extends RunInput {
  readonly options: {
    readonly reasoningEffort?:
      | 'minimal'
      | 'low'
      | 'medium'
      | 'high'
      | 'xhigh'
      | undefined;
    readonly approvalPolicy?: 'untrusted' | 'on-request' | 'never' | undefined;
    readonly sandbox?:
      | 'read-only'
      | 'workspace-write'
      | 'danger-full-access'
      | undefined;
    readonly requestTimeoutMs?: number | undefined;
  };
}

export type StartInput =
  | ({ readonly harness: 'claude' } & ClaudeRunInput)
  | ({ readonly harness: 'codex' } & CodexRunInput);

/**
 * The one surface a Coding Harness writes through during a Run. Every call is
 * synchronous; the Transcript decides when the buffered parts become Messages.
 */
export interface TranscriptWriter {
  readonly text: (delta: string) => void;
  readonly thinking: (delta: string) => void;
  readonly toolCall: (part: Omit<AiToolCallPart, 'type'>) => void;
  readonly toolResult: (part: Omit<AiToolResultPart, 'type'>) => void;
  readonly thinkingPart: (part: Omit<AiThinkingPart, 'type'>) => void;
  /** A harness-specific or common custom part. */
  readonly part: (part: AiCustomPart) => void;
  /** A Resolution the user gave, recorded as a user Message. */
  readonly resolution: (part: AiCustomPart) => void;
}

export interface HarnessContext {
  readonly cwd: string;
  readonly sessionId?: string;
  readonly signal: AbortSignal;
  readonly transcript: TranscriptWriter;
  /** Records the Harness Thread identity the harness minted or resumed. */
  readonly session: (sessionId: string) => Promise<void>;
}

export type RunOutcome =
  | { readonly type: 'completed' }
  | { readonly type: 'failed'; readonly message: string };

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

export class HarnessFailed extends Schema.TaggedError<HarnessFailed>()(
  'HarnessFailed',
  { harness: Schema.Literals(HARNESS_IDS), message: Schema.String },
) {}

export const AiErrorSchema = Schema.Union([
  RunConflict,
  ThreadBusy,
  ThreadNotFound,
  RunNotFound,
  RequestNotFound,
  HarnessFailed,
]);

export type AiError = typeof AiErrorSchema.Type;
