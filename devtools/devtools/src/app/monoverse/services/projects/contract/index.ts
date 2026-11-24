import { Context, Data } from 'effect';
import type { Effect } from 'effect';

import type { FileContent } from '../../../server/rpc/files/contract/index.js';
import type { FolderListing } from '../../../server/rpc/folders/contract/index.js';
import type {
  Branches,
  ChangeSet,
  FileDiff,
} from '../../../server/rpc/git/contract/index.js';
import type { ProjectEntry } from '../../../server/rpc/project-registry/contract/index.js';
import type {
  PackageContents,
  Workspace,
} from '../../../server/rpc/project/contract/index.js';

/*
 * What Monoverse's Actors ask of the server, in their own words: the
 * saved projects, listed, added by folder and removed; the folders under
 * home, to find one; a project analysed at a branch with its Package
 * links and cycles worked out, one Package read with its Check, its
 * branches, what a branch changed, and one file or its diff. Every
 * failure is one plain sentence.
 */

/** One import, from the importing file to the file it imports. */
export type Link = readonly [from: string, to: string];

/** A project's folder as one branch has it; null reads the folder as it is on disk. */
export interface At {
  /** The project's folder, absolute. */
  readonly root: string;
  readonly branch: string | null;
}

/** A project analysed: what it is, and its Packages' links. */
export interface Analysis {
  readonly workspace: Workspace;
  /** Each Package's dependencies, as links between their folders. */
  readonly links: ReadonlyArray<Link>;
  /** The links that close each Package cycle. */
  readonly cycles: ReadonlyArray<Link>;
}

/**
 * Why something could not be read, as one sentence. `missing`: the folder
 * is gone or holds no project; `not-git`: the project is not in a git
 * repository; `failed`: anything else.
 */
export class ProjectsProblem extends Data.TaggedError('ProjectsProblem')<{
  readonly message: string;
  readonly reason: 'missing' | 'not-git' | 'failed';
}> {}

export interface ProjectsService {
  /** The saved projects, newest first. */
  readonly projects: () => Effect.Effect<
    ReadonlyArray<ProjectEntry>,
    ProjectsProblem
  >;
  /** A folder saved as a project. */
  readonly addProject: (folder: {
    readonly path: string;
  }) => Effect.Effect<ProjectEntry, ProjectsProblem>;
  /** A saved project forgotten; its folder stays as it is. */
  readonly removeProject: (project: {
    readonly id: string;
  }) => Effect.Effect<{ readonly removed: boolean }, ProjectsProblem>;
  /**
   * The sub-folders of `path` (home when null) whose name holds `query`;
   * hidden ones only when `hidden`.
   */
  readonly listFolders: (search: {
    readonly path: string | null;
    readonly query: string;
    readonly hidden: boolean;
  }) => Effect.Effect<FolderListing, ProjectsProblem>;
  readonly analyse: (at: At) => Effect.Effect<Analysis, ProjectsProblem>;
  readonly readPackage: (
    at: At & { readonly path: string },
  ) => Effect.Effect<PackageContents, ProjectsProblem>;
  readonly branches: (at: {
    readonly root: string;
  }) => Effect.Effect<Branches, ProjectsProblem>;
  /** What `branch` changed since it left `base`. */
  readonly changes: (
    at: At & { readonly base: string },
  ) => Effect.Effect<ChangeSet, ProjectsProblem>;
  readonly readFile: (
    at: At & { readonly path: string },
  ) => Effect.Effect<FileContent, ProjectsProblem>;
  readonly fileDiff: (
    at: At & { readonly base: string; readonly path: string },
  ) => Effect.Effect<FileDiff, ProjectsProblem>;
}

export class Projects extends Context.Service<Projects, ProjectsService>()(
  'Monoverse/service/Projects',
) {}
