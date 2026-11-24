import type { DataOf } from '@kestack/kabuki/types';

import { rootRelative } from '../../../../server/rpc/contract/index.js';
import { foldersHolding } from '../../../logic/shared/index.js';
import type { MonorepoShape } from './shared/index.js';

type Data = DataOf<typeof MonorepoShape>;

// 1. Explore

/** The tree's Input: the folders holding Packages open, so every Package shows. */
export const treeInput = ({ props }: Data) => ({
  open: foldersHolding(
    '',
    props.workspace.packages.map(({ path }) => rootRelative(path)),
  ),
});

/** The tree's Props: the Monorepo's files, each Package one leaf with its Check, their links, the cycles broken. */
export const treeProps = ({ props }: Data) => ({
  base: '',
  name: props.name,
  files: props.workspace.files,
  packages: props.workspace.packages.map(({ path, name, version, check }) => ({
    path: rootRelative(path),
    name,
    ...(version === undefined ? {} : { version }),
    check,
  })),
  links: props.links,
  broken: props.cycles.map(([from, to]) => ({
    from,
    to,
    message: `In a Package cycle: ${from} depends on ${to}, which leads back to it.`,
  })),
  sourceRoots: null,
  changes: props.changes,
  unchanged: props.unchanged,
  ignored: props.ignored,
});

// 2. Enter

/** Whether a Package is entered. */
export const isEntered = ({ props }: Data) => props.package !== null;

/** The Package entered, keying its view. */
export const enteredKey = ({ props }: Data) => props.package ?? '';

/** The Package view's Input: the Package entered, by its folder and name. */
export const packageInput = ({ props }: Data) => ({
  root: props.root,
  path: props.package ?? '.',
  name:
    props.workspace.packages.find(({ path }) => path === props.package)?.name ??
    props.package ??
    '',
});
