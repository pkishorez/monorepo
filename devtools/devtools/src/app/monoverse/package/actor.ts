import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import {
  ChangedPathSchema,
  ImportSchema,
  PackageContentsSchema,
} from '../contract/index.js';
import { foldersHolding } from '../model/index.js';
import { Monorepo } from '../services/monorepo/index.js';
import { TreeLive, UnchangedSchema } from '../tree/index.js';

/*
 * One Package's view: its whole file tree at a branch, with what lies
 * outside its Source roots dimmed, and its file import graph as the tree's
 * links. The same for a Single Package and a Package entered from its
 * Monorepo.
 *
 * 1. Read   the Package's files, Source roots and imports at the branch
 *           its Props name, checked against the folder rule: every import
 *           of a file sitting directly in an ancestor folder is a
 *           Violation, a broken link. Again whenever the branch changes,
 *           the tree staying as it is while the new one is read.
 * 2. Show   the tree, with the Source roots open. A double click on a file
 *           Emits `Opened`; viewing a folder Emits `Viewed`.
 */

const State = Schema.TaggedUnion({
  Reading: {},
  Failed: { at: Schema.String, problem: Schema.String },
  Ready: {
    /** The branch and try it was read at. */
    at: Schema.String,
    contents: PackageContentsSchema,
    violations: Schema.Array(ImportSchema),
  },
});

export const Package = Actor.define('Package', {
  requires: [Monorepo],
  input: Schema.Struct({
    /** The project's folder, absolute. */
    root: Schema.String,
    /** The Package's folder, relative to it; `.` for a Single Package. */
    path: Schema.String,
    /** The Package's name, for its tree's root. */
    name: Schema.String,
  }),
  props: Schema.Struct({
    /** The branch to read; null: the folder as it is on disk. */
    branch: Schema.NullOr(Schema.String),
    /** What the branch changed since Compare-to; null while Changes is off. */
    changes: Schema.NullOr(Schema.Array(ChangedPathSchema)),
    /** How what it left unchanged is drawn, while Changes is on. */
    unchanged: UnchangedSchema,
  }),
  model: Schema.Struct({
    root: Schema.String,
    path: Schema.String,
    name: Schema.String,
    /** How many times it was asked to read again. */
    tries: Schema.Number,
  }),
  state: State,
  message: Schema.TaggedUnion({
    Read: {
      at: Schema.String,
      contents: PackageContentsSchema,
      violations: Schema.Array(ImportSchema),
    },
    Refused: { at: Schema.String, problem: Schema.String },
    Retried: {},
    Opened: { path: Schema.String },
    Viewed: { path: Schema.String, files: Schema.Array(Schema.String) },
  }),
  emits: {
    Opened: { path: Schema.String },
    Viewed: { path: Schema.String, files: Schema.Array(Schema.String) },
  },
});

/** What a read is keyed by: the branch, and the try. */
const readAt = (branch: string | null, tries: number) =>
  JSON.stringify([branch, tries]);

/** Whether the Package is being read: nothing read yet at the branch and try now named. */
export const isReading = (
  state: typeof State.Type,
  branch: string | null,
  tries: number,
): boolean => state._tag === 'Reading' || state.at !== readAt(branch, tries);

export const PackageLive = Package.build({
  init: ({ root, path, name }) => ({
    model: { root, path, name, tries: 0 },
    state: { _tag: 'Reading' },
  }),
  workers: {
    // 1. Read
    read: {
      each: ({ model, props, state }) => {
        return isReading(state, props.branch, model.tries)
          ? [readAt(props.branch, model.tries)]
          : [];
      },
      run: (self, at) =>
        Effect.gen(function* () {
          const { model, props } = yield* self.get;
          const monorepo = yield* Monorepo;
          const message = yield* monorepo
            .readPackage({
              root: model.root,
              branch: props.branch,
              path: model.path,
            })
            .pipe(
              Effect.map(({ contents, violations }) => ({
                _tag: 'Read' as const,
                at,
                contents,
                violations,
              })),
              Effect.catch(({ message: problem }) =>
                Effect.succeed({ _tag: 'Refused' as const, at, problem }),
              ),
            );
          yield* self.send(message);
        }),
    },
  },
  on: {
    Read: ({ at, contents, violations }, { model, props }) =>
      at === readAt(props.branch, model.tries)
        ? { state: { _tag: 'Ready', at, contents, violations } }
        : {},
    Refused: ({ at, problem }, { model, props }) =>
      at === readAt(props.branch, model.tries)
        ? { state: { _tag: 'Failed', at, problem } }
        : {},
    Retried: (_, { model }) => ({ model: { tries: model.tries + 1 } }),
    Opened: ({ path }) => ({ emit: { _tag: 'Opened', path } }),
    Viewed: ({ path, files }) => ({ emit: { _tag: 'Viewed', path, files } }),
  },
  states: {
    // 2. Show
    Ready: {
      children: {
        tree: Actor.child(TreeLive, {
          input: ({ state }) => ({
            open: [
              ...new Set([
                ...foldersHolding(
                  state.contents.path,
                  state.contents.sourceRoots,
                ),
                ...state.contents.sourceRoots.filter(
                  (root) => root !== state.contents.path,
                ),
              ]),
            ],
          }),
          props: ({ model, props, state }) => ({
            base: state.contents.path,
            name: model.name,
            files: state.contents.files,
            packages: [],
            links: state.contents.imports,
            broken: state.violations,
            sourceRoots: state.contents.sourceRoots,
            changes: props.changes,
            unchanged: props.unchanged,
          }),
          emits: {
            Opened: ({ path }) => ({ _tag: 'Opened', path }),
            Viewed: ({ path, files }) => ({ _tag: 'Viewed', path, files }),
          },
        }),
      },
    },
  },
});
