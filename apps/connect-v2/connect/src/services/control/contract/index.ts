import { Context, type Effect, type Scope } from 'effect';
import type { RunningConnection } from '../../../server/rpc/control/contract/index.js';

export interface Answers {
  readonly status: Effect.Effect<RunningConnection>;
  readonly stop: Effect.Effect<void>;
}

export class Control extends Context.Service<
  Control,
  {
    readonly answer: (
      answers: Answers,
    ) => Effect.Effect<void, never, Scope.Scope>;
  }
>()('Connect/service/Control') {}
