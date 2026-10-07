import { Context, type Effect, type Scope } from 'effect';
import type { Account, GateUser } from './types.js';

/** What the device remembers about one Backend: its Remembered Accounts,
 * with no tokens, and the account found lost, if one is. */
export type Remembered = {
  readonly accounts: ReadonlyArray<Account>;
  readonly lost: GateUser | null;
};

/** What this device keeps for one Backend. */
export class Device extends Context.Service<
  Device,
  {
    readonly remembered: Effect.Effect<Remembered>;
    readonly remember: (remembered: Remembered) => Effect.Effect<void>;
    /** Whether this device signed `userId` out itself, in this tab or
     * another; asking forgets it. */
    readonly signedOutHere: (userId: string) => Effect.Effect<boolean>;
    /** Keeps what the device holds for these accounts and deletes the
     * rest. */
    readonly keep: (userIds: ReadonlyArray<string>) => Effect.Effect<void>;
  }
>()('@kstackz/auth-toolkit/gate/Device') {}

/** Opens Session Lifetimes; each ends with its scope. */
export class Sessions extends Context.Service<
  Sessions,
  {
    readonly open: (
      account: Account,
    ) => Effect.Effect<unknown, never, Scope.Scope>;
  }
>()('@kstackz/auth-toolkit/gate/Sessions') {}

/** The browser-wide Account Switch, one at a time, the last one asked for
 * winning; and telling the device's other tabs what changed. */
export class Switching extends Context.Service<
  Switching,
  {
    readonly switchTo: (token: string) => Effect.Effect<void, unknown>;
    /** Tells the other tabs to look again; `quiet` are accounts this tab
     * signed out, so they are not reported lost there. */
    readonly announce: (quiet?: ReadonlyArray<string>) => Effect.Effect<void>;
  }
>()('@kstackz/auth-toolkit/gate/Switching') {}
