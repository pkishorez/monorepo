import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';
import {
  type ConnectShape,
  refusalsAfterSignOut,
  runnable,
} from './shared/index.js';

export const init: InitOf<typeof ConnectShape> = (input) => ({
  model: {
    ...input,
    address: null,
    plugins: {},
    signIn: { at: null, refusals: 0 },
  },
  state: { _tag: 'SigningIn', who: null },
});

export const updates: UpdatesOf<typeof ConnectShape> = {
  StopRequested: (_, { state }) =>
    state._tag === 'Stopped'
      ? {}
      : { state: { _tag: 'Stopped', why: { _tag: 'Requested' } } },
};

export const signingInUpdates: UpdatesOf<typeof ConnectShape, 'SigningIn'> = {
  SignedIn: ({ who }, { model, at }) => ({
    model: { signIn: { ...model.signIn, at } },
    state: { _tag: 'SignedIn', who },
  }),
  SignInFailed: ({ reason }) => ({
    state: { _tag: 'Stopped', why: { _tag: 'Failed', reason } },
  }),
};

export const signedInUpdates: UpdatesOf<typeof ConnectShape, 'SignedIn'> = {
  SignedOut: (_, data) => ({
    model: {
      address: null,
      plugins: {},
      signIn: {
        ...data.model.signIn,
        refusals: refusalsAfterSignOut(data.model, data.at),
      },
    },
    state: { _tag: 'SigningIn', who: data.state.who },
  }),
  ConnectionRemoved: () => ({
    state: { _tag: 'Stopped', why: { _tag: 'Removed' } },
  }),
  CliOutdated: ({ line }) => ({
    state: { _tag: 'Stopped', why: { _tag: 'Outdated', line } },
  }),
  EnabledPluginsChanged: ({ plugins }, { model }) => ({
    model: { plugins: runnable(model, plugins) },
  }),
  TunnelAddressChanged: ({ url, key }) => ({
    model: { address: { url, key } },
  }),
  TunnelFailed: ({ reason }) => ({
    state: { _tag: 'Stopped', why: { _tag: 'Failed', reason } },
  }),
};
