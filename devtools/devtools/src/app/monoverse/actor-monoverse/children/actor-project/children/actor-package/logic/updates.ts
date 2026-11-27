import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';

import { readAt, type PackageShape } from './shared/index.js';

export const init: InitOf<typeof PackageShape> = ({ root, path, name }) => ({
  model: { root, path, name, tries: 0 },
  state: { _tag: 'Reading' },
});

export const updates: UpdatesOf<typeof PackageShape> = {
  Read: ({ at, contents }, { model, props }) =>
    at === readAt(props.branch, model.tries)
      ? { state: { _tag: 'Contents', at, contents } }
      : {},
  Refused: ({ at, problem }, { model, props }) =>
    at === readAt(props.branch, model.tries)
      ? { state: { _tag: 'Failure', at, problem } }
      : {},
  Retried: (_, { model }) => ({ model: { tries: model.tries + 1 } }),
  Opened: ({ path }) => ({ emit: { _tag: 'Opened', path } }),
  Viewed: ({ path, files, sourceRoots }) => ({
    emit: { _tag: 'Viewed', path, files, sourceRoots },
  }),
};
