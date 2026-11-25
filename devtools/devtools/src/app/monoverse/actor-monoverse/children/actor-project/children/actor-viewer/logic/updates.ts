import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';

import { isWithin } from '../../../../../../server/rpc/contract/index.js';
import { foldersOf, stepFrom, type ViewerShape } from './shared/index.js';

export const init: InitOf<typeof ViewerShape> = ({
  root,
  branch,
  ...open
}) => ({
  model: { root, branch },
  state:
    open._tag === 'File'
      ? open
      : { ...open, selected: null, showing: false, closed: [] },
});

export const updates: UpdatesOf<typeof ViewerShape> = {
  Selected: ({ path }, { state }) =>
    state._tag === 'Folder'
      ? { state: { ...state, selected: path, showing: true } }
      : {},
  Stepped: ({ by }, { props, state }) => {
    if (state._tag !== 'Folder') return {};
    const next = stepFrom(state, props, by);
    if (next === null) return {};
    return {
      state: {
        ...state,
        selected: next,
        closed: state.closed.filter((folder) => !isWithin(next, folder)),
      },
    };
  },
  FolderToggled: ({ path }, { state }) =>
    state._tag === 'Folder'
      ? {
          state: {
            ...state,
            closed: state.closed.includes(path)
              ? state.closed.filter((one) => one !== path)
              : [...state.closed, path],
          },
        }
      : {},
  AllToggled: (_, { props, state }) =>
    state._tag === 'Folder'
      ? {
          state: {
            ...state,
            closed: state.closed.length > 0 ? [] : [...foldersOf(state, props)],
          },
        }
      : {},
  InsideToggled: ({ path }, { props, state }) => {
    if (state._tag !== 'Folder') return {};
    const inside = foldersOf(state, props).filter(
      (folder) => folder !== path && isWithin(folder, path),
    );
    const closed = new Set(state.closed);
    const shut = closed.has(path) || inside.some((one) => closed.has(one));
    if (shut) {
      closed.delete(path);
      for (const one of inside) closed.delete(one);
    } else for (const one of inside) closed.add(one);
    return { state: { ...state, closed: [...closed] } };
  },
  UnchangedChosen: ({ unchanged }) => ({
    emit: { _tag: 'UnchangedChosen', unchanged },
  }),
  DeletedToggled: () => ({ emit: { _tag: 'DeletedToggled' } }),
  IgnoredToggled: () => ({ emit: { _tag: 'IgnoredToggled' } }),
  WentBack: (_, { state }) =>
    state._tag === 'Folder' ? { state: { ...state, showing: false } } : {},
  Closed: () => ({ emit: { _tag: 'Closed' } }),
};
