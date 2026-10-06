import { Deferred, Effect, Layer, Schema } from 'effect';
import { StdTable, type StdTableService } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { ESchema } from '@kstackz/std-toolkit/eschema';
import {
  localToken,
  localUser,
  type User,
} from '../../auth-worker-contract/index.js';
import { Auth, type SignedInAccount } from './auth.js';

/** Who to sign in as: an email, and optionally a name. */
export interface LocalChoice {
  readonly email: string;
  readonly name?: string;
}

const LocalUser = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
});

const LocalAccounts = ESchema.make('LocalAccounts', {
  /** In the order they signed in. */
  users: Schema.Array(LocalUser),
  /** The Active Account's User id. */
  active: Schema.NullOr(Schema.String),
}).build();

/** Where Local Accounts are kept. Realize it on any StdTable adapter: Memory
 * (the default), IDB to keep them across reloads and tabs, SQLite on a
 * phone. */
export const localAccountsTable = StdTable.make('auth-local-accounts')
  .primary('pk', 'sk')
  .build();

const state = localAccountsTable
  .singleEntity(LocalAccounts)
  .default({ users: [], active: null });

type LocalAccountsStorage = Layer.Layer<
  StdTableService<typeof localAccountsTable.logicalName>
>;

interface AuthLocalConfig {
  /** Asks who to sign in as; null when nobody was chosen. */
  choose: Effect.Effect<LocalChoice | null>;
  /** Where Local Accounts live; in memory unless given. */
  storage?: LocalAccountsStorage;
}

const userOf = (token: string): User | null => localToken.read(token);

/** Auth kept as Local Accounts, with no Auth Worker: signing in asks
 * `choose` who, and each account's token is a Local Token. */
export const authLocal = ({ choose, storage }: AuthLocalConfig) =>
  Layer.effect(
    Auth,
    Effect.gen(function* () {
      const table =
        yield* Effect.context<
          StdTableService<typeof localAccountsTable.logicalName>
        >();
      const read = state.get().pipe(
        Effect.map(({ value }) => value),
        Effect.provide(table),
        Effect.orDie,
      );
      const update = (
        change: (
          current: typeof LocalAccounts.Type,
        ) => typeof LocalAccounts.Type,
      ) =>
        state
          .getAndUpdate(change)
          .pipe(Effect.provide(table), Effect.orDie, Effect.asVoid);

      return Auth.of({
        list: read.pipe(
          Effect.map(({ users, active }) =>
            users.map((user): SignedInAccount => ({
              user: { ...user, image: null },
              token: localToken.make(user),
              active: user.id === active,
            })),
          ),
        ),
        signIn: () =>
          Effect.gen(function* () {
            const choice = yield* choose;
            if (choice === null) return;
            const user = localUser(choice);
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
  ).pipe(Layer.provide(storage ?? Memory.make(localAccountsTable).layer));

/** A `choose` that a dialog answers: `choose` waits until `answer` is called,
 * and `subscribe` and `isAsking` tell the dialog when to show. */
export const localChooser = () => {
  let asking: Deferred.Deferred<LocalChoice | null> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const choose: Effect.Effect<LocalChoice | null> = Effect.gen(function* () {
    const deferred = yield* Deferred.make<LocalChoice | null>();
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
    answer: (choice: LocalChoice | null) => {
      if (asking !== null) Deferred.doneUnsafe(asking, Effect.succeed(choice));
    },
  };
};
