import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';
import {
  backoffAfter,
  crashesAfter,
  type PluginShape,
} from './shared/index.js';

export const init: InitOf<typeof PluginShape> = (input) => ({
  model: { ...input, crashes: 0, startedAt: null },
  state: { _tag: 'Starting' },
});

const crashed = (
  model: Parameters<typeof crashesAfter>[0] & {
    readonly firstRetryAfter: number;
  },
  at: number,
  log: ReadonlyArray<string>,
) => {
  const crashes = crashesAfter(model, at);
  return {
    model: { crashes, startedAt: null },
    state: {
      _tag: 'Crashed',
      retryAt: at + backoffAfter(crashes, model.firstRetryAfter),
      log,
    } as const,
  };
};

export const updates: UpdatesOf<typeof PluginShape> = {
  PluginStarted: (_, { state, at }) =>
    state._tag === 'Starting'
      ? { model: { startedAt: at }, state: { _tag: 'Running' } }
      : {},
  PluginStartFailed: ({ log }, { model, state, at }) =>
    state._tag === 'Starting' ? crashed(model, at, log) : {},
  PluginExited: ({ log }, { model, state, at }) =>
    state._tag === 'Crashed' ? {} : crashed(model, at, log),
  BackoffEnded: (_, { state }) =>
    state._tag === 'Crashed' ? { state: { _tag: 'Starting' } } : {},
};
