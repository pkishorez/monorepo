import { Context, type Effect, Schema, type Scope } from 'effect';
import type { Switching } from '../../../domain/settings/index.ts';
import type { Session, User } from '../session/index.ts';

/** A User signed in on this device, with the token their requests carry. */
export type SignedIn = {
  readonly user: User;
  /** Null when the User is remembered from before, offline. */
  readonly token: string | null;
  /** Whether the browser's cookie names this User. */
  readonly active: boolean;
};

/** The sign-in service could not be reached. */
export class Unreachable extends Schema.Error<Unreachable>(
  'kstack/Unreachable',
)({ _tag: Schema.tag('Unreachable') }) {}

/** The shared sign-in service, as Ledger uses it. */
export class SignInService extends Context.Service<
  SignInService,
  {
    /** Every User signed in on this device. */
    readonly signedIn: Effect.Effect<ReadonlyArray<SignedIn>, Unreachable>;
    /** Makes a User the browser's active one, for every tab. */
    readonly makeActive: (token: string) => Effect.Effect<void, Unreachable>;
    /** Signs one User out of this browser. */
    readonly signOut: (token: string) => Effect.Effect<void, Unreachable>;
    /** Signs every User out of this browser. */
    readonly signOutEveryone: Effect.Effect<void, Unreachable>;
  }
>()('kstack/SignInService') {}

/** What this device and tab remember, and the copies they keep. */
export class Device extends Context.Service<
  Device,
  {
    readonly switching: Effect.Effect<Switching>;
    /** The User this tab was last on. */
    readonly tabUser: Effect.Effect<string | null>;
    readonly setTabUser: (userId: string) => Effect.Effect<void>;
    /** The User last opened on this device, to open offline. */
    readonly lastUser: Effect.Effect<User | null>;
    readonly setLastUser: (user: User | null) => Effect.Effect<void>;
    /** Keeps these Users' copies and deletes every other. */
    readonly keepCopies: (
      userIds: ReadonlyArray<string>,
    ) => Effect.Effect<void>;
  }
>()('kstack/Device') {}

/** Opens Sessions; each closes with its scope. */
export class Sessions extends Context.Service<
  Sessions,
  {
    readonly open: (
      user: User,
      token: string | null,
    ) => Effect.Effect<Session, never, Scope.Scope>;
  }
>()('kstack/Sessions') {}
