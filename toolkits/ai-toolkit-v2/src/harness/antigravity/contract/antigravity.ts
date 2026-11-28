import type {
  AvailableCommand,
  ClientContext,
  ContentBlock,
  CreateElicitationRequest,
  CreateElicitationResponse,
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
  SessionModeState,
  SessionNotification,
  SetSessionConfigOptionRequest,
  SetSessionConfigOptionResponse,
} from '@agentclientprotocol/sdk/unstable';
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

export type ConfigValue = SetSessionConfigOptionRequest extends infer Request
  ? Request extends unknown
    ? Omit<Request, 'sessionId'>
    : never
  : never;

export interface RunInput {
  readonly prompt: Array<ContentBlock>;
  readonly config?: ReadonlyArray<ConfigValue>;
  readonly flags?: Flags;
}

export interface CreateInput extends RunInput {
  readonly session: NewSessionRequest;
  readonly systemPrompt?: string;
}

export interface SendInput extends RunInput {
  readonly session: ResumeSessionRequest;
  readonly mode?: 'queue' | 'steer';
}

export type Request =
  | {
      readonly method: 'session/request_permission';
      readonly id: JsonRpcId;
      readonly params: RequestPermissionRequest;
    }
  | {
      readonly method: 'elicitation/create';
      readonly id: JsonRpcId;
      readonly params: CreateElicitationRequest;
    };

export type Answer = RequestPermissionResponse | CreateElicitationResponse;

export type Out = Data.TaggedEnum<{
  Started: { readonly id: string };
  Queued: { readonly position: number };
  Record: { readonly record: SessionNotification };
  Requested: { readonly request: Request };
  Steered: { readonly message: Array<ContentBlock> };
  Ended: {
    readonly status: 'completed' | 'cancelled' | 'failed';
    readonly result?: PromptResponse;
    readonly error?: AntigravityError;
  };
}>;

export interface Live {
  readonly id: string;
  readonly status: 'starting' | 'running' | 'ready';
  readonly queue: number;
  readonly requests: ReadonlyArray<Request>;
  readonly cwd: string;
  readonly initialize: InitializeResponse;
  readonly modes?: SessionModeState | null;
  readonly configOptions?: Array<SessionConfigOption> | null;
  readonly commands: Array<AvailableCommand>;
  readonly update?: SessionNotification;
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
      requestId: JsonRpcId,
      answer: Answer,
    ) => Effect.Effect<void, NotLive | AntigravityError>;
    readonly cancel: (id: string) => Effect.Effect<void, NotLive>;
    readonly watch: (id: string) => Stream.Stream<Live>;
    readonly live: Effect.Effect<ReadonlyArray<Live>>;
    readonly initialize: (
      flags?: Flags,
    ) => Effect.Effect<InitializeResponse, AntigravityError>;
    readonly listSessions: (
      request?: ListSessionsRequest,
      flags?: Flags,
    ) => Effect.Effect<ListSessionsResponse, AntigravityError>;
    readonly closeSession: (
      id: string,
    ) => Effect.Effect<void, NotLive | AntigravityError>;
    readonly setConfigOption: (
      request: SetSessionConfigOptionRequest,
    ) => Effect.Effect<
      SetSessionConfigOptionResponse,
      NotLive | AntigravityError
    >;
    readonly prompt: (
      input: PromptInput,
    ) => Effect.Effect<Result, AntigravityError>;
    readonly connection: (id: string) => Effect.Effect<ClientContext, NotLive>;
  }
>()('@kestack/ai-toolkit-v2/Antigravity') {}
