import { Effect, Schema, Stream } from 'effect';
import { Accounts } from '@kstackz/auth-toolkit/clients/accounts';
import { fromEffect, fromEffectEventStream, setupEffect } from '@xstate/effect';
import type { Session } from '../session/index.ts';
import { type Checked, check, switchTo } from './check.ts';
import { Sessions, type SignedIn } from './services.ts';

/** Everything Ledger knows about who is signed in, and the open Session. */
export type AppContext = {
  /** Every User signed in on this device. */
  readonly signedIn: ReadonlyArray<SignedIn>;
  /** Whose Session is open, or opening. */
  readonly user: SignedIn | null;
  /** The open Session, from when it is ready until it closes. */
  readonly session: Session | null;
  /** Whether the last check failed with nobody to open offline. */
  readonly unreachable: boolean;
};

// A Session is a live object, so it is only checked to be one.
const SessionSchema = Schema.declare(
  (value: unknown): value is Session =>
    typeof value === 'object' && value !== null && 'setToken' in value,
);

// The context holds a live Session, so it is typed, not parsed.
const AppContextSchema = Schema.declare(
  (value: unknown): value is AppContext =>
    typeof value === 'object' && value !== null && 'signedIn' in value,
);

const events = {
  /** The tab came back, or the network did: ask who is signed in. */
  CHECK: Schema.Struct({}),
  /** Open another signed-in User's Session. */
  SWITCH: Schema.Struct({ userId: Schema.String }),
  /** Sign the open User out of this device. */
  SIGN_OUT: Schema.Struct({}),
  /** Sign every User out of this browser. */
  SIGN_OUT_EVERYONE: Schema.Struct({}),
  /** The invoked Session is open. */
  SESSION_OPENED: Schema.Struct({ session: SessionSchema }),
};

// Holds one User's Session while the machine stays in the state that invokes
// it: opened on entry, announced with SESSION_OPENED, closed on exit.
const session = fromEffectEventStream(({ input }: { input: SignedIn }) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const opened = yield* (yield* Sessions).open(input.user, input.token);
      return Stream.concat(
        Stream.make({ type: 'SESSION_OPENED' as const, session: opened }),
        Stream.never,
      );
    }),
  ),
);

const checking = fromEffect(check);

const switching = fromEffect(({ input }: { input: SignedIn }) =>
  switchTo(input),
);

// Signs one User out by their token, or every User given none. The check
// after it deletes their copies and opens whoever is left.
const signingOut = fromEffect(({ input }: { input: string | null }) =>
  Effect.gen(function* () {
    const accounts = yield* Accounts;
    yield* input === null ? accounts.signOutAll : accounts.signOut(input);
  }),
);

// How often an open Session asks who is signed in, besides on focus.
const RECHECK = 60_000;

/** What a check means for the machine, from wherever it ran. */
const settle = (checked: Checked, current: SignedIn | null) => {
  const { signedIn, chosen } = checked;
  if (chosen === null) {
    return {
      target: '#app.signedOut',
      context: { signedIn, user: null, session: null, unreachable: false },
    };
  }
  if (current !== null && chosen.user.id === current.user.id) return null;
  return {
    target: '#app.open',
    reenter: true,
    context: { signedIn, user: chosen, session: null, unreachable: false },
  };
};

/**
 * Ledger's lifecycle: find who is signed in, then hold the chosen User's
 * Session open until another User is chosen, the User signs out, or nobody
 * is signed in. Leaving `open` closes the Session, so nothing of one User
 * outlives their state; signing out leaves it before their copy is deleted.
 */
export const appMachine = setupEffect({
  schemas: { context: AppContextSchema, events },
  actors: { session, checking, switching, signingOut },
}).createMachine({
  id: 'app',
  context: (): AppContext => ({
    signedIn: [],
    user: null,
    session: null,
    unreachable: false,
  }),
  initial: 'checking',
  states: {
    checking: {
      invoke: {
        src: 'checking',
        onDone: ({ event }) =>
          settle(event.output as Checked, null) ?? undefined,
        onError: ({ context }) => ({
          target: 'signedOut',
          context: { ...context, unreachable: true },
        }),
      },
    },
    signedOut: {
      on: { CHECK: { target: 'checking' } },
    },
    switching: {
      invoke: {
        src: 'switching',
        input: ({ context }) => context.user as SignedIn,
        onDone: ({ context }) => ({ target: 'open', context }),
        onError: { target: 'checking' },
      },
    },
    signingOut: {
      invoke: {
        src: 'signingOut',
        // Signing everyone out first forgets who is open.
        input: ({ context }) => context.user?.token ?? null,
        onDone: { target: 'checking' },
        onError: { target: 'checking' },
      },
    },
    open: {
      invoke: {
        src: 'session',
        input: ({ context }) => context.user as SignedIn,
        onError: { target: 'checking' },
      },
      on: {
        SWITCH: ({ context, event }) => {
          const to = context.signedIn.find(
            ({ user }) => user.id === event.userId,
          );
          if (to === undefined || to.user.id === context.user?.user.id) return;
          return {
            target: 'switching',
            context: { ...context, user: to, session: null },
          };
        },
        SIGN_OUT: ({ context }) => {
          if (context.user?.token == null) return;
          return {
            target: 'signingOut',
            context: { ...context, session: null },
          };
        },
        SIGN_OUT_EVERYONE: ({ context }) => ({
          target: 'signingOut',
          context: { ...context, user: null, session: null },
        }),
      },
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
          initial: 'idle',
          states: {
            idle: {
              after: { [RECHECK]: { target: 'verifying' } },
              on: { CHECK: { target: 'verifying' } },
            },
            verifying: {
              invoke: {
                src: 'checking',
                onDone: ({ context, event }, enq) => {
                  const checked = event.output as Checked;
                  const moved = settle(checked, context.user);
                  if (moved !== null) return moved;
                  const token = checked.chosen?.token ?? null;
                  if (token !== null && context.session !== null) {
                    enq(context.session.setToken, token);
                  }
                  return {
                    target: 'idle',
                    context: {
                      ...context,
                      signedIn: checked.signedIn,
                      user: checked.chosen,
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
