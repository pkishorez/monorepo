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
  SignedIn: ({ who }, { model, state, at }) =>
    state._tag === 'SigningIn'
      ? {
          model: { signIn: { ...model.signIn, at } },
          state: { _tag: 'SignedIn', who },
        }
      : {},
  SignInFailed: ({ reason }, { state }) =>
    state._tag === 'SigningIn'
      ? { state: { _tag: 'Stopped', why: { _tag: 'Failed', reason } } }
      : {},
  SignedOut: (_, data) =>
    data.state._tag === 'SignedIn'
      ? {
          model: {
            address: null,
            plugins: {},
            signIn: {
              ...data.model.signIn,
              refusals: refusalsAfterSignOut(data.model, data.at),
            },
          },
          state: { _tag: 'SigningIn', who: data.state.who },
        }
      : {},
  ConnectionRemoved: (_, { state }) =>
    state._tag === 'SignedIn'
      ? { state: { _tag: 'Stopped', why: { _tag: 'Removed' } } }
      : {},
  CliOutdated: ({ line }, { state }) =>
    state._tag === 'SignedIn'
      ? { state: { _tag: 'Stopped', why: { _tag: 'Outdated', line } } }
      : {},
  EnabledPluginsChanged: ({ plugins }, { model, state }) =>
    state._tag === 'SignedIn'
      ? { model: { plugins: runnable(model, plugins) } }
      : {},
  TunnelAddressChanged: ({ url, key }, { state }) =>
    state._tag === 'SignedIn' ? { model: { address: { url, key } } } : {},
  TunnelFailed: ({ reason }, { state }) =>
    state._tag === 'SignedIn'
      ? { state: { _tag: 'Stopped', why: { _tag: 'Failed', reason } } }
      : {},
  StopRequested: (_, { state }) =>
    state._tag === 'Stopped'
      ? {}
      : { state: { _tag: 'Stopped', why: { _tag: 'Requested' } } },
};
