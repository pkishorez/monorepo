import { Effect, Schema, Stream } from 'effect';
import { Actor } from '@kestack/kabuki';
import { Replicas } from '@kestack/std-toolkit/replica';
import { CurrentAccount } from '@kestack/web-platform/account-switcher';

/*
 * The Sync panel: every Instance running on this page, as Replicas shows
 * them, kept in the Model so the Inspector and time travel see the same.
 * An Instance runs while something reads it, and for a moment after. The
 * signed-in Accounts are kept too, to name each Instance by its email.
 */

const Account = Schema.Struct({ id: Schema.String, email: Schema.String });

const Running = Schema.Struct({
  replica: Schema.String,
  key: Schema.String,
  role: Schema.Literals(['leading', 'following']),
  gate: Schema.Boolean,
  holders: Schema.Array(Schema.String),
  /** When it stops, in ms since 1970, unless held again first. */
  lingeringUntil: Schema.NullOr(Schema.Number),
});

export const Sync = Actor.define('Sync', {
  requires: [Replicas, CurrentAccount],
  model: Schema.Struct({
    instances: Schema.Array(Running),
    accounts: Schema.Array(Account),
  }),
  message: Schema.TaggedUnion({
    Shown: { instances: Schema.Array(Running) },
    Accounts: { accounts: Schema.Array(Account) },
  }),
});

export const SyncLive = Actor.build(Sync, {
  init: () => ({ model: { instances: [], accounts: [] } }),
  workers: {
    follow: {
      run: (self) =>
        Effect.flatMap(Replicas, ({ state }) =>
          Stream.runForEach(state, (instances) =>
            self.send({ _tag: 'Shown', instances }),
          ),
        ),
    },
    accounts: {
      run: (self) =>
        Effect.flatMap(CurrentAccount, ({ state }) =>
          Stream.runForEach(state, ({ account }) =>
            self.send({
              _tag: 'Accounts',
              accounts:
                account._tag === 'SignedIn'
                  ? account.accounts.map(({ id, email }) => ({ id, email }))
                  : [],
            }),
          ),
        ),
    },
  },
  on: {
    Shown: ({ instances }, { model }) => ({ model: { ...model, instances } }),
    Accounts: ({ accounts }, { model }) => ({ model: { ...model, accounts } }),
  },
});
