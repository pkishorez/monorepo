import { Effect, Schema, Stream } from 'effect';
import { fromEffect, fromEffectEventStream, setupEffect } from '@xstate/effect';
import { Auth } from '../../auth/index.js';
import { type Checked, check } from './check.js';
import { Device, Sessions, Switching } from './services.js';
import type { Account, GateUser } from './types.js';

/** Everything the Gate knows about who is signed in, and the open Session
 * Lifetime. */
export type GateContext = {
  /** Every Signed-in Account on this device. */
  readonly accounts: ReadonlyArray<Account>;
  /** Whose Session Lifetime is open, or opening. */
  readonly account: Account | null;
  /** What the open Session Lifetime gave, from when it is ready until it
   * ends. */
  readonly session: unknown;
  /** Whether the last check failed with nobody to open without it. */
  readonly unreachable: boolean;
  /** Whether the browser-wide Account Switch to `account` is still owed. */
  readonly pending: boolean;
  /** Whether `accounts` were just checked, so the open needs no check. */
  readonly fresh: boolean;
  /** How many times in a row `account` failed to open. */
  readonly failures: number;
  /** The account last found signed out, a new value each time. */
  readonly lost: { readonly user: GateUser } | null;
};

// The context holds a live Session Lifetime, so it is typed, not parsed.
const GateContextSchema = Schema.declare(
  (value: unknown): value is GateContext =>
    typeof value === 'object' && value !== null && 'accounts' in value,
);

const events = {
  /** The app or the network came back, or another tab changed something:
   * ask who is signed in. */
  CHECK: Schema.Struct({}),
  /** An Account Switch to another Signed-in Account. */
  SWITCH: Schema.Struct({ userId: Schema.String }),
  /** Sign the Active Account out of this device. */
  SIGN_OUT: Schema.Struct({}),
  /** Sign every account out of this device. */
  SIGN_OUT_EVERYONE: Schema.Struct({}),
  /** Try again to open an account that would not open. */
  RETRY: Schema.Struct({}),
  /** The invoked Session Lifetime is open. */
  SESSION_OPENED: Schema.Struct({ session: Schema.Unknown }),
};

// Holds one account's Session Lifetime while the machine stays in the state
// that invokes it: opened on entry, announced with SESSION_OPENED, ended on
// exit.
const session = fromEffectEventStream(({ input }: { input: Account }) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const opened = yield* (yield* Sessions).open(input);
      return Stream.concat(
        Stream.make({ type: 'SESSION_OPENED' as const, session: opened }),
        Stream.never,
      );
    }),
  ),
);

const remembered = fromEffect(() =>
  Effect.gen(function* () {
    return yield* (yield* Device).lastUser;
  }),
);

const checking = fromEffect(check);

type Verify = {
  readonly account: Account;
  readonly pending: boolean;
  readonly fresh: boolean;
};

// Confirms the open account behind the screen: first the Account Switch
// still owed, then who is signed in. Null when the accounts were just
// checked.
const verifying = fromEffect(({ input }: { input: Verify }) =>
  Effect.gen(function* () {
    if (input.fresh) return null;
    if (input.pending && input.account.token !== null) {
      const switching = yield* Switching;
      yield* switching.switchTo(input.account.token);
      yield* switching.announce();
    }
    return yield* check;
  }),
);

type SignOut = {
  readonly token: string | null;
  readonly quiet: ReadonlyArray<string>;
};

// Signs one account out by its token, or every account given none. The
// check after it deletes what the device kept for them and opens whoever is
// left.
const signingOut = fromEffect(({ input }: { input: SignOut }) =>
  Effect.gen(function* () {
    const auth = yield* Auth;
    yield* input.token === null ? auth.signOutAll : auth.signOut(input.token);
    yield* (yield* Switching).announce(input.quiet);
  }),
);

// How often an open account is confirmed, besides when asked.
const RECHECK = 60_000;

const listed = (checked: Checked) =>
  checked.chosen === null || checked.chosen.token !== null;

const lostOf = (checked: Checked, current: Account | null) =>
  current !== null &&
  listed(checked) &&
  !checked.accounts.some(({ user }) => user.id === current.user.id)
    ? { user: current.user }
    : null;

/** What a check means for the machine, from wherever it ran. */
const settle = (checked: Checked, context: GateContext) => {
  const current = context.account;
  const lost = lostOf(checked, current) ?? context.lost;
  const { accounts, chosen } = checked;
  const base = {
    ...context,
    accounts,
    session: null,
    unreachable: false,
    pending: false,
    failures: 0,
    lost,
  };
  if (chosen === null) {
    return {
      target: '#gate.signedOut',
      context: { ...base, account: null, fresh: false },
    };
  }
  if (current !== null && chosen.user.id === current.user.id) return null;
  return {
    target: '#gate.open',
    reenter: true,
    context: { ...base, account: chosen, fresh: true },
  };
};

// Leaving the open account: another account, or nobody.
type Leave = { readonly context: GateContext };

const leaving = {
  SWITCH: ({
    context,
    event,
  }: Leave & { readonly event: { readonly userId: string } }) => {
    const to = context.accounts.find(({ user }) => user.id === event.userId);
    if (to === undefined || to.user.id === context.account?.user.id) return;
    return {
      target: '#gate.open',
      reenter: true,
      context: {
        ...context,
        account: to,
        session: null,
        pending: true,
        fresh: false,
        failures: 0,
      },
    };
  },
  SIGN_OUT: ({ context }: Leave) => {
    if (context.account?.token == null) return;
    return {
      target: '#gate.signingOut',
      context: { ...context, session: null },
    };
  },
  SIGN_OUT_EVERYONE: ({ context }: Leave) => ({
    target: '#gate.signingOut',
    context: { ...context, account: null, session: null },
  }),
};

const initialContext = (): GateContext => ({
  accounts: [],
  account: null,
  session: null,
  unreachable: false,
  pending: false,
  fresh: false,
  failures: 0,
  lost: null,
});

/**
 * The Gate's lifecycle on one Backend. An account the device remembers opens
 * first and is confirmed behind it (Open First); with nobody remembered it
 * finds who is signed in. It holds the Active Account's Session Lifetime
 * open until an Account Switch, a sign-out, or the account turning out to
 * be signed out (Account Lost). Leaving `open` ends the Session Lifetime, so
 * nothing of one account outlives its state.
 */
export const gateMachine = setupEffect({
  schemas: { context: GateContextSchema, events },
  actors: { session, remembered, checking, verifying, signingOut },
}).createMachine({
  id: 'gate',
  context: initialContext,
  initial: 'starting',
  states: {
    starting: {
      invoke: {
        src: 'remembered',
        onDone: ({ context, event }) => {
          const user = event.output as GateUser | null;
          if (user === null) return { target: 'checking' };
          const account = { user, token: null, active: true };
          return {
            target: 'open',
            context: { ...context, accounts: [account], account },
          };
        },
        onError: { target: 'checking' },
      },
    },
    checking: {
      invoke: {
        src: 'checking',
        onDone: ({ context, event }) =>
          settle(event.output as Checked, context) ?? undefined,
        onError: ({ context }) => ({
          target: 'signedOut',
          context: { ...context, unreachable: true },
        }),
      },
    },
    signedOut: {
      on: { CHECK: { target: 'checking' } },
    },
    signingOut: {
      invoke: {
        src: 'signingOut',
        input: ({ context }): SignOut =>
          context.account === null
            ? {
                token: null,
                quiet: context.accounts.map(({ user }) => user.id),
              }
            : {
                token: context.account.token,
                quiet: [context.account.user.id],
              },
        onDone: ({ context }) => ({
          target: 'checking',
          context: { ...context, account: null },
        }),
        onError: { target: 'checking' },
      },
    },
    unopenable: {
      on: {
        RETRY: ({ context }) => ({
          target: 'open',
          context: { ...context, failures: 0 },
        }),
        SIGN_OUT: ({ context }) => {
          if (context.account?.token == null) return;
          return { target: 'signingOut' };
        },
      },
    },
    open: {
      invoke: {
        src: 'session',
        input: ({ context }) => context.account as Account,
        onError: ({ context }) =>
          context.failures + 1 >= 2
            ? {
                target: 'unopenable',
                context: { ...context, session: null, failures: 0 },
              }
            : {
                target: '#gate.open',
                reenter: true,
                context: {
                  ...context,
                  session: null,
                  failures: context.failures + 1,
                },
              },
      },
      on: leaving,
      initial: 'opening',
      states: {
        opening: {
          on: {
            SESSION_OPENED: ({ context, event }) => ({
              target: 'ready',
              context: { ...context, session: event.session },
            }),
          },
        },
        ready: {
          initial: 'verifying',
          states: {
            idle: {
              after: { [RECHECK]: { target: 'verifying' } },
              on: { CHECK: { target: 'verifying' } },
            },
            verifying: {
              invoke: {
                src: 'verifying',
                input: ({ context }): Verify => ({
                  account: context.account as Account,
                  pending: context.pending,
                  fresh: context.fresh,
                }),
                onDone: ({ context, event }) => {
                  const checked = event.output as Checked | null;
                  // Just checked, or only the remembered account came back
                  // because the Backend was not reached: nothing new.
                  if (checked === null || !listed(checked))
                    return {
                      target: 'idle',
                      context: { ...context, fresh: false },
                    };
                  const moved = settle(checked, context);
                  if (moved !== null) return moved;
                  return {
                    target: 'idle',
                    context: {
                      ...context,
                      fresh: false,
                      pending: false,
                      accounts: checked.accounts,
                      account: checked.chosen,
                    },
                  };
                },
                onError: { target: 'idle' },
              },
            },
          },
        },
      },
    },
  },
});
