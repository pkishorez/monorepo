import { Context, Data, type Effect, type Layer } from 'effect';

export class SignInFailed extends Data.TaggedError('SignInFailed')<{
  readonly message: string;
}> {}

export class SignIn extends Context.Service<
  SignIn,
  {
    readonly saved: Effect.Effect<User | null, SignInFailed>;
    readonly signIn: Effect.Effect<User, SignInFailed>;
    readonly signInAgain: Effect.Effect<User, SignInFailed>;
    readonly signOut: Effect.Effect<void>;
    readonly signing: Layer.Layer<unknown>;
  }
>()('Connect/service/SignIn') {}

export interface User {
  readonly id: string;
  readonly email: string;
}
