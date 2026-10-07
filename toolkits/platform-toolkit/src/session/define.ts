import { Context, type Effect, Schema, type Scope } from 'effect';
import type { SubscriptionRef } from 'effect';
import type { Account } from '@kstackz/auth-toolkit/client';
import type { ApiClients, Apis } from '../apis/index.js';
import type { StdSync } from './open.js';
import { useOpened, useOpenedStatus } from './react.js';
import type { SessionStatus } from './status.js';

/** What the Platform gives a Session to be built from: the app's APIs
 * signed as the Account, the user's Std Sync, the Account, and the Session
 * Status. */
export interface SessionContext<A extends Apis> {
  /** Whose Session it is. */
  readonly account: Account;
  /** Every API, each call signed with the Account's token. A call still on
   * its way when the Session closes is interrupted. */
  readonly apis: ApiClients<A>;
  /** A Std Sync named for the user, kept where the Backend keeps it: on the
   * device for the cloud Backend, in memory for the device Backend. Make
   * its collections; it is disposed with the Session. */
  readonly sync: StdSync;
  /** Whether the Account has been confirmed since the Session opened. */
  readonly status: SubscriptionRef.SubscriptionRef<SessionStatus>;
}

/** A Session was closed, by an Account Switch, a sign-out or a change of
 * Backend, while something of it still ran. */
export class SessionClosed extends Schema.Error<SessionClosed>(
  '@kstackz/platform-toolkit/SessionClosed',
)({ _tag: Schema.tag('SessionClosed') }) {}

/** Who is open, for Effect code: `yield* session.Service`. */
export interface SessionOf<S> {
  readonly '@kstackz/platform-toolkit/Session': S;
}

/** Runs an Effect in the open Session, with its Service provided. Rejects
 * with its failure, or with SessionClosed if the Session closed first. */
export type Run<S> = <X, E>(
  effect: Effect.Effect<X, E, SessionOf<S>>,
) => Promise<X>;

/**
 * An app's Session, written once over its APIs: what one Account keeps
 * while it is active. Give it to `createApp` as `auth.session`; everything
 * else comes out of it. `Service` reaches it from Effect code, and `use`,
 * `useRun`, `useStatus` and `useApi` from any screen under `SignedIn`.
 */
export const defineSession = <A extends Apis, S>(
  apis: A,
  open: (context: SessionContext<A>) => Effect.Effect<S, never, Scope.Scope>,
) => {
  const Service = Context.Service<SessionOf<S>, S>(
    '@kstackz/platform-toolkit/Session',
  );
  return {
    apis,
    open,
    Service,
    /** The open Session's value. */
    use: (): S => useOpened().value as S,
    /** Runs an Effect in the open Session. */
    useRun: (): Run<S> => useOpened().run as Run<S>,
    /** Whether the open Account has been confirmed, live. */
    useStatus: useOpenedStatus,
    /** One API's client, signed as the open Account. */
    useApi: <K extends keyof A & string>(name: K): ApiClients<A>[K] =>
      useOpened().apis[name] as ApiClients<A>[K],
  };
};

/** A Session, as `defineSession` makes it. */
export type SessionDef<A extends Apis, S> = ReturnType<
  typeof defineSession<A, S>
>;
