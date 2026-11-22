import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import { ChangedPathSchema, type ChangeStatus } from '../contract/index.js';
import { FileViewerLive } from '../file-viewer/index.js';
import { isWithin } from '../model/index.js';
import { fileTreeRows } from './file-tree.js';

/*
 * One folder looked into, the root included: while Changes is on, the
 * files the branch changed in it since Compare-to, each with how; while it
 * is off, every file in it. One of them is shown beside the list, the
 * first to start with, as the branch has it or as its diff.
 *
 * 1. List    the files, as a tree of their folders, each of which closes
 *            and opens again. While Changes is on, the deleted files can
 *            be left out, which Emits `DeletedToggled`, so the tree on the
 *            canvas leaves them out too.
 * 2. Show    the one selected, in a FileViewer. On a phone the list and the
 *            file take turns: choosing one shows it, and its back arrow
 *            goes back to the list. The file before or after it, in the
 *            list's order, is a step away; a step into a closed folder
 *            opens it.
 * 3. Close   Emits `Closed`.
 */

const FolderInput = Schema.Struct({
  /** The project's folder, absolute. */
  root: Schema.String,
  /** The branch read; null: the folder as it is on disk. */
  branch: Schema.NullOr(Schema.String),
  /** Compare-to while Changes is on; null while it is off. */
  base: Schema.NullOr(Schema.String),
  /** The folder, relative to the root; `''` for the root. */
  path: Schema.String,
  /** What to call it: its path, or the project's name for the root. */
  title: Schema.String,
  /** Every file in it, relative to the root. */
  files: Schema.Array(Schema.String),
  /** What the branch changed in it since Compare-to. */
  changed: Schema.Array(ChangedPathSchema),
  /** Whether the deleted files are listed. */
  deleted: Schema.Boolean,
});

export const FolderViewer = Actor.define('FolderViewer', {
  input: FolderInput,
  model: Schema.Struct({
    ...FolderInput.fields,
    /** The file shown beside the list. */
    selected: Schema.NullOr(Schema.String),
    /** On a phone: the file shown, not the list. */
    showing: Schema.Boolean,
    /** The folders closed in the list. */
    closed: Schema.Array(Schema.String),
  }),
  message: Schema.TaggedUnion({
    Selected: { path: Schema.String },
    /** To the file before (-1) or after (1) the one shown. */
    Stepped: { by: Schema.Number },
    FolderToggled: { path: Schema.String },
    DeletedToggled: {},
    Back: {},
    Closed: {},
  }),
  emits: { Closed: {}, DeletedToggled: {} },
});

export interface FolderEntry {
  readonly path: string;
  /** How the branch changed it; null while Changes is off. */
  readonly status: ChangeStatus | null;
}

/**
 * What the list shows: the changed files while Changes is on, the deleted
 * ones only while they are listed, else every file; by path.
 */
export function entriesOf(model: {
  readonly base: string | null;
  readonly files: ReadonlyArray<string>;
  readonly changed: ReadonlyArray<{ path: string; status: ChangeStatus }>;
  readonly deleted: boolean;
}): ReadonlyArray<FolderEntry> {
  const entries: Array<FolderEntry> =
    model.base === null
      ? model.files.map((path) => ({ path, status: null }))
      : model.changed
          .filter(({ status }) => model.deleted || status !== 'deleted')
          .map(({ path, status }) => ({ path, status }));
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

/** Every file the list shows, in its order with every folder open. */
export const filesInOrder = (
  model: Parameters<typeof entriesOf>[0] & { readonly path: string },
): ReadonlyArray<string> =>
  fileTreeRows(model.path, entriesOf(model), new Set()).flatMap((row) =>
    row.kind === 'file' ? [row.path] : [],
  );

/** The first file the list shows. */
const firstFile = (model: Parameters<typeof entriesOf>[0] & { path: string }) =>
  filesInOrder(model)[0] ?? null;

export const FolderViewerLive = FolderViewer.build({
  // 1. List: the first file shown to start with.
  init: (input) => ({
    model: {
      ...input,
      selected: firstFile(input),
      showing: false,
      closed: [],
    },
  }),
  children: {
    // 2. Show
    file: Actor.child(FileViewerLive, {
      while: ({ model }) => model.selected !== null,
      key: ({ model }) => model.selected ?? '',
      input: ({ model }) => ({
        root: model.root,
        branch: model.branch,
        path: model.selected ?? '',
        base: model.base,
        status:
          model.changed.find(({ path }) => path === model.selected)?.status ??
          null,
        inside: true,
      }),
      emits: { Closed: () => ({ _tag: 'Back' }) },
    }),
  },
  on: {
    Selected: ({ path }) => ({ model: { selected: path, showing: true } }),
    Stepped: ({ by }, { model }) => {
      const order = filesInOrder(model);
      const at = model.selected === null ? -1 : order.indexOf(model.selected);
      const next = order[Math.min(order.length - 1, Math.max(0, at + by))];
      if (next === undefined || next === model.selected) return {};
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
    // A deleted file shown, once the deleted ones are left out, gives way
    // to the first file left; so does nothing shown, once they are back.
    DeletedToggled: (_, { model }) => {
      const next = { ...model, deleted: !model.deleted };
      const gone =
        !next.deleted &&
        model.changed.some(
          ({ path, status }) => path === model.selected && status === 'deleted',
        );
      return {
        model: {
          deleted: next.deleted,
          ...(gone || model.selected === null
            ? { selected: firstFile(next) }
            : {}),
        },
        emit: { _tag: 'DeletedToggled' },
      };
    },
    Back: () => ({ model: { showing: false } }),
    // 3. Close
    Closed: () => ({ emit: { _tag: 'Closed' } }),
  },
});
