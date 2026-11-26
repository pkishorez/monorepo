import type * as acp from '@agentclientprotocol/sdk/unstable';
import { Context, type Data, type Effect, type Stream } from 'effect';
import type { AntigravityError, NotLive } from './errors.ts';
import type { PromptInput, Result } from './print.ts';

export interface Flags {
  readonly addDir?: ReadonlyArray<string>;
  readonly agent?: string;
  readonly geminiDir?: string;
  readonly appDataDir?: string;
  readonly sandbox?: boolean;
  readonly dangerouslySkipPermissions?: boolean;
  readonly args?: ReadonlyArray<string>;
}

export type ConfigValue =
  acp.SetSessionConfigOptionRequest extends infer Request
    ? Request extends unknown
      ? Omit<Request, 'sessionId'>
      : never
    : never;

export interface RunInput {
  readonly prompt: Array<acp.ContentBlock>;
  readonly config?: ReadonlyArray<ConfigValue>;
  readonly flags?: Flags;
}

export interface CreateInput extends RunInput {
  readonly session: acp.NewSessionRequest;
  readonly systemPrompt?: string;
}

export interface SendInput extends RunInput {
  readonly session: acp.ResumeSessionRequest;
  readonly mode?: 'queue' | 'steer';
}

export type Request =
  | {
      readonly method: 'session/request_permission';
      readonly id: acp.JsonRpcId;
      readonly params: acp.RequestPermissionRequest;
    }
  | {
      readonly method: 'elicitation/create';
      readonly id: acp.JsonRpcId;
      readonly params: acp.CreateElicitationRequest;
    };

export type Answer =
  | acp.RequestPermissionResponse
  | acp.CreateElicitationResponse;

export type Out = Data.TaggedEnum<{
  Started: { readonly id: string };
  Queued: { readonly position: number };
  Record: { readonly record: acp.SessionNotification };
  Requested: { readonly request: Request };
  Steered: { readonly message: Array<acp.ContentBlock> };
  Ended: {
    readonly status: 'completed' | 'cancelled' | 'failed';
    readonly result?: acp.PromptResponse;
    readonly error?: AntigravityError;
  };
}>;

export interface Live {
  readonly id: string;
  readonly status: 'starting' | 'running' | 'ready';
  readonly queue: number;
  readonly requests: ReadonlyArray<Request>;
  readonly cwd: string;
  readonly initialize: acp.InitializeResponse;
  readonly modes?: acp.SessionModeState | null;
  readonly configOptions?: Array<acp.SessionConfigOption> | null;
  readonly commands: Array<acp.AvailableCommand>;
  readonly update?: acp.SessionNotification;
}

export class Antigravity extends Context.Service<
  Antigravity,
  {
    readonly create: (
      input: CreateInput,
    ) => Stream.Stream<Out, AntigravityError>;
    readonly send: (input: SendInput) => Stream.Stream<Out, AntigravityError>;
    readonly respond: (
      id: string,
      requestId: acp.JsonRpcId,
      answer: Answer,
    ) => Effect.Effect<void, NotLive | AntigravityError>;
    readonly cancel: (id: string) => Effect.Effect<void, NotLive>;
    readonly watch: (id: string) => Stream.Stream<Live>;
    readonly live: Effect.Effect<ReadonlyArray<Live>>;
    readonly initialize: (
      flags?: Flags,
    ) => Effect.Effect<acp.InitializeResponse, AntigravityError>;
    readonly listSessions: (
      request?: acp.ListSessionsRequest,
      flags?: Flags,
    ) => Effect.Effect<acp.ListSessionsResponse, AntigravityError>;
    readonly closeSession: (
      id: string,
    ) => Effect.Effect<void, NotLive | AntigravityError>;
    readonly setConfigOption: (
      request: acp.SetSessionConfigOptionRequest,
    ) => Effect.Effect<
      acp.SetSessionConfigOptionResponse,
      NotLive | AntigravityError
    >;
    readonly prompt: (
      input: PromptInput,
    ) => Effect.Effect<Result, AntigravityError>;
    readonly connection: (
      id: string,
    ) => Effect.Effect<acp.ClientContext, NotLive>;
  }
>()('@kestack/ai-toolkit-v2/Antigravity') {}
