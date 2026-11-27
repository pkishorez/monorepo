import { Context, type Effect, type Scope, type Stream } from 'effect';
import type {
  Answer,
  CodexError,
  Method,
  Params,
  RequestId,
  Result,
  ServerNotification,
  ServerRequest,
} from '../contract/index.ts';

export type Message = ServerNotification | ServerRequest;

export interface Connection {
  readonly request: <M extends Method>(
    method: M,
    params: Params<M>,
  ) => Effect.Effect<Result<M>, CodexError>;
  readonly respond: (id: RequestId, answer: Answer) => Effect.Effect<void>;
  readonly messages: Stream.Stream<Message, CodexError>;
}

export class Driver extends Context.Service<
  Driver,
  {
    readonly start: (
      cwd: string | undefined,
    ) => Effect.Effect<Connection, CodexError, Scope.Scope>;
  }
>()('@kestack/ai-toolkit-v2/Codex/Driver') {}
