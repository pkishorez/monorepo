import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import { ChangedPathSchema, type ChangeStatus } from '../contract/index.js';
import { FileViewerLive } from '../file-viewer/index.js';
import { isIgnored, isWithin } from '../model/index.js';
import { UnchangedSchema } from '../tree/index.js';
import { fileTreeRows } from './file-tree.js';

/*
 * One folder looked into, the root included: its files as a tree of their
 * folders, drawn as the tree draws its own, by the same settings. While
 * Changes is on, each changed file is marked with how, and what the branch
 * left unchanged is listed as it is, dimmed or not at all; the files it
 * deleted are listed unless they are left out. A Package's files outside
 * its Source roots are dimmed, or left out. One file is shown beside the
 * list, as the branch has it or as its diff.
 *
 * 1. List    the files, each folder of which closes and opens again;
 *            every folder at once, down to the top level or all the way
 *            open; or everything inside one folder, all open or every
 *            folder in it closed, it staying open. The settings come from
 *            whoever holds it, and a change to one Emits it, so the
 *            tree changes with it.
 * 2. Show    the one chosen, else the first changed (or, with Changes off,
 *            the first file), in a FileViewer; one the settings leave out
 *            gives way to that first one. On a phone the list and the file
 *            take turns: choosing one shows it, and its back arrow goes
 *            back to the list. Stepping goes to the changed file before or
 *            after it in the list's order (any file, with Changes off),
 *            opening the closed folders on the way.
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
  /** Every file in it known, relative to the root. */
  files: Schema.Array(Schema.String),
  /** What the branch changed in it since Compare-to. */
  changed: Schema.Array(ChangedPathSchema),
  /** The Package's Source roots; null: nothing in it is ignored. */
  sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
});

/** How the list draws its files: the tree's settings. */
export const FolderSettingsSchema = Schema.Struct({
  unchanged: UnchangedSchema,
  deleted: Schema.Boolean,
  ignored: Schema.Boolean,
});
export type FolderSettings = typeof FolderSettingsSchema.Type;

/** The settings a FolderViewer starts with, mounted with none. */
export const defaultSettings: FolderSettings = {
  unchanged: 'dim',
  deleted: true,
  ignored: true,
};

export const FolderViewer = Actor.define('FolderViewer', {
  input: FolderInput,
  /** The settings; none: the defaults. */
  props: Schema.UndefinedOr(FolderSettingsSchema),
  model: Schema.Struct({
    ...FolderInput.fields,
    /** The file chosen; null: none yet, the first shown. */
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
    /** Every folder closed, the top level left; or, if any is, every one open. */
    AllToggled: {},
    /** Everything inside a folder open; or, if it all is, every folder in it closed. */
    InsideToggled: { path: Schema.String },
    UnchangedChosen: { unchanged: UnchangedSchema },
    DeletedToggled: {},
    IgnoredToggled: {},
    Back: {},
    Closed: {},
  }),
  emits: {
    Closed: {},
    UnchangedChosen: { unchanged: UnchangedSchema },
    DeletedToggled: {},
    IgnoredToggled: {},
  },
});

export interface FolderEntry {
  readonly path: string;
  /** How the branch changed it; null: unchanged, or Changes is off. */
  readonly status: ChangeStatus | null;
  /** Outside the Package's Source roots. */
  readonly ignored: boolean;
}

interface Listed {
  readonly base: string | null;
  readonly path: string;
  readonly files: ReadonlyArray<string>;
  readonly changed: ReadonlyArray<{ path: string; status: ChangeStatus }>;
  readonly sourceRoots: ReadonlyArray<string> | null;
}

/** What the list shows, by path, by the settings. */
export function entriesOf(
  model: Listed,
  settings: FolderSettings = defaultSettings,
): ReadonlyArray<FolderEntry> {
  const statusOf = new Map(
    model.base === null
      ? []
      : model.changed.map(({ path, status }) => [path, status] as const),
  );
  const paths =
    model.base === null
      ? model.files
      : settings.unchanged === 'hide'
        ? [...statusOf.keys()]
        : [...new Set([...model.files, ...statusOf.keys()])];
  const entries: Array<FolderEntry> = [];
  for (const path of paths) {
    const status = statusOf.get(path) ?? null;
    if (status === 'deleted' && !settings.deleted) continue;
    const ignored = isIgnored(path, model.sourceRoots);
    if (ignored && !settings.ignored) continue;
    entries.push({ path, status, ignored });
  }
  return entries.sort((a, b) => a.path.localeCompare(b.path));
}

/** Every file the list shows, in its order with every folder open. */
export const filesInOrder = (
  model: Listed,
  settings?: FolderSettings,
): ReadonlyArray<string> =>
  fileTreeRows(model.path, entriesOf(model, settings), new Set()).flatMap(
    (row) => (row.kind === 'file' ? [row.path] : []),
  );

/** Every folder the list can show, by the path of its row. */
export const foldersOf = (
  model: Listed,
  settings?: FolderSettings,
): ReadonlyArray<string> =>
  fileTreeRows(model.path, entriesOf(model, settings), new Set()).flatMap(
    (row) => (row.kind === 'folder' ? [row.path] : []),
  );

/** The files a step goes between: the changed ones while Changes is on, else all. */
export function stepsOf(
  model: Listed,
  settings?: FolderSettings,
): ReadonlyArray<string> {
  const order = filesInOrder(model, settings);
  if (model.base === null) return order;
  const changed = new Set(model.changed.map(({ path }) => path));
  return order.filter((path) => changed.has(path));
}

/** The file shown: the one chosen while the list shows it, else the first step. */
export function shownOf(
  model: Listed & { readonly selected: string | null },
  settings?: FolderSettings,
): string | null {
  const order = filesInOrder(model, settings);
  if (model.selected !== null && order.includes(model.selected))
    return model.selected;
  return stepsOf(model, settings)[0] ?? order[0] ?? null;
}

/**
 * The step `by` from the file shown: through the steps, from where it
 * sits in the list's order when it is not one; none past either end.
 */
export function stepFrom(
  model: Listed & { readonly selected: string | null },
  settings: FolderSettings | undefined,
  by: number,
): string | null {
  const steps = stepsOf(model, settings);
  const shown = shownOf(model, settings);
  if (shown === null || steps.length === 0 || by === 0) return null;
  let at = steps.indexOf(shown);
  if (at === -1) {
    // Between two steps: the first one past it is a step of one.
    const order = filesInOrder(model, settings);
    const place = order.indexOf(shown);
    const after = steps.findIndex((path) => order.indexOf(path) > place);
    const first = after === -1 ? steps.length : after;
    at = by > 0 ? first - 1 : first;
  }
  const next = steps[at + by];
  return next === undefined || next === shown ? null : next;
}

export const FolderViewerLive = FolderViewer.build({
  init: (input) => ({
    model: { ...input, selected: null, showing: false, closed: [] },
  }),
  children: {
    // 2. Show
    file: Actor.child(FileViewerLive, {
      while: ({ model, props }) => shownOf(model, props) !== null,
      key: ({ model, props }) => shownOf(model, props) ?? '',
      input: ({ model, props }) => {
        const shown = shownOf(model, props);
        return {
          root: model.root,
          branch: model.branch,
          path: shown ?? '',
          base: model.base,
          status:
            model.changed.find(({ path }) => path === shown)?.status ?? null,
          inside: true,
        };
      },
      emits: { Closed: () => ({ _tag: 'Back' }) },
    }),
  },
  on: {
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
    Back: () => ({ model: { showing: false } }),
    // 3. Close
    Closed: () => ({ emit: { _tag: 'Closed' } }),
  },
});
