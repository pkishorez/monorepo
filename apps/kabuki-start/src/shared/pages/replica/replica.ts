import { Effect, Schema, Stream } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { Replicas } from '@kestack/std-toolkit/replica';
import { CurrentAccount } from '@kestack/web-platform/account-switcher';
import { about } from '../metadata/index.ts';
import {
  Caller,
  follow,
  Running,
  show,
  shown,
  signedIn,
} from './accounts/index.ts';
import { PocketLive } from './pocket/index.ts';

/*
 * The Replica page: a Pocket of wallets and entries per Account, kept on
 * this device and synced by `@kestack/std-toolkit/replica`.
 *
 * 1. Accounts  every signed-in Account, with its Instance as Replicas
 *              shows it; picking one shows its Pocket.
 * 2. Pocket    the shown Account's, handed as Props, so its Queries move
 *              to that Account's Instance. The active Account's writes;
 *              any other is read from the device, its Gate closed.
 *
 * Like the APIs page it has no data: an Account is the browser's, so the
 * server draws it checking and the browser carries on.
 */

export const Replica = Page.define({
  path: '/replica',
  requires: [CurrentAccount, Replicas],
  metadata: about(
    '/replica',
    'Replica',
    'Wallets kept on this device: they open at once, change at once, and sync while you are the active account.',
  ),
  model: Schema.Struct({
    caller: Caller,
    /** The Account picked to show, when it is not the active one. */
    picked: Schema.NullOr(Schema.String),
    instances: Schema.Array(Running),
  }),
  message: Schema.TaggedUnion({
    Changed: { caller: Caller },
    Show: { account: Schema.String },
    Running: { instances: Schema.Array(Running) },
  }),
});

export const ReplicaLive = Page.build(Replica, {
  init: () => ({
    model: { caller: { _tag: 'Checking' }, picked: null, instances: [] },
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
    replicas: {
      run: (self) =>
        Effect.flatMap(Replicas, ({ state }) =>
          Stream.runForEach(state, (instances) =>
            self.send({ _tag: 'Running', instances }),
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
    Running: ({ instances }, { model }) => ({
      model: { ...model, instances },
    }),
  },
});
