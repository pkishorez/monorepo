import { Context, type Effect, type Stream } from 'effect';
import type { NotLive, OpenCodeError } from './errors.js';
import type {
  Answer,
  Client,
  CreateInput,
  ForkInput,
  Live,
  Methods,
  Out,
  SendInput,
  SessionID,
} from './types.js';

export interface OpenCodeService extends Methods {
  readonly create: (input: CreateInput) => Stream.Stream<Out, OpenCodeError>;
  readonly fork: (input: ForkInput) => Stream.Stream<Out, OpenCodeError>;
  readonly send: (input: SendInput) => Stream.Stream<Out, OpenCodeError>;
  readonly respond: (
    id: SessionID,
    requestId: string,
    answer: Answer,
  ) => Effect.Effect<void, NotLive | OpenCodeError>;
  readonly cancel: (
    id: SessionID,
  ) => Effect.Effect<void, NotLive | OpenCodeError>;
  readonly watch: (id: SessionID) => Stream.Stream<Live>;
  readonly live: Effect.Effect<ReadonlyArray<Live>>;
  readonly client: Effect.Effect<Client, OpenCodeError>;
}

export class OpenCode extends Context.Service<OpenCode, OpenCodeService>()(
  '@kestack/ai-toolkit-v2/OpenCode',
) {}
