import { Deferred, Effect, Layer, Schema } from 'effect';
import { StdTable, type StdTableService } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import { ESchema } from '@kstackz/std-toolkit/eschema';
import {
  mockToken,
  mockUser,
  type User,
} from '../../auth-worker-contract/index.js';
import { Accounts, type SignedInAccount } from './accounts.js';

/** Who to sign in as: an email, and optionally a name. */
export interface MockChoice {
  readonly email: string;
  readonly name?: string;
}

const MockUser = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
});

const MockAccounts = ESchema.make('MockAccounts', {
  /** In the order they signed in. */
  users: Schema.Array(MockUser),
  /** The Active Account's User id. */
  active: Schema.NullOr(Schema.String),
}).build();

/** Where Mock Accounts are kept. Realize it on any StdTable adapter: Memory
 * (the default), IDB to keep them across reloads and tabs, SQLite on a
 * phone. */
export const mockAccountsTable = StdTable.make('auth-mock-accounts')
  .primary('pk', 'sk')
  .build();

const state = mockAccountsTable
  .singleEntity(MockAccounts)
  .default({ users: [], active: null });

type MockAccountsStorage = Layer.Layer<
  StdTableService<typeof mockAccountsTable.logicalName>
>;

interface AccountsMockConfig {
  /** Asks who to sign in as; null when nobody was chosen. */
  choose: Effect.Effect<MockChoice | null>;
  /** Where Mock Accounts live; in memory unless given. */
  storage?: MockAccountsStorage;
}

const userOf = (token: string): User | null => mockToken.read(token);

/** Accounts kept as Mock Accounts, with no Auth Worker: signing in asks
 * `choose` who, and each account's token is a Mock Token. */
export const accountsMock = ({ choose, storage }: AccountsMockConfig) =>
  Layer.effect(
    Accounts,
    Effect.gen(function* () {
      const table =
        yield* Effect.context<
          StdTableService<typeof mockAccountsTable.logicalName>
        >();
      const read = state.get().pipe(
        Effect.map(({ value }) => value),
        Effect.provide(table),
        Effect.orDie,
      );
      const update = (
        change: (current: typeof MockAccounts.Type) => typeof MockAccounts.Type,
      ) =>
        state
          .getAndUpdate(change)
          .pipe(Effect.provide(table), Effect.orDie, Effect.asVoid);

      return Accounts.of({
        list: read.pipe(
          Effect.map(({ users, active }) =>
            users.map((user): SignedInAccount => ({
              user: { ...user, image: null },
              token: mockToken.make(user),
              active: user.id === active,
            })),
          ),
        ),
        signIn: () =>
          Effect.gen(function* () {
            const choice = yield* choose;
            if (choice === null) return;
            const user = mockUser(choice);
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
  ).pipe(Layer.provide(storage ?? Memory.make(mockAccountsTable).layer));

/** A `choose` that a dialog answers: `choose` waits until `answer` is called,
 * and `subscribe` and `isAsking` tell the dialog when to show. */
export const mockChooser = () => {
  let asking: Deferred.Deferred<MockChoice | null> | null = null;
  const listeners = new Set<() => void>();
  const notify = () => listeners.forEach((listener) => listener());

  const choose: Effect.Effect<MockChoice | null> = Effect.gen(function* () {
    const deferred = yield* Deferred.make<MockChoice | null>();
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
    answer: (choice: MockChoice | null) => {
      if (asking !== null) Deferred.doneUnsafe(asking, Effect.succeed(choice));
    },
  };
};
