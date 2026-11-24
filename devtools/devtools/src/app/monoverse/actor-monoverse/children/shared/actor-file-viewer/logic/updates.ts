import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';

import type { FileViewerShape } from './shared/index.js';

export const init: InitOf<typeof FileViewerShape> = (input) => ({
  model: input,
  state: { _tag: 'Loading' },
});

export const updates: UpdatesOf<typeof FileViewerShape> = {
  // The load's answer, heard only while Loading.
  Read: ({ content, binary }, { state }) =>
    state._tag === 'Loading'
      ? { state: { _tag: 'Text', content, binary } }
      : {},
  Diffed: ({ diff, content }, { state }) =>
    state._tag === 'Loading' ? { state: { _tag: 'Diff', diff, content } } : {},
  Refused: ({ problem }, { state }) =>
    state._tag === 'Loading' ? { state: { _tag: 'Failure', problem } } : {},
  Closed: () => ({ emit: { _tag: 'Closed' } }),
};
