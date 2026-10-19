import { Effect, Schema, type Scope, Semaphore, SubscriptionRef } from 'effect';
import {
  type Account,
  Accounts,
  type AccountsError,
  AccountsState,
  type SignInOptions,
} from '../accounts/index.js';
import { signing } from './signing.js';

export { signing };

export const AccountSchema = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
  image: Schema.NullOr(Schema.String),
}) satisfies Schema.Codec<Account, unknown>;

export const SnapshotSchema = Schema.Struct({
  active: Schema.NullOr(Schema.String),
  accounts: Schema.Array(AccountSchema),
});

/** Who is signed in, as a Source answers it: the Active Account's User id
 * (null when signed out) and every Account in sign-in order. */
export interface Snapshot {
  readonly active: string | null;
  readonly accounts: ReadonlyArray<Account>;
}

/** Where the Accounts really live: the Auth Worker, a Sign-in Store, or the
 * Local Accounts table. Every action answers who is signed in after it. */
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
  /** Remembers each Snapshot the state takes, in the order it takes them. */
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

const stateOf = ({ active, accounts }: Snapshot): AccountsState => {
  const account = accounts.find(({ id }) => id === active);
  return account
    ? AccountsState.SignedIn({ active: account, accounts })
    : AccountsState.SignedOut();
};

const activeOf = (snapshot: Snapshot | null) =>
  snapshot?.accounts.find(({ id }) => id === snapshot.active);

/** The `Accounts` service over a Source: its state, kept as each action
 * answers and told to its peers when it changes, and `settle`, which checks
 * only while the state is still `Checking` so concurrent callers ask
 * once.
 *
 * What changes the state runs one at a time (checks, actions, a peer's
 * Snapshot), so an answer never lands over one that came after it. A
 * sign-in, which may wait on the User for minutes, runs alone and commits
 * its answer only if nothing was committed since: what was is newer. */
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
    // How many Snapshots the state has taken.
    let commits = 0;
    const lock = yield* Semaphore.make(1);
    const serially = lock.withPermit;

    // Kept before it is shown, so whoever sees the state can rely on it.
    const apply = (snapshot: Snapshot) =>
      keep(snapshot).pipe(
        Effect.andThen(
          Effect.sync(() => {
            known = JSON.stringify(snapshot);
            commits++;
          }),
        ),
        Effect.andThen(SubscriptionRef.setAndGet(ref, stateOf(snapshot))),
      );

    const { announce } = yield* connect({
      check: Effect.suspend(() => Effect.ignore(check)),
      apply: (snapshot) => serially(Effect.asVoid(apply(snapshot))),
    });

    // Runs with the lock held.
    const commit = (snapshot: Snapshot): Effect.Effect<AccountsState> =>
      Effect.suspend(() => {
        const changed = JSON.stringify(snapshot) !== known;
        return apply(snapshot).pipe(
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
      switchTo: (userId) => Effect.asVoid(committed(source.switchTo(userId))),
      signOut: (userId) =>
        serially(
          Effect.flatMap(current, (state) => {
            const target =
              userId ?? (state._tag === 'SignedIn' ? state.active.id : null);
            return target === null
              ? Effect.void
              : Effect.asVoid(Effect.flatMap(source.signOut(target), commit));
          }),
        ),
      signOutAll: Effect.asVoid(committed(source.signOutAll)),
    });

    return { accounts, settle };
  });
