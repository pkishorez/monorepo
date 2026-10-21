import { Effect, Schema, Stream } from 'effect';
import { Page } from '@kestack/kabuki/routing';
import { CurrentAccount } from '@kestack/web-platform/account-switcher';
import { about } from '../metadata/index.ts';
import { Peek, PeekLive } from './peek/index.ts';
import { PocketLive } from './pocket/index.ts';
import { SyncLive } from './sync/index.ts';

/*
 * The Replica page: a Pocket of wallets and entries per Account, kept on
 * this device and synced by `@kestack/std-toolkit/replica`.
 *
 * 1. Your Pocket  the active Account's, which follows a switch: the page
 *                 keeps who is active, and hands it to the section as
 *                 Props, so its Queries move to the new Account's Instance.
 * 2. Peek         `/replica/peek`, another signed-in Account's, read from
 *                 the device and never fetched.
 * 3. Sync         the Instances running, beside both.
 *
 * Like the APIs page it has no data: an Account is the browser's, so the
 * server draws it checking and the browser carries on.
 */

const Caller = Schema.TaggedUnion({
  Checking: {},
  SignedOut: {},
  SignedIn: { id: Schema.String, email: Schema.String },
});

export const Replica = Page.define({
  path: '/replica',
  requires: [CurrentAccount],
  metadata: about(
    '/replica',
    'Replica',
    'Wallets kept on this device, shown at once, synced while you are the active account.',
  ),
  model: Schema.Struct({ caller: Caller }),
  message: Schema.TaggedUnion({ Changed: { caller: Caller } }),
  pages: { Peek },
});

export const ReplicaLive = Page.build(Replica, {
  init: () => ({ model: { caller: { _tag: 'Checking' } } }),
  pages: { Peek: PeekLive },
  workers: {
    account: {
      run: (self) =>
        Effect.flatMap(CurrentAccount, ({ state }) =>
          Stream.runForEach(state, ({ account }) =>
            self.send({
              _tag: 'Changed',
              caller:
                account._tag === 'SignedIn'
                  ? {
                      _tag: 'SignedIn',
                      id: account.active.id,
                      email: account.active.email,
                    }
                  : { _tag: account._tag },
            }),
          ),
        ),
    },
  },
  children: {
    pocket: {
      actor: PocketLive,
      while: ({ model }) => model.caller._tag === 'SignedIn',
      props: ({ model }) => ({
        account: model.caller._tag === 'SignedIn' ? model.caller.id : '',
      }),
    },
    sync: { actor: SyncLive },
  },
  on: {
    Changed: ({ caller }) => ({ model: { caller } }),
  },
});
