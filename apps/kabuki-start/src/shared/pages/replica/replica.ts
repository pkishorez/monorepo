import { Effect, Schema, Stream } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { CurrentAccount } from '@kestack/web-platform/account-switcher';
import { about } from '../metadata/index.ts';
import { Caller, follow, show, shown, signedIn } from './accounts/index.ts';
import { PocketLive } from './pocket/index.ts';

/*
 * The Replica page: a Pocket of wallets and entries per Account, kept on
 * this device and synced by `@kestack/std-toolkit/replica`.
 *
 * 1. Accounts  every signed-in Account; picking one shows its Pocket.
 *              How each one's Instance syncs, its View reads from the
 *              Replicas actor itself.
 * 2. Pocket    the shown Account's, handed as Props, so its Queries move
 *              to that Account's Instance. The active Account's writes;
 *              any other is read from the device, its Gate closed.
 *
 * Like the APIs page it has no data: an Account is the browser's, so the
 * server draws it checking and the browser carries on.
 */

export const Replica = Page.define({
  path: '/replica',
  requires: [CurrentAccount],
  metadata: about(
    '/replica',
    'Replica',
    'Wallets kept on this device: they open at once, change at once, and sync while you are the active account.',
  ),
  model: Schema.Struct({
    caller: Caller,
    /** The Account picked to show, when it is not the active one. */
    picked: Schema.NullOr(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Changed: { caller: Caller },
    Show: { account: Schema.String },
  }),
});

export const ReplicaLive = Page.build(Replica, {
  init: () => ({
    model: { caller: { _tag: 'Checking' }, picked: null },
  }),
  workers: {
    account: {
      run: (self) =>
        Effect.flatMap(CurrentAccount, ({ state }) =>
          Stream.runForEach(state, (current) =>
            self.send({ _tag: 'Changed', caller: signedIn(current) }),
          ),
        ),
    },
  },
  children: {
    pocket: {
      actor: PocketLive,
      while: ({ model }) => model.caller._tag === 'SignedIn',
      props: ({ model }) => ({
        account: shown(model) ?? '',
        writable:
          model.caller._tag === 'SignedIn' &&
          shown(model) === model.caller.active,
      }),
    },
  },
  on: {
    Changed: ({ caller }, { model }) => ({
      model: { ...model, ...follow(model, caller) },
    }),
    Show: ({ account }, { model }) => ({
      model: { ...model, ...show(model, account) },
    }),
  },
});
