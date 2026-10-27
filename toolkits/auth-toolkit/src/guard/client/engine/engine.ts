import { Effect, Option, type Scope, Semaphore, SubscriptionRef } from 'effect';
import {
  type Account,
  Accounts,
  type AccountsError,
  AccountsState,
  type SignInOptions,
} from '../accounts/index.js';
import { isTestEmail } from '../../../contract/index.js';
import { acting } from './acting.js';
import { signing } from './signing.js';
import {
  AccountSchema,
  type Snapshot,
  SnapshotSchema,
  type SourceAccount,
} from './snapshot.js';
import { watchTabs } from './tabs.js';

export {
  AccountSchema,
  acting,
  signing,
  type Snapshot,
  SnapshotSchema,
  type SourceAccount,
  watchTabs,
};

/** Where the Accounts really live: the Auth Worker, a Sign-in Store, or the
 * fake's table. Every action answers who is signed in after it. */
export interface Source {
  readonly read: Effect.Effect<Snapshot, AccountsError>;
  readonly signIn: (
    options: SignInOptions,
    state: AccountsState,
  ) => Effect.Effect<Snapshot, AccountsError>;
  readonly switchTo: (userId: string) => Effect.Effect<Snapshot, AccountsError>;
  readonly signOut: (userId: string) => Effect.Effect<Snapshot, AccountsError>;
  readonly signOutAll: Effect.Effect<Snapshot, AccountsError>;
}

export interface MakeOptions {
  readonly source: Source;
  /** What this client last knew, if anything. */
  readonly last: Snapshot | null;
  /** Start `Checking` and check at once, rather than trust `last`. */
  readonly checkOnStart: boolean;
  /** Remembers the last Snapshot signed in, for `last` on the next start,
   * in the order the state takes them: each one with an Active Account,
   * and a signed-out one only to forget it, on a sign-out asked here or an
   * answer that ends `Checking` (see `remembers`). */
  readonly keep?: (snapshot: Snapshot) => Effect.Effect<void>;
  /** Joins others sharing these Accounts (other tabs): they may ask to
   * check, or hand over a Snapshot they saw, and are told of each new one. */
  readonly connect?: (
    peers: Peers,
  ) => Effect.Effect<Connection, never, Scope.Scope>;
}

export interface Peers {
  readonly check: Effect.Effect<void>;
  readonly apply: (snapshot: Snapshot) => Effect.Effect<void>;
}

export interface Connection {
  readonly announce: (snapshot: Snapshot) => Effect.Effect<void>;
}

const alone: Connection = { announce: () => Effect.void };

export const signedOut: Snapshot = { active: null, accounts: [] };

const accountOf = ({ id, email, name, image }: SourceAccount): Account => ({
  id,
  email,
  name,
  image,
  test: isTestEmail(email),
});

const stateOf = (snapshot: Snapshot): AccountsState => {
  const accounts = snapshot.accounts.map(accountOf);
  const account = accounts.find(({ id }) => id === snapshot.active);
  return account
    ? AccountsState.SignedIn({ active: account, accounts })
    : AccountsState.SignedOut();
};

const activeOf = (snapshot: Snapshot | null) => {
  const account = snapshot?.accounts.find(({ id }) => id === snapshot.active);
  return account && accountOf(account);
};

/** Whether `keep` is handed `snapshot`, as the state takes it from
 * `before`: always one with an Active Account; a signed-out one only on a
 * sign-out `asked` here, or as the answer to the check made while the last
 * one signed in was shown (`Checking`). Any other signed-out answer, such
 * as an Auth Worker answering signed out for a moment as it restarts, or a
 * peer's, leaves the last one signed in remembered, so the next start
 * shows it while it checks, and that check corrects it. */
const remembers = (snapshot: Snapshot, before: AccountsState, asked: boolean) =>
  activeOf(snapshot) !== undefined || asked || before._tag === 'Checking';

/** The `Accounts` service over a Source: its state, kept as each action
 * answers and told to its peers when it changes, and `settle`, which checks
 * only while the state is still `Checking` so concurrent callers ask
 * once.
 *
 * What changes the state runs one at a time (checks, actions, a peer's
 * Snapshot), so an answer never lands over one that came after it. A
 * sign-in, which may wait on the User for minutes, runs alone and commits
 * its answer only if nothing was committed since: what was is newer.
 *
 * An Account Switch shows at once as `switchingTo`, before it waits its
 * turn, and goes once it is answered: the new Active Account, or on failure
 * the state as it was. A newer switch replaces it: one not sent yet is
 * never sent, and succeeds, and the newest is shown until it is answered.
 * A peer's Snapshot that arrives during
 * a switch may be older than the switch's answer or newer, so once the
 * switch is done it checks instead. */
export const makeAccounts = ({
  source,
  last,
  checkOnStart,
  keep = () => Effect.void,
  connect = () => Effect.succeed(alone),
}: MakeOptions) =>
  Effect.gen(function* () {
    const lastActive = activeOf(last);
    const ref = yield* SubscriptionRef.make<AccountsState>(
      checkOnStart
        ? AccountsState.Checking(lastActive ? { last: lastActive } : {})
        : stateOf(last ?? signedOut),
    );
    let known = last === null ? null : JSON.stringify(last);
    // The newest Account Switch asked for, until it is answered.
    let latest: { readonly userId: string } | null = null;
    // How many Account Switches have been asked for and not ended, newest
    // or not: while any has, a peer's Snapshot is checked, not trusted.
    let running = 0;
    // How many Snapshots the state has taken.
    let commits = 0;
    const lock = yield* Semaphore.make(1);
    const serially = lock.withPermit;

    /** `state` with the Account Switch under way, when its Account is
     * signed in here and not active already. */
    const switching = (state: AccountsState): AccountsState => {
      if (state._tag !== 'SignedIn') return state;
      const { active, accounts } = state;
      const userId = latest?.userId;
      const to = accounts.find(({ id }) => id === userId && id !== active.id);
      return to
        ? AccountsState.SignedIn({ active, accounts, switchingTo: to })
        : AccountsState.SignedIn({ active, accounts });
    };
    const switchingId = (state: AccountsState) =>
      state._tag === 'SignedIn' ? state.switchingTo?.id : undefined;
    // Shows the switch under way, when that changes what is shown.
    const reshow = SubscriptionRef.updateSome(ref, (state) => {
      const next = switching(state);
      return switchingId(next) === switchingId(state)
        ? Option.none()
        : Option.some(next);
    });

    // Kept before it is shown, so whoever sees the state can rely on it.
    const apply = (snapshot: Snapshot, asked = false) =>
      SubscriptionRef.get(ref).pipe(
        Effect.flatMap((before) =>
          remembers(snapshot, before, asked) ? keep(snapshot) : Effect.void,
        ),
        Effect.andThen(
          Effect.sync(() => {
            known = JSON.stringify(snapshot);
            commits++;
          }),
        ),
        Effect.andThen(
          SubscriptionRef.setAndGet(ref, switching(stateOf(snapshot))),
        ),
      );

    const { announce } = yield* connect({
      check: Effect.suspend(() => Effect.ignore(check)),
      apply: (snapshot) => {
        const duringSwitch = running > 0;
        return serially(
          Effect.asVoid(
            duringSwitch
              ? Effect.flatMap(source.read, commit).pipe(
                  Effect.catch(() => apply(snapshot)),
                )
              : apply(snapshot),
          ),
        );
      },
    });

    // Runs with the lock held. `asked`: a sign-out asked here.
    const commit = (
      snapshot: Snapshot,
      asked = false,
    ): Effect.Effect<AccountsState> =>
      Effect.suspend(() => {
        const changed = JSON.stringify(snapshot) !== known;
        return apply(snapshot, asked).pipe(
          Effect.tap(() => (changed ? announce(snapshot) : Effect.void)),
        );
      });

    const current = SubscriptionRef.get(ref);
    const committed = <E>(answer: Effect.Effect<Snapshot, E>) =>
      serially(Effect.flatMap(answer, commit));
    const check: Effect.Effect<AccountsState, AccountsError> = committed(
      source.read,
    );
    const settle = serially(
      Effect.flatMap(current, (state) =>
        state._tag === 'Checking'
          ? Effect.flatMap(source.read, commit)
          : Effect.succeed(state),
      ),
    );

    if (checkOnStart) yield* Effect.forkScoped(Effect.ignore(settle));

    const accounts = Accounts.of({
      state: SubscriptionRef.changes(ref),
      current,
      check,
      signIn: (options = {}) =>
        current.pipe(
          Effect.flatMap((state) => source.signIn(options, state)),
          Effect.flatMap((snapshot) => {
            const seen = commits;
            return serially(
              Effect.suspend(() =>
                commits === seen ? commit(snapshot) : current,
              ),
            );
          }),
          Effect.asVoid,
        ),
      switchTo: (userId) =>
        Effect.suspend(() => {
          const asked = { userId };
          const done = Effect.sync(() => {
            if (latest === asked) latest = null;
          });
          latest = asked;
          running++;
          return reshow.pipe(
            Effect.andThen(
              serially(
                Effect.suspend(() =>
                  // Replaced by a newer switch before its turn: never sent.
                  latest !== asked
                    ? Effect.void
                    : source.switchTo(userId).pipe(
                        // Answered: what is committed shows the switch done.
                        Effect.ensuring(done),
                        Effect.flatMap(commit),
                      ),
                ),
              ),
            ),
            // Failed or stopped: the state as it was, without this switch.
            Effect.onExit((exit) =>
              exit._tag === 'Success'
                ? Effect.void
                : Effect.andThen(done, reshow),
            ),
            Effect.ensuring(
              Effect.sync(() => {
                running--;
              }),
            ),
            Effect.asVoid,
          );
        }),
      signOut: (userId) =>
        serially(
          Effect.flatMap(current, (state) => {
            const target =
              userId ?? (state._tag === 'SignedIn' ? state.active.id : null);
            return target === null
              ? Effect.void
              : Effect.asVoid(
                  Effect.flatMap(source.signOut(target), (snapshot) =>
                    commit(snapshot, true),
                  ),
                );
          }),
        ),
      signOutAll: Effect.asVoid(
        serially(
          Effect.flatMap(source.signOutAll, (snapshot) =>
            commit(snapshot, true),
          ),
        ),
      ),
    });

    return { accounts, settle };
  });
