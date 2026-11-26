import type { OpenCodeEvent, OpenCode as Sdk } from '@opencode/sdk/effect';
import type { Data, Effect } from 'effect';
import type { OpenCodeError } from './errors.js';

export type Client = Sdk.Interface;

export type HostOptions = Sdk.CreateOptions;

type SessionApi = Client['session'];

type PromptInput = Parameters<SessionApi['prompt']>[0];

export type Event = OpenCodeEvent;

export type SessionID = Extract<
  Event,
  { readonly type: 'session.created' }
>['data']['sessionID'];

export type SessionInfo = Effect.Success<ReturnType<SessionApi['create']>> & {
  readonly id: SessionID;
};

export type SessionOptions = NonNullable<Parameters<SessionApi['create']>[0]>;

export type Prompt = Omit<PromptInput, 'sessionID' | 'delivery'> & {
  readonly text: string;
};

export type UserMessage = Effect.Success<ReturnType<SessionApi['prompt']>> & {
  readonly id: string;
};

export type PermissionAsked = Extract<
  Event,
  { readonly type: 'permission.asked' }
>;

export type FormCreated = Extract<Event, { readonly type: 'form.created' }>;

export type Request = PermissionAsked | FormCreated;

export type PermissionAnswer = Omit<
  Parameters<Client['permission']['reply']>[0],
  'sessionID' | 'requestID'
>;

export type FormAnswer = Omit<
  Parameters<SessionApi['form']['reply']>[0],
  'sessionID' | 'formID'
>;

export type Answer = PermissionAnswer | FormAnswer;

export interface CreateInput {
  readonly session?: SessionOptions;
  readonly prompt: Prompt;
}

export type ForkOptions = Parameters<SessionApi['fork']>[0] & {
  readonly sessionID: SessionID;
};

export type ForkInput = ForkOptions & { readonly prompt: Prompt };

export type Mode = 'queue' | 'steer';

export interface SendInput {
  readonly sessionID: SessionID;
  readonly prompt: Prompt;
  readonly mode?: Mode;
}

export type Status = 'completed' | 'cancelled' | 'failed';

export type Out = Data.TaggedEnum<{
  Started: { readonly id: SessionID };
  Queued: { readonly position: number };
  Record: { readonly record: Event };
  Requested: { readonly request: Request };
  Steered: { readonly message: UserMessage };
  Ended: { readonly status: Status; readonly error?: string };
}>;

export interface Live {
  readonly id: SessionID;
  readonly status: 'running' | 'ready';
  readonly queue: number;
  readonly requests: ReadonlyArray<Request>;
}

type Lift<F> = F extends (
  ...args: infer A
) => Effect.Effect<infer R, unknown, unknown>
  ? (...args: A) => Effect.Effect<R, OpenCodeError>
  : never;

export interface Methods {
  readonly sessions: Lift<SessionApi['list']>;
  readonly session: Lift<SessionApi['get']>;
  readonly messages: Lift<Client['message']['list']>;
  readonly message: Lift<SessionApi['message']['get']>;
  readonly context: Lift<SessionApi['context']>;
  readonly diff: Lift<SessionApi['diff']>;
  readonly compact: Lift<SessionApi['compact']>;
  readonly revert: Lift<SessionApi['revert']['stage']>;
  readonly unrevert: Lift<SessionApi['revert']['clear']>;
  readonly commitRevert: Lift<SessionApi['revert']['commit']>;
  readonly update: Lift<SessionApi['update']>;
  readonly remove: Lift<SessionApi['remove']>;
  readonly switchModel: Lift<SessionApi['switchModel']>;
  readonly switchAgent: Lift<SessionApi['switchAgent']>;
  readonly permissions: Lift<Client['permission']['list']>;
  readonly forms: Lift<SessionApi['form']['list']>;
  readonly providers: Lift<Client['provider']['list']>;
  readonly models: Lift<Client['model']['list']>;
  readonly defaultModel: Lift<Client['model']['default']>;
  readonly agents: Lift<Client['agent']['list']>;
  readonly commands: Lift<Client['command']['list']>;
  readonly skills: Lift<Client['skill']['list']>;
  readonly config: Lift<Client['config']['get']>;
  readonly mcp: Lift<Client['mcp']['list']>;
  readonly usageLimits: Lift<Client['usage']['limits']>;
}
