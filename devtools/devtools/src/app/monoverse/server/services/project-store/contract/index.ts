import { Context, Data, type Effect } from 'effect';

import type { ProjectEntry } from '../../../rpc/projects/contract/index.js';

export class ProjectStoreError extends Data.TaggedError('ProjectStoreError')<{
  operation: string;
  cause: string;
}> {}

export interface ProjectStoreShape {
  list(): Effect.Effect<ProjectEntry[], ProjectStoreError>;
  add(path: string): Effect.Effect<ProjectEntry, ProjectStoreError>;
  remove(id: string): Effect.Effect<boolean, ProjectStoreError>;
}

export class ProjectStore extends Context.Service<
  ProjectStore,
  ProjectStoreShape
>()('Monoverse/server/ProjectStore') {}
