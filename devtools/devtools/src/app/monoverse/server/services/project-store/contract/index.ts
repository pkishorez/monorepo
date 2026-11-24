import { Context, Data, type Effect } from 'effect';

import type { ProjectEntry } from '../../../rpc/project-registry/contract/index.js';

/** The store could not be opened, read or written. */
export class ProjectStoreError extends Data.TaggedError('ProjectStoreError')<{
  operation: string;
  cause: string;
}> {}

export interface ProjectStoreShape {
  /** Every Project, newest first. */
  list(): Effect.Effect<ProjectEntry[], ProjectStoreError>;
  /** Adds the folder, absolute, or answers the entry it already is. */
  add(path: string): Effect.Effect<ProjectEntry, ProjectStoreError>;
  remove(id: string): Effect.Effect<boolean, ProjectStoreError>;
}

/** Where the Project registry is kept: every Monorepo and Single Package added to Monoverse. */
export class ProjectStore extends Context.Service<
  ProjectStore,
  ProjectStoreShape
>()('Monoverse/server/ProjectStore') {}
