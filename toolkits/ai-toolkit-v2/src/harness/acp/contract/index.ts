import type {
  ClientContext,
  ContentBlock,
  CreateElicitationRequest,
  CreateElicitationResponse,
  ForkSessionRequest,
  InitializeResponse,
  JsonRpcId,
  ListSessionsRequest,
  ListSessionsResponse,
  NewSessionRequest,
  PromptResponse,
  RequestPermissionRequest,
  RequestPermissionResponse,
  ResumeSessionRequest,
  SessionConfigOption,
  SessionId,
  SessionModeId,
  SessionModeState,
  SessionNotification,
  SetSessionConfigOptionRequest,
  SetSessionConfigOptionResponse,
  SetSessionModeRequest,
  SetSessionModeResponse,
} from '@agentclientprotocol/sdk/unstable';
import { Data } from 'effect';
import type { Effect, Stream } from 'effect';

export class NotLive extends Data.TaggedError('NotLive')<{
  readonly id: SessionId;
}> {}

export class AcpError extends Data.TaggedError('AcpError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type ConfigValue = SetSessionConfigOptionRequest extends infer Request
  ? Request extends unknown
    ? Omit<Request, 'sessionId'>
    : never
  : never;

export interface RunOptions {
  readonly prompt: Array<ContentBlock>;
  readonly mode?: SessionModeId;
  readonly config?: ReadonlyArray<ConfigValue>;
}

export interface CreateInput extends RunOptions {
  readonly session: NewSessionRequest;
}

export interface ForkInput extends RunOptions {
  readonly session: ForkSessionRequest;
}

export interface SendInput extends RunOptions {
  readonly session: ResumeSessionRequest;
}

export type Pending =
  | {
      readonly requestId: JsonRpcId;
      readonly method: 'session/request_permission';
      readonly request: RequestPermissionRequest;
    }
  | {
      readonly requestId: JsonRpcId;
      readonly method: 'elicitation/create';
      readonly request: CreateElicitationRequest;
    };

export type Answer = RequestPermissionResponse | CreateElicitationResponse;

export type Requested = { readonly _tag: 'Requested' } & Pending;

export type Out =
  | Requested
  | Data.TaggedEnum<{
      Started: { readonly id: SessionId };
      Queued: { readonly position: number };
      Record: { readonly record: SessionNotification };
      Ended: {
        readonly status: 'completed' | 'cancelled' | 'failed';
        readonly result?: PromptResponse;
        readonly error?: AcpError;
      };
    }>;

export interface Live {
  readonly id: SessionId;
  readonly status: 'starting' | 'running' | 'ready';
  readonly queue: number;
  readonly requests: ReadonlyArray<Pending>;
  readonly initialize?: InitializeResponse | undefined;
  readonly modes?: SessionModeState | null | undefined;
  readonly configOptions?: Array<SessionConfigOption> | null | undefined;
}

export interface AcpAgent {
  readonly create: (input: CreateInput) => Stream.Stream<Out, AcpError>;
  readonly fork: (input: ForkInput) => Stream.Stream<Out, AcpError>;
  readonly send: (input: SendInput) => Stream.Stream<Out, AcpError>;
  readonly respond: (
    id: SessionId,
    requestId: JsonRpcId,
    answer: Answer,
  ) => Effect.Effect<void, NotLive | AcpError>;
  readonly cancel: (id: SessionId) => Effect.Effect<void, NotLive>;
  readonly watch: (id: SessionId) => Stream.Stream<Live>;
  readonly live: Effect.Effect<ReadonlyArray<Live>>;
  readonly initialize: Effect.Effect<InitializeResponse, AcpError>;
  readonly listSessions: (
    request: ListSessionsRequest,
  ) => Effect.Effect<ListSessionsResponse, AcpError>;
  readonly setMode: (
    request: SetSessionModeRequest,
  ) => Effect.Effect<SetSessionModeResponse, NotLive | AcpError>;
  readonly setConfigOption: (
    request: SetSessionConfigOptionRequest,
  ) => Effect.Effect<SetSessionConfigOptionResponse, NotLive | AcpError>;
  readonly connection: (id: SessionId) => Effect.Effect<ClientContext, NotLive>;
}
