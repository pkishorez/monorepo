import { Context, type Effect, Schema, type Scope } from 'effect';
import type { Session, User } from '../session/index.ts';

/** A User signed in to the Backend, with the token their calls carry. */
export type SignedIn = {
  readonly user: User;
  /** Null when the User is remembered from before, offline. */
  readonly token: string | null;
  /** Whether theirs is the Active Session. */
  readonly active: boolean;
};

/** The Backend could not be reached, and nobody was opened here before to
 * open offline. */
export class Unreachable extends Schema.Error<Unreachable>(
  'kstack/Unreachable',
)({ _tag: Schema.tag('Unreachable') }) {}

/** What this device remembers of the Backend, and the copies it keeps. */
export class Device extends Context.Service<
  Device,
  {
    /** The User last opened on this device, to open offline. */
    readonly lastUser: Effect.Effect<User | null>;
    readonly setLastUser: (user: User | null) => Effect.Effect<void>;
    /** Keeps these Users' copies and deletes every other. */
    readonly keepCopies: (
      userIds: ReadonlyArray<string>,
    ) => Effect.Effect<void>;
  }
>()('kstack/Device') {}

/** Opens Sessions on the Backend; each closes with its scope. */
export class Sessions extends Context.Service<
  Sessions,
  {
    readonly open: (
      user: User,
      token: string | null,
    ) => Effect.Effect<Session, never, Scope.Scope>;
  }
>()('kstack/Sessions') {}
