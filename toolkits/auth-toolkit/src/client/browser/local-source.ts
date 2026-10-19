import { Deferred, Effect, type Layer, Schema } from 'effect';
import { StdTable, type StdTableService } from '@kestack/std-toolkit/db';
import { ESchema } from '@kestack/std-toolkit/eschema';
import { localUser } from '../../contract/index.js';
import type { Snapshot } from '../accounts-layer/index.js';

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

// The entity and table names are kept on devices, so they never change.
const LocalAccounts = ESchema.make('LocalAccounts', {
  /** In the order they signed in. */
  users: Schema.Array(LocalUser),
  /** The Active Account's User id. */
  active: Schema.NullOr(Schema.String),
}).build();

/** Where Local Accounts are kept. Realize it on any StdTable adapter: Memory
 * (the default), IDB to keep them across reloads and tabs. */
export const localAccountsTable = StdTable.make('auth-local-accounts')
  .primary('pk', 'sk')
  .build();

export type LocalStorage = Layer.Layer<
  StdTableService<typeof localAccountsTable.logicalName>
>;

const stored = localAccountsTable
  .singleEntity(LocalAccounts)
  .default({ users: [], active: null });

type Stored = typeof LocalAccounts.Type;

const snapshotOf = ({ users, active }: Stored): Snapshot => ({
  active,
  accounts: users.map((user) => ({ ...user, image: null })),
});

/** Local Accounts in a table: signing in asks `choose` who, and nothing
 * else is asked. Never fails. */
export const makeLocalSource = (choose: Effect.Effect<LocalChoice | null>) =>
  Effect.gen(function* () {
    const table =
      yield* Effect.context<
        StdTableService<typeof localAccountsTable.logicalName>
      >();
    const read = stored.get().pipe(
      Effect.map(({ value }) => snapshotOf(value)),
      Effect.provide(table),
      Effect.orDie,
    );
    const update = (change: (current: Stored) => Stored) =>
      stored.getAndUpdate(change).pipe(
        Effect.map(({ value }) => snapshotOf(value)),
        Effect.provide(table),
        Effect.orDie,
      );

    return {
      read,
      signIn: () =>
        Effect.flatMap(choose, (choice) => {
          if (choice === null) return read;
          const user = localUser(choice);
          return update(({ users }) => ({
            users: [...users.filter(({ id }) => id !== user.id), user],
            active: user.id,
          }));
        }),
      switchTo: (userId: string) =>
        update((current) =>
          current.users.some(({ id }) => id === userId)
            ? { ...current, active: userId }
            : current,
        ),
      signOut: (userId: string) =>
        update(({ users, active }) => {
          const left = users.filter(({ id }) => id !== userId);
          return {
            users: left,
            active: left.some(({ id }) => id === active)
              ? active
              : (left[0]?.id ?? null),
          };
        }),
      signOutAll: update(() => ({ users: [], active: null })),
    };
  });

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
