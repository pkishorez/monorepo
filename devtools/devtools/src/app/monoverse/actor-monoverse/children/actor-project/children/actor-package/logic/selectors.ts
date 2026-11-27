import type { DataOf } from '@kestack/kabuki/types';

import { foldersHolding } from '../../../logic/shared/index.js';
import type { PackageShape } from './shared/index.js';

export const treeInput = ({
  state,
}: DataOf<typeof PackageShape, 'Contents'>) => ({
  open: [
    ...new Set([
      ...foldersHolding(state.contents.path, state.contents.sourceRoots),
      ...state.contents.sourceRoots.filter(
        (root) => root !== state.contents.path,
      ),
    ]),
  ],
});

export const treeProps = ({
  model,
  props,
  state,
}: DataOf<typeof PackageShape, 'Contents'>) => ({
  base: state.contents.path,
  name: model.name,
  files: state.contents.files,
  packages: [],
  links: state.contents.imports,
  broken:
    state.contents.check._tag === 'Checked'
      ? state.contents.check.violations.map(
          ({ from, to, line, column, message }) => ({
            from,
            ...(to === undefined ? {} : { to }),
            line,
            column,
            message,
          }),
        )
      : [],
  excepted:
    state.contents.check._tag === 'Checked'
      ? state.contents.check.excepted.map(
          ({ from, to, line, column, message }) => ({
            from,
            to,
            line,
            column,
            message,
          }),
        )
      : [],
  sourceRoots: state.contents.sourceRoots,
  changes: props.changes,
  unchanged: props.unchanged,
  ignored: props.ignored,
  shown: props.shown,
  outside: props.outside,
  leavable: props.leavable,
});
