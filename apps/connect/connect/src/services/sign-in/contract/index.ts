import { Context, Data, type Effect, type Layer } from 'effect';

export interface User {
  readonly id: string;
  readonly email: string;
}

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
