import type * as acp from '@agentclientprotocol/sdk/unstable';
import { Data } from 'effect';
import type { Effect, Stream } from 'effect';

export class NotLive extends Data.TaggedError('NotLive')<{
  readonly id: acp.SessionId;
}> {}

export class AcpError extends Data.TaggedError('AcpError')<{
  readonly message: string;
  readonly cause?: unknown;
}> {}

export type ConfigValue =
  acp.SetSessionConfigOptionRequest extends infer Request
    ? Request extends unknown
      ? Omit<Request, 'sessionId'>
      : never
    : never;

export interface RunOptions {
  readonly prompt: Array<acp.ContentBlock>;
  readonly mode?: acp.SessionModeId;
  readonly config?: ReadonlyArray<ConfigValue>;
}

export interface CreateInput extends RunOptions {
  readonly session: acp.NewSessionRequest;
}

export interface ForkInput extends RunOptions {
  readonly session: acp.ForkSessionRequest;
}

export interface SendInput extends RunOptions {
  readonly session: acp.ResumeSessionRequest;
}

export type Pending =
  | {
      readonly requestId: acp.JsonRpcId;
      readonly method: 'session/request_permission';
      readonly request: acp.RequestPermissionRequest;
    }
  | {
      readonly requestId: acp.JsonRpcId;
      readonly method: 'elicitation/create';
      readonly request: acp.CreateElicitationRequest;
    };

export type Answer =
  | acp.RequestPermissionResponse
  | acp.CreateElicitationResponse;

export type Requested = { readonly _tag: 'Requested' } & Pending;

export type Out =
  | Requested
  | Data.TaggedEnum<{
      Started: { readonly id: acp.SessionId };
      Queued: { readonly position: number };
      Record: { readonly record: acp.SessionNotification };
      Ended: {
        readonly status: 'completed' | 'cancelled' | 'failed';
        readonly result?: acp.PromptResponse;
        readonly error?: AcpError;
      };
    }>;

export interface Live {
  readonly id: acp.SessionId;
  readonly status: 'starting' | 'running' | 'ready';
  readonly queue: number;
  readonly requests: ReadonlyArray<Pending>;
  readonly initialize?: acp.InitializeResponse | undefined;
  readonly modes?: acp.SessionModeState | null | undefined;
  readonly configOptions?: Array<acp.SessionConfigOption> | null | undefined;
}

export interface AcpAgent {
  readonly create: (input: CreateInput) => Stream.Stream<Out, AcpError>;
  readonly fork: (input: ForkInput) => Stream.Stream<Out, AcpError>;
  readonly send: (input: SendInput) => Stream.Stream<Out, AcpError>;
  readonly respond: (
    id: acp.SessionId,
    requestId: acp.JsonRpcId,
    answer: Answer,
  ) => Effect.Effect<void, NotLive | AcpError>;
  readonly cancel: (id: acp.SessionId) => Effect.Effect<void, NotLive>;
  readonly watch: (id: acp.SessionId) => Stream.Stream<Live>;
  readonly live: Effect.Effect<ReadonlyArray<Live>>;
  readonly initialize: Effect.Effect<acp.InitializeResponse, AcpError>;
  readonly listSessions: (
    request: acp.ListSessionsRequest,
  ) => Effect.Effect<acp.ListSessionsResponse, AcpError>;
  readonly setMode: (
    request: acp.SetSessionModeRequest,
  ) => Effect.Effect<acp.SetSessionModeResponse, NotLive | AcpError>;
  readonly setConfigOption: (
    request: acp.SetSessionConfigOptionRequest,
  ) => Effect.Effect<acp.SetSessionConfigOptionResponse, NotLive | AcpError>;
  readonly connection: (
    id: acp.SessionId,
  ) => Effect.Effect<acp.ClientContext, NotLive>;
}
