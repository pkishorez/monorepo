import type {
  CanUseTool,
  Options,
  PermissionMode,
  SDKMessage,
  SDKRateLimitInfo,
  SDKResultMessage,
  SDKUserMessage,
  SDKUserMessageReplay,
} from '@anthropic-ai/claude-agent-sdk';
import type { Data } from 'effect';

export type Prompt = SDKUserMessage['message']['content'];

export type ClaudeOptions = Omit<
  Options,
  | 'abortController'
  | 'canUseTool'
  | 'continue'
  | 'cwd'
  | 'forkSession'
  | 'resume'
  | 'resumeSessionAt'
  | 'sessionId'
>;

export interface ClaudeRequest {
  readonly toolName: string;
  readonly input: Record<string, unknown>;
  readonly options: Omit<Parameters<CanUseTool>[2], 'signal'>;
}

export type Status = 'completed' | 'cancelled' | 'failed';

export type Out = Data.TaggedEnum<{
  Started: { readonly id: string };
  Queued: { readonly position: number };
  Record: { readonly record: SDKMessage };
  Requested: { readonly request: ClaudeRequest };
  Steered: { readonly message: SDKUserMessageReplay };
  Ended: {
    readonly status: Status;
    readonly at?: string;
    readonly result?: SDKResultMessage;
    readonly error?: string;
  };
}>;

export interface Live {
  readonly id: string;
  readonly cwd: string;
  readonly status: 'starting' | 'running' | 'ready';
  readonly queue: number;
  readonly requests: ReadonlyArray<ClaudeRequest>;
  readonly model?: string;
  readonly permissionMode?: PermissionMode;
  readonly rateLimit?: SDKRateLimitInfo;
}

export interface CreateInput {
  readonly cwd: string;
  readonly prompt: Prompt;
  readonly options?: ClaudeOptions;
}

export type Mode = 'queue' | 'steer';

export interface SendInput extends CreateInput {
  readonly id: string;
  readonly mode?: Mode;
}

export interface ForkInput extends CreateInput {
  readonly id: string;
  readonly at?: string;
}

export interface StartInput {
  readonly cwd: string;
  readonly options?: ClaudeOptions;
}
