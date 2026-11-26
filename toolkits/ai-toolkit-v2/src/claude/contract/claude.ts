import type {
  GetSessionInfoOptions,
  GetSessionMessagesOptions,
  GetSubagentMessagesOptions,
  ListSessionsOptions,
  ListSubagentsOptions,
  McpServerStatus,
  PermissionMode,
  PermissionResult,
  Query,
  SDKControlGetContextUsageResponse,
  SDKControlInitializeResponse,
  SDKSessionInfo,
  SessionMessage,
  SessionMutationOptions,
} from '@anthropic-ai/claude-agent-sdk';
import { Context, type Effect, type Stream } from 'effect';
import type { ClaudeError, NotLive } from './errors.js';
import type {
  CreateInput,
  ForkInput,
  Live,
  Out,
  SendInput,
  StartInput,
} from './out.js';

export type FlagSettings = Parameters<Query['applyFlagSettings']>[0];

export interface ClaudeService {
  readonly create: (input: CreateInput) => Stream.Stream<Out, ClaudeError>;
  readonly fork: (input: ForkInput) => Stream.Stream<Out, ClaudeError>;
  readonly send: (input: SendInput) => Stream.Stream<Out, ClaudeError>;
  readonly respond: (
    id: string,
    requestId: string,
    answer: PermissionResult,
  ) => Effect.Effect<void, NotLive | ClaudeError>;
  readonly cancel: (id: string) => Effect.Effect<void, NotLive>;
  readonly watch: (id: string) => Stream.Stream<Live>;
  readonly live: Effect.Effect<ReadonlyArray<Live>>;

  readonly initialization: (
    input: StartInput,
  ) => Effect.Effect<SDKControlInitializeResponse, ClaudeError>;
  readonly contextUsage: (
    id: string,
  ) => Effect.Effect<SDKControlGetContextUsageResponse, NotLive | ClaudeError>;
  readonly mcpServerStatus: (
    id: string,
  ) => Effect.Effect<ReadonlyArray<McpServerStatus>, NotLive | ClaudeError>;
  readonly setModel: (
    id: string,
    model?: string,
  ) => Effect.Effect<void, NotLive | ClaudeError>;
  readonly setPermissionMode: (
    id: string,
    mode: PermissionMode,
  ) => Effect.Effect<void, NotLive | ClaudeError>;
  readonly applyFlagSettings: (
    id: string,
    settings: FlagSettings,
  ) => Effect.Effect<void, NotLive | ClaudeError>;

  readonly listSessions: (
    options?: ListSessionsOptions,
  ) => Effect.Effect<ReadonlyArray<SDKSessionInfo>, ClaudeError>;
  readonly sessionInfo: (
    id: string,
    options?: GetSessionInfoOptions,
  ) => Effect.Effect<SDKSessionInfo | undefined, ClaudeError>;
  readonly sessionMessages: (
    id: string,
    options?: GetSessionMessagesOptions,
  ) => Effect.Effect<ReadonlyArray<SessionMessage>, ClaudeError>;
  readonly listSubagents: (
    id: string,
    options?: ListSubagentsOptions,
  ) => Effect.Effect<ReadonlyArray<string>, ClaudeError>;
  readonly subagentMessages: (
    id: string,
    agentId: string,
    options?: GetSubagentMessagesOptions,
  ) => Effect.Effect<ReadonlyArray<SessionMessage>, ClaudeError>;
  readonly renameSession: (
    id: string,
    title: string,
    options?: SessionMutationOptions,
  ) => Effect.Effect<void, ClaudeError>;
  readonly tagSession: (
    id: string,
    tag: string | null,
    options?: SessionMutationOptions,
  ) => Effect.Effect<void, ClaudeError>;
  readonly deleteSession: (
    id: string,
    options?: SessionMutationOptions,
  ) => Effect.Effect<void, ClaudeError>;
}

export class Claude extends Context.Service<Claude, ClaudeService>()(
  '@kestack/ai-toolkit-v2/Claude',
) {}
