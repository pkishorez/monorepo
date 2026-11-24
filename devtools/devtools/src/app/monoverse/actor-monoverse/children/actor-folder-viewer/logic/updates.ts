import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';

import { isWithin } from '../../../../server/rpc/contract/index.js';
import { foldersOf, stepFrom, type FolderViewerShape } from './shared/index.js';

export const init: InitOf<typeof FolderViewerShape> = (input) => ({
  model: { ...input, selected: null, showing: false, closed: [] },
});

export const updates: UpdatesOf<typeof FolderViewerShape> = {
  Selected: ({ path }) => ({ model: { selected: path, showing: true } }),
  Stepped: ({ by }, { model, props }) => {
    const next = stepFrom(model, props, by);
    if (next === null) return {};
    return {
      model: {
        selected: next,
        // The folders holding it open, so the list shows it.
        closed: model.closed.filter((folder) => !isWithin(next, folder)),
      },
    };
  },
  FolderToggled: ({ path }, { model }) => ({
    model: {
      closed: model.closed.includes(path)
        ? model.closed.filter((one) => one !== path)
        : [...model.closed, path],
    },
  }),
  AllToggled: (_, { model, props }) => ({
    model: {
      closed: model.closed.length > 0 ? [] : [...foldersOf(model, props)],
    },
  }),
  InsideToggled: ({ path }, { model, props }) => {
    const inside = foldersOf(model, props).filter(
      (folder) => folder !== path && isWithin(folder, path),
    );
    const closed = new Set(model.closed);
    const shut = closed.has(path) || inside.some((one) => closed.has(one));
    if (shut) {
      closed.delete(path);
      for (const one of inside) closed.delete(one);
    } else for (const one of inside) closed.add(one);
    return { model: { closed: [...closed] } };
  },
  // 1. List: the settings are the holder's to change.
  UnchangedChosen: ({ unchanged }) => ({
    emit: { _tag: 'UnchangedChosen', unchanged },
  }),
  DeletedToggled: () => ({ emit: { _tag: 'DeletedToggled' } }),
  IgnoredToggled: () => ({ emit: { _tag: 'IgnoredToggled' } }),
  WentBack: () => ({ model: { showing: false } }),
  // 3. Close
  Closed: () => ({ emit: { _tag: 'Closed' } }),
};
