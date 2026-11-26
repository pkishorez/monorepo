import { Context, Data, type Duration, type Effect, type Scope } from 'effect';

export class LockTimeout extends Data.TaggedError('LockTimeout')<{
  readonly path: string;
  readonly message: string;
}> {}

export class Locks extends Context.Service<
  Locks,
  {
    readonly tryHold: (
      path: string,
    ) => Effect.Effect<boolean, Error, Scope.Scope>;
    readonly hold: (
      path: string,
      timeout: Duration.Input,
    ) => Effect.Effect<void, LockTimeout | Error, Scope.Scope>;
  }
>()('Connect/service/Locks') {}
