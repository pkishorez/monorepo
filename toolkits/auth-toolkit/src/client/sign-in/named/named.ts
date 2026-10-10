import { Deferred, Effect, Layer, Schema } from 'effect';
import { StdTable, type StdTableService } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { ESchema } from '@kstackz/std-toolkit/eschema';
import { nameToken, namedUser, type User } from '../../../contract/index.js';
import { type Listed, SignIn } from '../../account/index.js';

/** Who to sign in as: an email, and optionally a name. */
export interface NamedChoice {
  readonly email: string;
  readonly name?: string;
}

const NamedUser = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
});

// The entity and table names predate Named Accounts; devices keep them.
const NamedAccounts = ESchema.make('LocalAccounts', {
  /** In the order they signed in. */
  users: Schema.Array(NamedUser),
  /** The Active Account's User id. */
  active: Schema.NullOr(Schema.String),
}).build();

/** Where Named Accounts are kept. Realize it on any StdTable adapter: Memory
 * (the default), IDB to keep them across reloads and tabs, SQLite on a
 * phone. */
export const namedAccountsTable = StdTable.make('auth-local-accounts')
  .primary('pk', 'sk')
  .build();

const state = namedAccountsTable
  .singleEntity(NamedAccounts)
  .default({ users: [], active: null });

type NamedAccountsStorage = Layer.Layer<
  StdTableService<typeof namedAccountsTable.logicalName>
>;

export interface NamedOptions {
  /** Asks who to sign in as; null when nobody was chosen. */
  readonly choose: Effect.Effect<NamedChoice | null>;
  /** Where Named Accounts live; in memory unless given. */
  readonly storage?: NamedAccountsStorage;
}

const userOf = (token: string): User | null => nameToken.read(token);

/** Sign-in by name, for the device Backend, with no sign-in service:
 * signing in asks `choose` who, and each Account's token is a Name Token. */
export const named = ({ choose, storage }: NamedOptions) =>
  Layer.effect(
    SignIn,
    Effect.gen(function* () {
      const table =
        yield* Effect.context<
          StdTableService<typeof namedAccountsTable.logicalName>
        >();
      const read = state.get().pipe(
        Effect.map(({ value }) => value),
        Effect.provide(table),
        Effect.orDie,
      );
      const update = (
        change: (
          current: typeof NamedAccounts.Type,
        ) => typeof NamedAccounts.Type,
      ) =>
        state
          .getAndUpdate(change)
          .pipe(Effect.provide(table), Effect.orDie, Effect.asVoid);

      return SignIn.of({
        list: read.pipe(
          Effect.map(({ users, active }) =>
            users.map((user): Listed => ({
              user: { ...user, image: null },
              token: nameToken.make(user),
              active: user.id === active,
            })),
          ),
        ),
        signIn: () =>
          Effect.gen(function* () {
            const choice = yield* choose;
            if (choice === null) return;
            const user = namedUser(choice);
            yield* update(({ users }) => ({
              users: [...users.filter(({ id }) => id !== user.id), user],
              active: user.id,
            }));
          }),
        switchTo: (token) =>
          update((current) => {
            const user = userOf(token);
            return current.users.some(({ id }) => id === user?.id)
              ? { ...current, active: user!.id }
              : current;
          }),
        signOut: (token) =>
          update(({ users, active }) => {
            const left = users.filter(({ id }) => id !== userOf(token)?.id);
            return {
              users: left,
              active: left.some(({ id }) => id === active)
                ? active
                : (left[0]?.id ?? null),
            };
          }),
        signOutAll: update(() => ({ users: [], active: null })),
        takeLoginError: Effect.succeed(null),
      });
    }),
  ).pipe(Layer.provide(storage ?? Memory.make(namedAccountsTable).layer));

/** A `choose` that a dialog answers: `choose` waits until `answer` is called,
 * and `subscribe` and `isAsking` tell the dialog when to show. */
export const namedChooser = () => {
  let asking: Deferred.Deferred<NamedChoice | null> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const choose: Effect.Effect<NamedChoice | null> = Effect.gen(function* () {
    const deferred = yield* Deferred.make<NamedChoice | null>();
    if (asking !== null) Deferred.doneUnsafe(asking, Effect.succeed(null));
    asking = deferred;
    notify();
    return yield* Deferred.await(deferred);
  }).pipe(
    Effect.ensuring(
      Effect.sync(() => {
        asking = null;
        notify();
      }),
    ),
  );

  return {
    choose,
    /** Whether a sign-in is waiting for an answer. */
    isAsking: () => asking !== null,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => void listeners.delete(listener);
    },
    /** Answers the waiting sign-in; null signs nobody in. */
    answer: (choice: NamedChoice | null) => {
      if (asking !== null) Deferred.doneUnsafe(asking, Effect.succeed(choice));
    },
  };
};
