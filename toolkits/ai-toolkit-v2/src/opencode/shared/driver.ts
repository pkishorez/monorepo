import { Context, type Effect, type Scope, type Stream } from 'effect';
import type { OpenCodeError } from '../contract/index.js';
import type {
  Answer,
  Client,
  Event,
  ForkOptions,
  Methods,
  Prompt,
  SessionID,
  SessionInfo,
  SessionOptions,
  UserMessage,
} from '../contract/index.js';

export type Delivery = 'steer' | 'queue';

export interface DriverShape {
  readonly create: (
    options: SessionOptions,
  ) => Effect.Effect<SessionInfo, OpenCodeError>;
  readonly fork: (
    options: ForkOptions,
  ) => Effect.Effect<SessionInfo, OpenCodeError>;
  readonly events: (
    id: SessionID,
  ) => Effect.Effect<
    Stream.Stream<Event, OpenCodeError>,
    OpenCodeError,
    Scope.Scope
  >;
  readonly prompt: (
    id: SessionID,
    prompt: Prompt,
    delivery?: Delivery,
  ) => Effect.Effect<UserMessage, OpenCodeError>;
  readonly interrupt: (id: SessionID) => Effect.Effect<void, OpenCodeError>;
  readonly reply: (
    id: SessionID,
    requestId: string,
    answer: Answer,
  ) => Effect.Effect<void, OpenCodeError>;
  readonly methods: Methods;
  readonly client: Effect.Effect<Client, OpenCodeError>;
}

export class Driver extends Context.Service<Driver, DriverShape>()(
  '@kestack/ai-toolkit-v2/OpenCode/Driver',
) {}

const field = (value: unknown, key: string): unknown =>
  typeof value === 'object' && value !== null
    ? Reflect.get(value, key)
    : undefined;

export const sessionOf = (event: Event): unknown =>
  event.type === 'form.created'
    ? field(field(event.data, 'form'), 'sessionID')
    : field(field(event, 'data'), 'sessionID');
