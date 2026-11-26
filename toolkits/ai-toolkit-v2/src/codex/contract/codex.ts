import { Context, type Data, type Effect, type Stream } from 'effect';
import type { CodexError, NotLive } from './errors.ts';
import type {
  ClientRequests,
  ConfigReadParams,
  ConfigReadResponse,
  GetAccountParams,
  GetAccountRateLimitsParams,
  GetAccountRateLimitsResponse,
  GetAccountResponse,
  GetAccountTokenUsageParams,
  GetAccountTokenUsageResponse,
  ListMcpServerStatusParams,
  ListMcpServerStatusResponse,
  ModelListParams,
  ModelListResponse,
  RequestId,
  ServerNotification,
  ServerRequest,
  ServerRequests,
  SkillsListParams,
  SkillsListResponse,
  ThreadForkParams,
  ThreadListParams,
  ThreadListResponse,
  ThreadReadParams,
  ThreadReadResponse,
  ThreadResumeParams,
  ThreadStartParams,
  TurnError,
  TurnStartParams,
} from './protocol.gen.ts';

export type Method = keyof ClientRequests;
export type Params<M extends Method> = ClientRequests[M]['params'];
export type Result<M extends Method> = ClientRequests[M]['result'];
export type Answer = ServerRequests[keyof ServerRequests]['result'];

export type TurnInput = Omit<TurnStartParams, 'threadId'>;
export type Mode = 'queue' | 'steer';

export interface CreateInput {
  readonly thread?: ThreadStartParams;
  readonly turn: TurnInput;
}

export interface ForkInput {
  readonly id: string;
  readonly thread?: Omit<ThreadForkParams, 'threadId'>;
  readonly turn: TurnInput;
}

export interface SendInput {
  readonly id: string;
  readonly thread?: Omit<ThreadResumeParams, 'threadId'>;
  readonly turn: TurnInput;
  readonly mode?: Mode;
}

export type ItemCompleted = Extract<
  ServerNotification,
  { method: 'item/completed' }
>;

export type Out = Data.TaggedEnum<{
  Started: { readonly id: string };
  Queued: { readonly position: number };
  Record: { readonly record: ServerNotification };
  Requested: { readonly request: ServerRequest };
  Steered: { readonly message: ItemCompleted };
  Ended: {
    readonly status: 'completed' | 'cancelled' | 'failed';
    readonly at?: string;
    readonly result?: string;
    readonly error?: TurnError | CodexError;
  };
}>;

export interface Live {
  readonly id: string;
  readonly status: 'starting' | 'running' | 'ready';
  readonly queue: number;
  readonly requests: ReadonlyArray<ServerRequest>;
  readonly turnId?: string;
  readonly cwd: string;
  readonly model: string;
}

export class Codex extends Context.Service<
  Codex,
  {
    readonly create: (input: CreateInput) => Stream.Stream<Out, CodexError>;
    readonly fork: (input: ForkInput) => Stream.Stream<Out, CodexError>;
    readonly send: (input: SendInput) => Stream.Stream<Out, CodexError>;
    readonly respond: (
      id: string,
      requestId: RequestId,
      answer: Answer,
    ) => Effect.Effect<void, NotLive | CodexError>;
    readonly cancel: (id: string) => Effect.Effect<void, NotLive>;
    readonly watch: (id: string) => Stream.Stream<Live>;
    readonly live: Effect.Effect<ReadonlyArray<Live>>;
    readonly request: <M extends Method>(
      id: string,
      method: M,
      params: Params<M>,
    ) => Effect.Effect<Result<M>, NotLive | CodexError>;
    readonly compact: (id: string) => Effect.Effect<void, NotLive | CodexError>;
    readonly models: (
      params?: ModelListParams,
    ) => Effect.Effect<ModelListResponse, CodexError>;
    readonly account: (
      params?: GetAccountParams,
    ) => Effect.Effect<GetAccountResponse, CodexError>;
    readonly rateLimits: (
      params?: GetAccountRateLimitsParams,
    ) => Effect.Effect<GetAccountRateLimitsResponse, CodexError>;
    readonly usage: (
      params?: GetAccountTokenUsageParams,
    ) => Effect.Effect<GetAccountTokenUsageResponse, CodexError>;
    readonly threads: (
      params?: ThreadListParams,
    ) => Effect.Effect<ThreadListResponse, CodexError>;
    readonly read: (
      params: ThreadReadParams,
    ) => Effect.Effect<ThreadReadResponse, CodexError>;
    readonly skills: (
      params?: SkillsListParams,
    ) => Effect.Effect<SkillsListResponse, CodexError>;
    readonly mcpStatus: (
      params?: ListMcpServerStatusParams,
    ) => Effect.Effect<ListMcpServerStatusResponse, CodexError>;
    readonly config: (
      params?: ConfigReadParams,
    ) => Effect.Effect<ConfigReadResponse, CodexError>;
  }
>()('@kestack/ai-toolkit-v2/Codex') {}
