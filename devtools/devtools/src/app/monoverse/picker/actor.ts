import { Effect, Schema } from 'effect';
import { Actor, Command } from '@kestack/kabuki';

import { MonoverseClient, problemOf } from '../client/index.js';
import {
  FolderListingSchema,
  ProjectEntrySchema,
  type FolderListing,
} from '../contract/index.js';
import {
  absolute,
  backTo,
  firstOf,
  hiddenOf,
  highlighted,
  highlightedTo,
  into,
  ListingSchema,
  loaded,
  ModelSchema,
  moved,
  OPEN_FOLDER,
  openFolders,
  shownOf,
  topOf,
  typed,
  waits,
  type Listing,
  type Model,
} from './steps/index.js';

/*
 * The Project Picker: which Project Monoverse shows, as the code app's
 * Project Picker chooses one, a stack of Steps with a search each.
 *
 * 1. Recent  the saved Projects, newest first, read once it starts. A
 *            Project picked Emits `Picked` at once. One can be removed from
 *            the list, gone from it at once and put back if the server
 *            refuses. "Open a folder…", after them whatever the search,
 *            goes to the folder Steps, searching what was typed.
 * 2. Folder  home's sub-folders, read ahead as it starts, then one Step per
 *            folder gone into, never above home (`steps/`). The top Step's
 *            listing is asked again for a search it does not cover: a
 *            hidden one (starting with `.`), or one cut short at 100, a
 *            moment after the typing stops. A typed path goes there.
 * 3. Choose  a folder chosen, the one highlighted or the one open, is
 *            added as a Project while the Picker waits, then Emits
 *            `Picked`; a refusal is said, and it can be chosen again.
 * 4. Close   `Dismissed` asks whoever holds it to close it.
 */

export const ProjectPicker = Actor.define('ProjectPicker', {
  requires: [MonoverseClient],
  input: Schema.Struct({ current: Schema.NullOr(Schema.String) }),
  props: Schema.UndefinedOr(
    Schema.Struct({
      /** The Project open now, marked in the list. */
      current: Schema.NullOr(Schema.String),
    }),
  ),
  model: ModelSchema,
  message: Schema.TaggedUnion({
    Typed: { query: Schema.String },
    /** The highlight moves `by` rows, down for 1 and up for -1. */
    Moved: { by: Schema.Finite },
    Highlighted: { value: Schema.String },
    /** Enter or a click on a row: a Project opens, a folder is gone into. */
    Picked: { value: Schema.String },
    /** Mod+Enter on a row, or "Open this folder" with null: chosen as a Project. */
    Chose: { on: Schema.NullOr(Schema.String) },
    Back: {},
    /** Back to `depth` folder Steps, 0 being Recent. */
    BackTo: { depth: Schema.Finite },
    Dismissed: {},
    RemoveAsked: { id: Schema.String },
    Removed: { id: Schema.String },
    RemoveRefused: { id: Schema.String, problem: Schema.String },
    Added: { project: ProjectEntrySchema },
    AddRefused: { problem: Schema.String },
    RecentRead: { projects: Schema.Array(ProjectEntrySchema) },
    RecentRefused: { problem: Schema.String },
    Retried: {},
    HomeFound: { listing: FolderListingSchema },
    Loaded: {
      segments: Schema.Array(Schema.String),
      listing: ListingSchema,
      home: Schema.NullOr(Schema.String),
    },
  }),
  emits: {
    Picked: { project: ProjectEntrySchema },
    Dismissed: {},
  },
});

/** A listing as the server gave it, for the search it answers. */
const listingOf = (
  listing: FolderListing,
  query: string,
  hidden: boolean,
): Listing => ({
  query,
  hidden,
  path: listing.path,
  kind: listing.kind,
  folders: listing.folders,
  truncated: listing.truncated,
  problem: null,
});

// A moment after the typing stops: each key typed stops the asking before.
const DEBOUNCE = '150 millis';

// 3. Choose
const add = Command.make('ProjectPicker.AddProject', {
  args: Schema.Struct({ path: Schema.String }),
  run: ({ path }) =>
    Effect.flatMap(MonoverseClient, (client) =>
      client.AddProject({ path }),
    ).pipe(
      Effect.map((project) => ({ _tag: 'Added' as const, project })),
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'AddRefused' as const,
          problem: problemOf(error),
        }),
      ),
    ),
});

// 1. Recent
const remove = Command.make('ProjectPicker.RemoveProject', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.flatMap(MonoverseClient, (client) =>
      client.RemoveProject({ id }),
    ).pipe(
      Effect.as({ _tag: 'Removed' as const, id }),
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'RemoveRefused' as const,
          id,
          problem: problemOf(error),
        }),
      ),
    ),
});

/** The Project the Recent row `value` is, if it is one. */
const projectAt = (model: Model, value: string) => {
  const row = shownOf(model, null).rows.find((each) => each.value === value);
  return row?._tag === 'Project' ? row.project : null;
};

/** What a pick or a choice does on Recent: open a Project, or go to the folders. */
const onRecent = (model: Model, value: string) => {
  if (value === OPEN_FOLDER) return { model: openFolders(model) };
  const project = projectAt(model, value);
  return project === null ? {} : { emit: { _tag: 'Picked' as const, project } };
};

export const ProjectPickerLive = ProjectPicker.build({
  init: ({ current }) => ({
    model: {
      current,
      home: null,
      homeListing: null,
      recent: null,
      recentProblem: null,
      query: '',
      highlighted: '',
      folders: [],
      removing: [],
      adding: null,
      problem: null,
    },
  }),
  workers: {
    // 1. Recent, read again after a refusal only when asked.
    recent: {
      each: ({ model }) =>
        model.recent === null && model.recentProblem === null ? ['read'] : [],
      run: (self) =>
        Effect.flatMap(MonoverseClient, (client) => client.ListProjects()).pipe(
          Effect.map((projects) => ({
            _tag: 'RecentRead' as const,
            projects,
          })),
          Effect.catch((error) =>
            Effect.succeed({
              _tag: 'RecentRefused' as const,
              problem: problemOf(error),
            }),
          ),
          Effect.flatMap((message) => self.send(message)),
        ),
    },
    // 2. Folder: home read ahead, which also says where home is. A failure
    // is said by the folder Step, which asks again.
    home: {
      each: ({ model }) => (model.home === null ? ['home'] : []),
      run: (self) =>
        Effect.flatMap(MonoverseClient, (client) =>
          client.ListFolders({ path: null, query: '', hidden: false }),
        ).pipe(
          Effect.flatMap((listing) =>
            self.send({ _tag: 'HomeFound', listing }),
          ),
          Effect.ignore,
        ),
    },
    // 2. Folder: the top Step, for a search its listing does not cover.
    load: {
      each: ({ model }) => {
        const top = topOf(model);
        if (top === null || !waits(top)) return [];
        const query = top.query.trim();
        return [JSON.stringify([top.segments, query, hiddenOf(query)])];
      },
      run: (self, key) =>
        Effect.gen(function* () {
          const [segments, query, hidden] = JSON.parse(key) as [
            ReadonlyArray<string>,
            string,
            boolean,
          ];
          if (query !== '') yield* Effect.sleep(DEBOUNCE);
          const client = yield* MonoverseClient;
          const { model } = yield* self.get;
          const message = yield* Effect.gen(function* () {
            // Below home, the folder is written out from home, found first
            // if no listing has said where it is yet.
            const home =
              segments.length === 0
                ? null
                : (model.home ??
                  (yield* client.ListFolders({
                    path: null,
                    query: '',
                    hidden: false,
                  })).home);
            const listing = yield* client.ListFolders({
              path: home === null ? null : absolute(home, segments),
              query,
              hidden,
            });
            return {
              _tag: 'Loaded' as const,
              segments,
              listing: listingOf(listing, query, hidden),
              home: listing.home,
            };
          }).pipe(
            Effect.catch((error) =>
              Effect.succeed({
                _tag: 'Loaded' as const,
                segments,
                listing: {
                  query,
                  hidden,
                  path: '',
                  kind: null,
                  folders: [],
                  truncated: false,
                  problem: problemOf(error),
                },
                home: null,
              }),
            ),
          );
          yield* self.send(message);
        }),
    },
  },
  on: {
    Typed: ({ query }, { model }) =>
      model.adding !== null ? {} : { model: typed(model, query) },
    Moved: ({ by }, { model }) => ({ model: moved(model, by) }),
    Highlighted: ({ value }, { model }) => ({
      model: highlightedTo(model, value),
    }),
    // 1. Recent, 2. Folder
    Picked: ({ value }, { model }) => {
      if (model.adding !== null) return {};
      if (topOf(model) === null) return onRecent(model, value);
      const row = shownOf(model, null).rows.find(
        (each) => each.value === value,
      );
      return row?._tag === 'Folder'
        ? { model: into(model, row.folder.name) }
        : {};
    },
    // 3. Choose
    Chose: ({ on }, { model }) => {
      if (model.adding !== null) return {};
      if (topOf(model) === null) return on === null ? {} : onRecent(model, on);
      const shown = shownOf(model, null);
      const row =
        on === null ? null : shown.rows.find((each) => each.value === on);
      const path =
        row?._tag === 'Folder' ? row.folder.path : (shown.where?.path ?? null);
      return path === null
        ? {}
        : {
            model: { ...model, adding: path, problem: null },
            command: add({ path }),
          };
    },
    Added: ({ project }, { model }) => ({
      model: {
        ...model,
        adding: null,
        recent: [
          project,
          ...(model.recent ?? []).filter(({ id }) => id !== project.id),
        ],
      },
      emit: { _tag: 'Picked', project },
    }),
    AddRefused: ({ problem }, { model }) => ({
      model: { ...model, adding: null, problem },
    }),
    Back: (_, { model }) => ({
      model: backTo(model, model.folders.length - 1),
    }),
    BackTo: ({ depth }, { model }) => ({ model: backTo(model, depth) }),
    // 4. Close
    Dismissed: () => ({ emit: { _tag: 'Dismissed' } }),
    // 1. Recent: gone at once, the highlight on the row that took its place.
    RemoveAsked: ({ id }, { model }) => {
      if (model.removing.includes(id) || topOf(model) !== null) return {};
      const before = shownOf(model, null).rows.map(({ value }) => value);
      const at = before.indexOf(model.highlighted);
      const next: Model = {
        ...model,
        removing: [...model.removing, id],
        problem: null,
      };
      const after = shownOf(next, null).rows.map(({ value }) => value);
      const kept = after.includes(model.highlighted)
        ? model.highlighted
        : (after[Math.min(Math.max(at, 0), after.length - 1)] ?? '');
      return {
        model: { ...next, highlighted: kept },
        command: remove({ id }),
      };
    },
    Removed: ({ id }, { model }) => ({
      model: {
        ...model,
        recent: model.recent?.filter((project) => project.id !== id) ?? null,
        removing: model.removing.filter((each) => each !== id),
      },
    }),
    RemoveRefused: ({ id, problem }, { model }) => ({
      model: {
        ...model,
        removing: model.removing.filter((each) => each !== id),
        problem,
      },
    }),
    RecentRead: ({ projects }, { model }) => {
      const before = topOf(model) === null ? firstOf(model) : undefined;
      const read = { ...model, recent: projects, recentProblem: null };
      return {
        model: topOf(model) === null ? highlighted(read, { before }) : read,
      };
    },
    RecentRefused: ({ problem }, { model }) => ({
      model: { ...model, recentProblem: problem },
    }),
    Retried: (_, { model }) => ({
      model: { ...model, recentProblem: null },
    }),
    // 2. Folder: home read ahead, handed to its Step if it waits for it.
    HomeFound: ({ listing }, { model }) => {
      const home = listingOf(listing, '', false);
      const read: Model = { ...model, home: listing.home, homeListing: home };
      const first = model.folders[0];
      if (first === undefined || first.listing !== null) return { model: read };
      return {
        model:
          model.folders.length === 1
            ? loaded(read, [], home)
            : {
                ...read,
                folders: [
                  { ...first, listing: home },
                  ...model.folders.slice(1),
                ],
              },
      };
    },
    Loaded: ({ segments, listing, home }, { model }) => ({
      model: loaded({ ...model, home: home ?? model.home }, segments, listing),
    }),
  },
});
