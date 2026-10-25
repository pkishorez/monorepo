import { Effect, type Layer, Schema } from 'effect';
import { StdTable, type StdTableService } from '@kestack/std-toolkit/db';
import { ESchema } from '@kestack/std-toolkit/eschema';
import type { SignInOptions } from '../client/accounts/index.js';
import type { Snapshot } from '../client/engine/index.js';
import type { FakeChoice } from './chooser.js';
import { fakeUser } from './token.js';

const FakeUser = Schema.Struct({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
});

// The entity and table names are kept on devices, so they never change,
// Local mode's names included.
const LocalAccounts = ESchema.make('LocalAccounts', {
  /** In the order they signed in. */
  users: Schema.Array(FakeUser),
  /** The Active Account's User id. */
  active: Schema.NullOr(Schema.String),
}).build();

/** Where fake Accounts are kept. Realize it on any StdTable adapter: Memory
 * (the default), IDB to keep them across reloads and tabs. */
export const fakeAccountsTable = StdTable.make('auth-local-accounts')
  .primary('pk', 'sk')
  .build();

export type FakeStorage = Layer.Layer<
  StdTableService<typeof fakeAccountsTable.logicalName>
>;

const stored = fakeAccountsTable
  .singleEntity(LocalAccounts)
  .default({ users: [], active: null });

type Stored = typeof LocalAccounts.Type;

const snapshotOf = ({ users, active }: Stored): Snapshot => ({
  active,
  accounts: users.map((user) => ({ ...user, image: null })),
});

/** Fake Accounts in a table: signing in asks `choose` who, unless it names a
 * Test User (`test`, no key asked), and nothing else is asked. An email not
 * at `FAKE_DOMAIN` signs nobody in. Never fails. */
export const makeFakeSource = (choose: Effect.Effect<FakeChoice | null>) =>
  Effect.gen(function* () {
    const table =
      yield* Effect.context<
        StdTableService<typeof fakeAccountsTable.logicalName>
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
      signIn: (options: SignInOptions) =>
        Effect.flatMap(
          options.test ? Effect.succeed(options.test) : choose,
          (choice) => {
            const user = choice === null ? null : fakeUser(choice);
            if (user === null) return read;
            return update(({ users }) => ({
              users: [...users.filter(({ id }) => id !== user.id), user],
              active: user.id,
            }));
          },
        ),
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
