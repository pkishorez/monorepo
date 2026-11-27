import type { InitOf, UpdatesOf } from '@kestack/kabuki/types';

import { isWithin } from '../../../../../../../server/rpc/contract/index.js';
import { ancestorsOf } from '../../../../logic/shared/index.js';
import { foldersAround, type TreeShape } from './shared/index.js';

export const init: InitOf<typeof TreeShape> = ({ open }) => ({
  model: { open: [...open], home: [...open], selected: null, focus: null },
});

export const updates: UpdatesOf<typeof TreeShape> = {
  Toggled: ({ path }, { model }) => {
    if (!model.open.includes(path))
      return { model: { open: [...model.open, path] } };
    const holdsSelection =
      model.selected !== null &&
      model.selected !== path &&
      isWithin(model.selected, path);
    return {
      model: {
        open: model.open.filter((folder) => folder !== path),
        ...(holdsSelection ? { selected: path } : {}),
      },
    };
  },
  OpenChosen: ({ open }, { model, props }) => {
    const shut = new Set(open);
    const over =
      model.selected === null
        ? undefined
        : ancestorsOf(model.selected)
            .filter(
              (folder) =>
                folder !== props.base &&
                isWithin(folder, props.base) &&
                !shut.has(folder),
            )
            .at(-1);
    return {
      model: {
        open: [...open],
        ...(over === undefined ? {} : { selected: over }),
      },
    };
  },
  Reset: (_, { model }) => ({
    model: { open: [...model.home], selected: null },
  }),
  Selected: ({ path }, { model }) => ({
    model: { selected: path === model.selected ? null : path },
  }),
  Revealed: ({ folders }, { model }) => {
    const adding = folders.filter((folder) => !model.open.includes(folder));
    return adding.length === 0
      ? {}
      : { model: { open: [...model.open, ...adding] } };
  },
  Focused: ({ path }, { model, props }) => {
    const opening =
      path === null
        ? []
        : [path, ...foldersAround(path, props.base, props.links)].filter(
            (folder) => !model.open.includes(folder),
          );
    return {
      model: {
        focus: path,
        selected: null,
        ...(opening.length === 0 ? {} : { open: [...model.open, ...opening] }),
      },
    };
  },
  Opened: ({ path }) => ({ emit: { _tag: 'Opened', path } }),
  Entered: ({ path }) => ({ emit: { _tag: 'Entered', path } }),
  Viewed: ({ path, files }, { props }) => ({
    emit: {
      _tag: 'Viewed',
      path,
      files,
      sourceRoots: props.sourceRoots,
    },
  }),
};
