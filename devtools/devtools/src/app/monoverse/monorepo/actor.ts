import { Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import {
  ChangedPathSchema,
  ImportSchema,
  WorkspaceSchema,
} from '../contract/index.js';
import { foldersHolding, rootRelative } from '../model/index.js';
import { PackageLive } from '../package/index.js';
import { TreeLive, UnchangedSchema } from '../tree/index.js';

/*
 * A Monorepo: its real folder tree, each Package one closed node in its
 * own colour, and the Package entered, if one is.
 *
 * 1. Explore  the tree. What a Package depends on and what depends on it
 *             are the tree's links, so selecting one lights up both, as
 *             selecting a folder lights up what the Packages in it use;
 *             the links of a Package cycle are broken.
 * 2. Enter    a double click on a Package Emits `Entered`; whoever holds
 *             the Monorepo names it back in the Props, and its Package
 *             view opens in the tree's place. The tree stays as it was
 *             beneath it, for when the Props name none again.
 * 3. Open     a double click on a file, here or in the Package, Emits
 *             `Opened`; viewing a folder Emits `Viewed`.
 */

export const Monorepo = Actor.define('Monorepo', {
  props: Schema.Struct({
    /** The project's folder, absolute. */
    root: Schema.String,
    /** The project's name, for its tree's root. */
    name: Schema.String,
    /** The branch it was analysed at; null: the folder as it is on disk. */
    branch: Schema.NullOr(Schema.String),
    workspace: WorkspaceSchema,
    /** Each Package's dependencies, as links between their folders. */
    links: Schema.Array(ImportSchema),
    /** The links that close a Package cycle. */
    cycles: Schema.Array(ImportSchema),
    /** The Package entered, by its folder; null for the tree. */
    package: Schema.NullOr(Schema.String),
    /** What the branch changed since Compare-to; null while Changes is off. */
    changes: Schema.NullOr(Schema.Array(ChangedPathSchema)),
    /** How what it left unchanged is drawn, while Changes is on. */
    unchanged: UnchangedSchema,
    /** Whether the files outside the Source roots are drawn, dimmed. */
    ignored: Schema.Boolean,
  }),
  message: Schema.TaggedUnion({
    Entered: { path: Schema.String },
    Opened: { path: Schema.String },
    Viewed: {
      path: Schema.String,
      files: Schema.Array(Schema.String),
      sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
    },
  }),
  emits: {
    Entered: { path: Schema.String },
    Opened: { path: Schema.String },
    Viewed: {
      path: Schema.String,
      files: Schema.Array(Schema.String),
      sourceRoots: Schema.NullOr(Schema.Array(Schema.String)),
    },
  },
});

export const MonorepoLive = Monorepo.build({
  children: {
    // 1. Explore
    tree: Actor.child(TreeLive, {
      // The folders holding Packages start open, so every Package shows.
      input: ({ props }) => ({
        open: foldersHolding(
          '',
          props.workspace.packages.map(({ path }) => rootRelative(path)),
        ),
      }),
      props: ({ props }) => ({
        base: '',
        name: props.name,
        files: props.workspace.files,
        packages: props.workspace.packages.map(({ path, name, version }) => ({
          path: rootRelative(path),
          name,
          ...(version === undefined ? {} : { version }),
        })),
        links: props.links,
        broken: props.cycles,
        sourceRoots: null,
        changes: props.changes,
        unchanged: props.unchanged,
        ignored: props.ignored,
      }),
      emits: {
        Entered: ({ path }) => ({ _tag: 'Entered', path }),
        Opened: ({ path }) => ({ _tag: 'Opened', path }),
        Viewed: ({ path, files, sourceRoots }) => ({
          _tag: 'Viewed',
          path,
          files,
          sourceRoots,
        }),
      },
    }),
    // 2. Enter
    package: Actor.child(PackageLive, {
      while: ({ props }) => props.package !== null,
      key: ({ props }) => props.package ?? '',
      input: ({ props }) => ({
        root: props.root,
        path: props.package ?? '.',
        name:
          props.workspace.packages.find(({ path }) => path === props.package)
            ?.name ??
          props.package ??
          '',
      }),
      props: ({ props }) => ({
        branch: props.branch,
        changes: props.changes,
        unchanged: props.unchanged,
        ignored: props.ignored,
      }),
      emits: {
        Opened: ({ path }) => ({ _tag: 'Opened', path }),
        Viewed: ({ path, files, sourceRoots }) => ({
          _tag: 'Viewed',
          path,
          files,
          sourceRoots,
        }),
      },
    }),
  },
  on: {
    Entered: ({ path }) => ({ emit: { _tag: 'Entered', path } }),
    Opened: ({ path }) => ({ emit: { _tag: 'Opened', path } }),
    Viewed: ({ path, files, sourceRoots }) => ({
      emit: { _tag: 'Viewed', path, files, sourceRoots },
    }),
  },
});
