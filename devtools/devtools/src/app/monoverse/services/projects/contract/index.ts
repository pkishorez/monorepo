import { Context, Data } from 'effect';
import type { Effect } from 'effect';

import type {
  Branches,
  ChangeSet,
  FileContent,
  FileDiff,
} from '../../../server/rpc/git/contract/index.js';
import type {
  PackageContents,
  Workspace,
} from '../../../server/rpc/project/contract/index.js';
import type {
  FolderListing,
  ProjectEntry,
} from '../../../server/rpc/projects/contract/index.js';

export type Link = readonly [from: string, to: string];

export interface At {
  readonly root: string;
  readonly branch: string | null;
}

export interface Analysis {
  readonly workspace: Workspace;
  readonly links: ReadonlyArray<Link>;
  readonly cycles: ReadonlyArray<Link>;
}

export class ProjectsProblem extends Data.TaggedError('ProjectsProblem')<{
  readonly message: string;
  readonly reason: 'missing' | 'not-git' | 'failed';
}> {}

export interface ProjectsService {
  readonly projects: () => Effect.Effect<
    ReadonlyArray<ProjectEntry>,
    ProjectsProblem
  >;
  readonly addProject: (folder: {
    readonly path: string;
  }) => Effect.Effect<ProjectEntry, ProjectsProblem>;
  readonly removeProject: (project: {
    readonly id: string;
  }) => Effect.Effect<{ readonly removed: boolean }, ProjectsProblem>;
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
