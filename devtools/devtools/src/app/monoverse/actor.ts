import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

import {
  BranchesSchema,
  ChangedPathSchema,
  ImportSchema,
  ProjectEntrySchema,
  WorkspaceSchema,
} from './contract/index.js';
import type { ProjectEntry } from './contract/index.js';
import { isWithin } from './model/index.js';
import { FileViewerLive } from './file-viewer/index.js';
import { FolderViewerLive } from './folder-viewer/index.js';
import { changesBlocked } from './git-controls/index.js';
import { MonorepoLive } from './monorepo/index.js';
import { PackageLive } from './package/index.js';
import { ProjectPickerLive } from './picker/index.js';
import { UnchangedSchema } from './tree/index.js';
import { Monorepo } from './services/monorepo/index.js';

/*
 * Monoverse: a codebase shown as its folder tree, and checked. It knows
 * nothing of URLs: whoever mounts it hands it a Place, may hand it another
 * from then on, and hears of every move the user makes, as the Place it
 * moved to. Mounted on its own, as the root, it is handed none and follows
 * only the user.
 *
 * 1. List     the saved projects, from the server, to find the folder of
 *             the project a Place names.
 * 2. Pick     with no project, or one not saved, the picker fills the page;
 *             from an open project, the breadcrumb opens it over the page.
 *             Picking one opens it, at its current branch.
 * 3. Follow   the Place the Props name, whenever it is another than the
 *             one shown, as Back and Forward do: the same Monoverse moves
 *             there, and says nothing, since whoever named it knows. Its
 *             own move, handed back, names the Place it shows already:
 *             nothing happens.
 * 4. Analyse  the project at the branch: a Monorepo opens its tree, a
 *             Single Package straight its Package. Choosing another branch
 *             analyses it again, the views staying on screen meanwhile.
 * 5. Git      the branches as the project opens: which one its folder is
 *             on, and what Compare to starts at. A branch or Compare to
 *             the Place does not name is that one. While Changes is on,
 *             what the branch changed since Compare-to is read, and handed
 *             down to colour the tree; the files it deleted are drawn
 *             unless they are left out, here or in a folder looked into;
 *             what it left unchanged is drawn as it is, faded (the
 *             default) or not at all.
 * 6. Enter    a Package of the Monorepo, by a double click on it; the
 *             project's crumb goes back to the Monorepo's tree.
 * 7. View     a file opens in a dialog over the tree, as the branch has
 *             it, or as its diff while Changes is on and the branch changed
 *             it; a folder, the root included, opens there as the list of
 *             what changed in it while Changes is on, else of every file
 *             in it. One of the two at a time.
 */

/** Where Monoverse is: the project, the Package in it, and how it is read. */
export const PlaceSchema = Schema.Struct({
  /** The saved project shown, by its id; null: the picker. */
  project: Schema.NullOr(Schema.String),
  /** The Package of a Monorepo entered, by its folder; null: the Monorepo's tree. */
  package: Schema.NullOr(Schema.String),
  /** The branch shown; null: the one the project's folder is on. */
  branch: Schema.NullOr(Schema.String),
  /** The branch compared to; null: `main`, else `master`, else `develop`. */
  base: Schema.NullOr(Schema.String),
  /** Whether what the branch changed since Compare-to is coloured. */
  changes: Schema.Boolean,
});
export type Place = typeof PlaceSchema.Type;

const Open = {
  /** The saved project open, by its id. */
  project: Schema.String,
  /** Its folder, absolute. */
  root: Schema.String,
};

/** What an analysis was read at: the branch, and how many reloads. */
const Analysed = {
  at: Schema.String,
  workspace: WorkspaceSchema,
};

const State = Schema.TaggedUnion({
  Picking: {},
  /** A project named before the saved ones are listed. */
  Finding: { project: Schema.String },
  Opening: Open,
  Failed: {
    ...Open,
    at: Schema.String,
    problem: Schema.String,
    missing: Schema.Boolean,
  },
  Monorepo: {
    ...Open,
    ...Analysed,
    links: Schema.Array(ImportSchema),
    cycles: Schema.Array(ImportSchema),
  },
  /** A Single Package. */
  Package: { ...Open, ...Analysed },
});
type State = typeof State.Type;

const Model = Schema.Struct({
  /** The saved projects, newest first; null until they are listed. */
  projects: Schema.NullOr(Schema.Array(ProjectEntrySchema)),
  /** Why they could not be listed. */
  projectsProblem: Schema.NullOr(Schema.String),
  package: Schema.NullOr(Schema.String),
  branch: Schema.NullOr(Schema.String),
  base: Schema.NullOr(Schema.String),
  changes: Schema.Boolean,
  /** The repository's branches; null until read. */
  branches: Schema.NullOr(BranchesSchema),
  /** Why they could not be read: not a git repository, say. */
  gitProblem: Schema.NullOr(Schema.String),
  /** What the branch changed since Compare-to, and what it was read at. */
  changed: Schema.NullOr(
    Schema.Struct({
      at: Schema.String,
      files: Schema.Array(ChangedPathSchema),
    }),
  ),
  changesProblem: Schema.NullOr(Schema.String),
  /** Whether the files the branch deleted are drawn, and listed. */
  deleted: Schema.Boolean,
  /** How what the branch left unchanged is drawn, while Changes is on. */
  unchanged: UnchangedSchema,
  /** The file open over the tree, relative to the root. */
  file: Schema.NullOr(Schema.String),
  /** The folder open over the tree, and every file in it. */
  folder: Schema.NullOr(
    Schema.Struct({
      path: Schema.String,
      files: Schema.Array(Schema.String),
    }),
  ),
  /** The picker is open over an open project. */
  switching: Schema.Boolean,
  /** How many times the project was asked to be read again. */
  reloads: Schema.Number,
});
type Model = typeof Model.Type;

export const Monoverse = Actor.define('Monoverse', {
  requires: [Monorepo],
  /** Where to start. */
  input: PlaceSchema,
  /**
   * Where to be, from whoever mounts it; nothing at all for a Monoverse
   * mounted on its own.
   */
  props: Schema.UndefinedOr(PlaceSchema),
  model: Model,
  state: State,
  message: Schema.TaggedUnion({
    Listed: { projects: Schema.Array(ProjectEntrySchema) },
    ListRefused: { problem: Schema.String },
    Followed: { place: PlaceSchema },
    Switching: {},
    Picked: { project: ProjectEntrySchema },
    Dismissed: {},
    Analysed: {
      at: Schema.String,
      workspace: WorkspaceSchema,
      links: Schema.Array(ImportSchema),
      cycles: Schema.Array(ImportSchema),
    },
    AnalyseRefused: {
      at: Schema.String,
      problem: Schema.String,
      missing: Schema.Boolean,
    },
    Retried: {},
    BranchesRead: { branches: BranchesSchema },
    BranchesRefused: { problem: Schema.String },
    BranchChosen: { branch: Schema.String },
    BaseChosen: { base: Schema.String },
    ChangesToggled: {},
    DeletedToggled: {},
    UnchangedChosen: { unchanged: UnchangedSchema },
    ChangesRead: { at: Schema.String, files: Schema.Array(ChangedPathSchema) },
    ChangesRefused: { at: Schema.String, problem: Schema.String },
    Entered: { package: Schema.String },
    Left: {},
    FileOpened: { path: Schema.String },
    FileClosed: {},
    FolderViewed: { path: Schema.String, files: Schema.Array(Schema.String) },
    FolderClosed: {},
  }),
  emits: { Moved: PlaceSchema.fields },
});

/** The saved project open, in any State that names one. */
export const projectOf = (state: State): string | null =>
  'project' in state ? state.project : null;

/** The project's folder, in any State that has one. */
export const rootOf = (state: State): string | null =>
  'root' in state ? state.root : null;

/** The Place shown. */
export const placeOf = (model: Model, state: State): Place => ({
  project: projectOf(state),
  package: model.package,
  branch: model.branch,
  base: model.base,
  changes: model.changes,
});

const samePlace = (a: Place, b: Place) =>
  a.project === b.project &&
  a.package === b.package &&
  a.branch === b.branch &&
  a.base === b.base &&
  a.changes === b.changes;

/** The branch shown, by name: the one named, else the folder's own. */
export const branchOf = (model: Model): string | null =>
  model.branch ?? model.branches?.current ?? null;

/** The branch compared to, by name: the one named, else the default. */
export const baseOf = (model: Model): string | null =>
  model.base ?? model.branches?.defaultBase ?? null;

/** What an analysis is keyed by: the branch named, and the reloads. */
const analysisAt = (model: Model) =>
  JSON.stringify([model.branch, model.reloads]);

/** Whether the project on screen is being analysed again, at another branch. */
export const isRereading = (model: Model, state: State): boolean =>
  (state._tag === 'Monorepo' || state._tag === 'Package') &&
  state.at !== analysisAt(model);

/** What a change set is keyed by; null while Changes cannot be shown. */
const changesAt = (model: Model, state: State): string | null => {
  const root = rootOf(state);
  const base = baseOf(model);
  if (!model.changes || root === null || base === null) return null;
  if (state._tag !== 'Monorepo' && state._tag !== 'Package') return null;
  const blocked = changesBlocked({
    branches: model.branches,
    problem: model.gitProblem,
    branch: branchOf(model),
    base,
  });
  if (blocked !== null) return null;
  return JSON.stringify([root, model.branch, base, model.reloads]);
};

/** What the tree is coloured with: the change set read at the Place shown, if any. */
export const changesOf = (model: Model, state: State) => {
  const at = changesAt(model, state);
  return at !== null && model.changed?.at === at ? model.changed.files : null;
};

/** What the tree is coloured with, the deleted files left out unless they are drawn. */
export const shownChangesOf = (model: Model, state: State) => {
  const changes = changesOf(model, state);
  return changes === null || model.deleted
    ? changes
    : changes.filter(({ status }) => status !== 'deleted');
};

/** Where a saved project opens. */
const opening = (
  projects: ReadonlyArray<ProjectEntry> | null,
  project: string,
): State => {
  if (projects === null) return { _tag: 'Finding', project };
  const entry = projects.find((one) => one.id === project);
  if (entry === undefined) return { _tag: 'Picking' };
  return { _tag: 'Opening', project, root: entry.path };
};

/** Leaving a project forgets what was read of it. */
const leaving = {
  branches: null,
  gitProblem: null,
  changed: null,
  changesProblem: null,
  file: null,
  folder: null,
  switching: false,
} satisfies Partial<Model>;

const moved = (place: Place) => ({ _tag: 'Moved' as const, ...place });

export const MonoverseLive = Monoverse.build({
  init: (place) => ({
    model: {
      projects: null,
      projectsProblem: null,
      package: place.package,
      branch: place.branch,
      base: place.base,
      changes: place.changes,
      deleted: true,
      unchanged: 'dim',
      ...leaving,
      reloads: 0,
    },
    state:
      place.project === null
        ? { _tag: 'Picking' }
        : { _tag: 'Finding', project: place.project },
  }),
  workers: {
    // 1. List
    projects: {
      run: (self) =>
        Effect.gen(function* () {
          const monorepo = yield* Monorepo;
          const message = yield* monorepo.projects().pipe(
            Effect.map((projects) => ({ _tag: 'Listed' as const, projects })),
            Effect.catch(({ message: problem }) =>
              Effect.succeed({ _tag: 'ListRefused' as const, problem }),
            ),
          );
          yield* self.send(message);
        }),
    },
    // 3. Follow: once for each Place the Props name.
    follow: {
      each: ({ props }) => (props === undefined ? [] : [JSON.stringify(props)]),
      run: (self, place) =>
        self.send({ _tag: 'Followed', place: JSON.parse(place) as Place }),
    },
    // 4. Analyse: while opening, or once the branch named is another than
    // the one analysed.
    analyse: {
      each: ({ model, state }) => {
        const at = analysisAt(model);
        if (state._tag === 'Opening') return [at];
        if (
          (state._tag === 'Monorepo' ||
            state._tag === 'Package' ||
            state._tag === 'Failed') &&
          state.at !== at
        )
          return [at];
        return [];
      },
      run: (self, at) =>
        Effect.gen(function* () {
          const { model, state } = yield* self.get;
          const root = rootOf(state);
          if (root === null) return;
          const monorepo = yield* Monorepo;
          const message = yield* monorepo
            .analyse({ root, branch: model.branch })
            .pipe(
              Effect.map((analysis) => ({
                _tag: 'Analysed' as const,
                at,
                ...analysis,
              })),
              Effect.catch(({ message: problem, reason }) =>
                Effect.succeed({
                  _tag: 'AnalyseRefused' as const,
                  at,
                  problem,
                  missing: reason === 'missing',
                }),
              ),
            );
          yield* self.send(message);
        }),
    },
    // 5. Git: the branches, once per project open and reload.
    branches: {
      each: ({ model, state }) => {
        const root = rootOf(state);
        return root === null ? [] : [JSON.stringify([root, model.reloads])];
      },
      run: (self, key) =>
        Effect.gen(function* () {
          const [root] = JSON.parse(key) as [string];
          const monorepo = yield* Monorepo;
          const message = yield* monorepo.branches({ root }).pipe(
            Effect.map((branches) => ({
              _tag: 'BranchesRead' as const,
              branches,
            })),
            Effect.catch(({ message: problem }) =>
              Effect.succeed({ _tag: 'BranchesRefused' as const, problem }),
            ),
          );
          yield* self.send(message);
        }),
    },
    // 5. Git: what the branch changed, while Changes is on.
    changes: {
      each: ({ model, state }) => {
        const at = changesAt(model, state);
        return at === null || model.changed?.at === at ? [] : [at];
      },
      run: (self, at) =>
        Effect.gen(function* () {
          const [root, branch, base] = JSON.parse(at) as [
            string,
            string | null,
            string,
          ];
          const monorepo = yield* Monorepo;
          const message = yield* monorepo.changes({ root, branch, base }).pipe(
            Effect.map(({ files }) => ({
              _tag: 'ChangesRead' as const,
              at,
              files,
            })),
            Effect.catch(({ message: problem }) =>
              Effect.succeed({
                _tag: 'ChangesRefused' as const,
                at,
                problem,
              }),
            ),
          );
          yield* self.send(message);
        }),
    },
  },
  children: {
    // 2. Pick: the whole page with no project, or over an open one.
    picker: Actor.child(ProjectPickerLive, {
      while: ({ model, state }) => state._tag === 'Picking' || model.switching,
      key: ({ state }) => (state._tag === 'Picking' ? 'page' : 'dialog'),
      input: ({ state }) => ({ current: projectOf(state) }),
      props: ({ state }) => ({ current: projectOf(state) }),
      emits: {
        Picked: ({ project }) => ({ _tag: 'Picked', project }),
        Dismissed: () => ({ _tag: 'Dismissed' }),
      },
    }),
    // 7. View
    file: Actor.child(FileViewerLive, {
      while: ({ model, state }) =>
        model.file !== null &&
        (state._tag === 'Monorepo' || state._tag === 'Package'),
      key: ({ model, state }) => {
        const changes = changesOf(model, state);
        return JSON.stringify([
          rootOf(state),
          model.branch,
          model.file,
          changes === null ? null : baseOf(model),
          changes === null,
          model.reloads,
        ]);
      },
      input: ({ model, state }) => {
        const changes = changesOf(model, state);
        return {
          root: rootOf(state) ?? '',
          branch: model.branch,
          path: model.file ?? '',
          base: changes === null ? null : baseOf(model),
          inside: false,
          status:
            changes?.find((change) => change.path === model.file)?.status ??
            null,
        };
      },
      emits: { Closed: () => ({ _tag: 'FileClosed' }) },
    }),
    folder: Actor.child(FolderViewerLive, {
      while: ({ model, state }) =>
        model.folder !== null &&
        (state._tag === 'Monorepo' || state._tag === 'Package'),
      key: ({ model, state }) => {
        const changes = changesOf(model, state);
        return JSON.stringify([
          rootOf(state),
          model.branch,
          model.folder?.path,
          changes === null ? null : baseOf(model),
          changes === null,
          model.reloads,
        ]);
      },
      input: ({ model, state }) => {
        const changes = changesOf(model, state);
        const path = model.folder?.path ?? '';
        return {
          root: rootOf(state) ?? '',
          branch: model.branch,
          base: changes === null ? null : baseOf(model),
          path,
          title:
            path === ''
              ? (model.projects?.find((one) => one.id === projectOf(state))
                  ?.name ?? 'The project')
              : path,
          files: model.folder?.files ?? [],
          changed: (changes ?? []).filter((change) =>
            isWithin(change.path, path),
          ),
          deleted: model.deleted,
        };
      },
      emits: {
        Closed: () => ({ _tag: 'FolderClosed' }),
        DeletedToggled: () => ({ _tag: 'DeletedToggled' }),
      },
    }),
  },
  on: {
    // 1. List
    Listed: ({ projects }, { model, state }) => {
      if (state._tag !== 'Finding')
        return { model: { projects, projectsProblem: null } };
      const next = opening(projects, state.project);
      return {
        model: { projects, projectsProblem: null },
        state: next,
        // A project not saved shows the picker, and the Place says so.
        ...(next._tag === 'Picking'
          ? { emit: moved({ ...placeOf(model, next), package: null }) }
          : {}),
      };
    },
    ListRefused: ({ problem }, { state }) => ({
      model: { projectsProblem: problem },
      ...(state._tag === 'Finding'
        ? { state: { _tag: 'Picking' as const } }
        : {}),
    }),
    // 2. Pick
    Switching: () => ({ model: { switching: true } }),
    Dismissed: () => ({ model: { switching: false } }),
    Picked: ({ project }, { model, state }) => {
      const projects =
        model.projects?.some((one) => one.id === project.id) === true
          ? model.projects
          : [project, ...(model.projects ?? [])];
      if (projectOf(state) === project.id)
        return { model: { projects, switching: false } };
      // Another project opens at its own current branch and default base.
      const fresh = {
        ...leaving,
        projects,
        package: null,
        branch: null,
        base: null,
      };
      const next = {
        _tag: 'Opening' as const,
        project: project.id,
        root: project.path,
      };
      return {
        model: fresh,
        state: next,
        emit: moved(placeOf({ ...model, ...fresh }, next)),
      };
    },
    // 3. Follow
    Followed: ({ place }, { model, state }) => {
      if (samePlace(place, placeOf(model, state))) return {};
      const where = {
        package: place.package,
        branch: place.branch,
        base: place.base,
        changes: place.changes,
      };
      if (place.project !== projectOf(state))
        return {
          model: { ...leaving, ...where },
          state:
            place.project === null
              ? { _tag: 'Picking' as const }
              : opening(model.projects, place.project),
        };
      return {
        model: {
          ...where,
          ...(place.package === model.package
            ? {}
            : { file: null, folder: null }),
        },
      };
    },
    // 4. Analyse
    Analysed: ({ at, workspace, links, cycles }, { model, state }) => {
      const root = rootOf(state);
      const project = projectOf(state);
      if (root === null || project === null || at !== analysisAt(model))
        return {};
      return {
        state:
          workspace.kind === 'single-package'
            ? { _tag: 'Package', project, root, at, workspace }
            : { _tag: 'Monorepo', project, root, at, workspace, links, cycles },
      };
    },
    AnalyseRefused: ({ at, problem, missing }, { model, state }) => {
      const root = rootOf(state);
      const project = projectOf(state);
      if (root === null || project === null || at !== analysisAt(model))
        return {};
      return {
        state: { _tag: 'Failed', project, root, at, problem, missing },
      };
    },
    Retried: (_, { model, state }) => {
      const reloads = model.reloads + 1;
      if (state._tag === 'Picking' || state._tag === 'Finding')
        return { model: { reloads } };
      return {
        model: { reloads, gitProblem: null, changesProblem: null },
        ...(state._tag === 'Failed'
          ? {
              state: {
                _tag: 'Opening' as const,
                project: state.project,
                root: state.root,
              },
            }
          : {}),
      };
    },
    // 5. Git
    BranchesRead: ({ branches }) => ({
      model: { branches, gitProblem: null },
    }),
    BranchesRefused: ({ problem }) => ({
      model: { branches: null, gitProblem: problem },
    }),
    BranchChosen: ({ branch }, { model, state }) => {
      // The folder's own branch is named as none, so the address stays bare.
      const named = branch === model.branches?.current ? null : branch;
      if (named === model.branch) return {};
      const next = { ...model, branch: named };
      return {
        model: { branch: named },
        emit: moved(placeOf(next, state)),
      };
    },
    BaseChosen: ({ base }, { model, state }) => {
      const named = base === model.branches?.defaultBase ? null : base;
      if (named === model.base) return {};
      const next = { ...model, base: named };
      return { model: { base: named }, emit: moved(placeOf(next, state)) };
    },
    ChangesToggled: (_, { model, state }) => {
      const next = { ...model, changes: !model.changes };
      return {
        model: { changes: next.changes, changesProblem: null },
        emit: moved(placeOf(next, state)),
      };
    },
    DeletedToggled: (_, { model }) => ({ model: { deleted: !model.deleted } }),
    UnchangedChosen: ({ unchanged }) => ({ model: { unchanged } }),
    ChangesRead: ({ at, files }, { model, state }) =>
      at === changesAt(model, state)
        ? { model: { changed: { at, files }, changesProblem: null } }
        : {},
    ChangesRefused: ({ at, problem }, { model, state }) =>
      at === changesAt(model, state)
        ? { model: { changesProblem: problem } }
        : {},
    // 6. Enter
    Entered: ({ package: path }, { model, state }) => {
      if (state._tag !== 'Monorepo' || path === model.package) return {};
      const next = { ...model, package: path };
      return {
        model: { package: path, file: null, folder: null },
        emit: moved(placeOf(next, state)),
      };
    },
    Left: (_, { model, state }) => {
      if (model.package === null) return {};
      const next = { ...model, package: null };
      return {
        model: { package: null, file: null, folder: null },
        emit: moved(placeOf(next, state)),
      };
    },
    // 7. View
    FileOpened: ({ path }) => ({ model: { file: path, folder: null } }),
    FileClosed: () => ({ model: { file: null } }),
    FolderViewed: ({ path, files }) => ({
      model: { folder: { path, files }, file: null },
    }),
    FolderClosed: () => ({ model: { folder: null } }),
  },
  states: {
    Monorepo: {
      children: {
        monorepo: Actor.child(MonorepoLive, {
          props: ({ model, state }) => ({
            root: state.root,
            name:
              model.projects?.find((one) => one.id === state.project)?.name ??
              state.workspace.name,
            branch: model.branch,
            workspace: state.workspace,
            links: state.links,
            cycles: state.cycles,
            package: model.package,
            changes: shownChangesOf(model, state),
            unchanged: model.unchanged,
          }),
          emits: {
            Entered: ({ path }) => ({ _tag: 'Entered', package: path }),
            Opened: ({ path }) => ({ _tag: 'FileOpened', path }),
            Viewed: ({ path, files }) => ({
              _tag: 'FolderViewed',
              path,
              files,
            }),
          },
        }),
      },
    },
    Package: {
      children: {
        package: Actor.child(PackageLive, {
          input: ({ model, state }) => ({
            root: state.root,
            path: '.',
            name:
              model.projects?.find((one) => one.id === state.project)?.name ??
              state.workspace.name,
          }),
          props: ({ model, state }) => ({
            branch: model.branch,
            changes: shownChangesOf(model, state),
            unchanged: model.unchanged,
          }),
          emits: {
            Opened: ({ path }) => ({ _tag: 'FileOpened', path }),
            Viewed: ({ path, files }) => ({
              _tag: 'FolderViewed',
              path,
              files,
            }),
          },
        }),
      },
    },
  },
});
