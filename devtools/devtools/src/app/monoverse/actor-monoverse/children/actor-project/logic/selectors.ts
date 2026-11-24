import type { DataOf } from '@kestack/kabuki/types';

import {
  isWithin,
  rootRelative,
} from '../../../../server/rpc/contract/index.js';
import {
  baseOf,
  changesAt,
  changesOf,
  foldersHolding,
  shownChangesOf,
  type ProjectShape,
} from './shared/index.js';

type Data = DataOf<typeof ProjectShape>;

/** The project's name: as it was saved, else its workspace's. */
const nameIn = ({
  props,
  state,
}:
  | DataOf<typeof ProjectShape, 'Monorepo'>
  | DataOf<typeof ProjectShape, 'Package'>) =>
  props.name ?? state.workspace.name;

/** Whether what is open waits on the change set, still being read. */
const awaitingChanges = (data: Data) =>
  changesAt(data) !== null &&
  changesOf(data) === null &&
  data.model.changesProblem === null;

// 1. Analyse

/** The Monorepo tree's Input: the folders holding Packages open, so every Package shows. */
export const treeInput = ({
  state,
}: DataOf<typeof ProjectShape, 'Monorepo'>) => ({
  open: foldersHolding(
    '',
    state.workspace.packages.map(({ path }) => rootRelative(path)),
  ),
});

/** The Monorepo tree's Props: its files, each Package one leaf with its Check, their links, the cycles broken. */
export const treeProps = (data: DataOf<typeof ProjectShape, 'Monorepo'>) => {
  const { props, state } = data;
  return {
    base: '',
    name: nameIn(data),
    files: state.workspace.files,
    packages: state.workspace.packages.map(
      ({ path, name, version, check }) => ({
        path: rootRelative(path),
        name,
        ...(version === undefined ? {} : { version }),
        check,
      }),
    ),
    links: state.links,
    broken: state.cycles.map(([from, to]) => ({
      from,
      to,
      message: `In a Package cycle: ${from} depends on ${to}, which leads back to it.`,
    })),
    sourceRoots: null,
    changes: shownChangesOf(data),
    unchanged: props.unchanged,
    ignored: props.ignored,
  };
};

/** A Single Package's Input: the project's folder itself. */
export const singleInput = (data: DataOf<typeof ProjectShape, 'Package'>) => ({
  root: data.model.root,
  path: '.',
  name: nameIn(data),
});

/** A Package's Props: the branch, and how its tree is drawn. */
export const packageProps = (data: Data) => ({
  branch: data.props.branch,
  changes: shownChangesOf(data),
  unchanged: data.props.unchanged,
  ignored: data.props.ignored,
});

// 3. Enter

/** Whether a Package of the Monorepo is entered. */
export const isEntered = ({ props }: Data) => props.package !== null;

/** The Package entered, keying its view. */
export const enteredKey = ({ props }: Data) => props.package ?? '';

/** The Package entered's Input: its folder and name. */
export const enteredInput = ({
  model,
  props,
  state,
}: DataOf<typeof ProjectShape, 'Monorepo'>) => ({
  root: model.root,
  path: props.package ?? '.',
  name:
    state.workspace.packages.find(({ path }) => path === props.package)?.name ??
    props.package ??
    '',
});

// 4. View

/**
 * Whether what is open shows over the tree: in the Package it was opened
 * in, and for a folder, once what changed in it is read.
 */
export const opensViewer = (data: Data) => {
  const { model, props, state } = data;
  const open = model.open;
  if (open === null || open.package !== props.package) return false;
  if (state._tag !== 'Monorepo' && state._tag !== 'Package') return false;
  if (open._tag === 'File') return true;
  return !awaitingChanges(data);
};

/** What is open, as it is read: a Viewer of its own for each. */
export const viewerKey = (data: Data) => {
  const { model, props } = data;
  const changes = changesOf(data);
  return JSON.stringify([
    model.open?._tag,
    model.root,
    props.branch,
    model.open?.path,
    changes === null ? null : baseOf(data),
    changes === null,
    model.reloads,
  ]);
};

/** The Viewer's Input: the file or folder open, as the branch has it, and what changed in it. */
export const viewerInput = (data: Data) => {
  const { model, props } = data;
  const changes = changesOf(data);
  const base = changes === null ? null : baseOf(data);
  const open = model.open;
  if (open?._tag === 'Folder')
    return {
      _tag: 'Folder' as const,
      root: model.root,
      branch: props.branch,
      base,
      path: open.path,
      title: open.path === '' ? (props.name ?? 'The project') : open.path,
      files: open.files,
      changed: (changes ?? []).filter((change) =>
        isWithin(change.path, open.path),
      ),
      sourceRoots: open.sourceRoots,
    };
  const path = open?.path ?? '';
  return {
    _tag: 'File' as const,
    root: model.root,
    branch: props.branch,
    path,
    base,
    status: changes?.find((change) => change.path === path)?.status ?? null,
  };
};
