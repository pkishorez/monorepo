import { Context, Data } from 'effect';
import type { Effect } from 'effect';

export class ProjectRegistryProblem extends Data.TaggedError(
  'ProjectRegistryProblem',
)<{
  readonly message: string;
}> {}

export class ProjectRegistry extends Context.Service<
  ProjectRegistry,
  ProjectRegistryService
>()('DevTools/service/ProjectRegistry') {}

export interface RegisteredProject {
  readonly id: string;
  readonly name: string;
  readonly path: string;
}
export interface Worktree {
  readonly folder: string;
  readonly branch: string | null;
  readonly head: string;
  readonly primary: boolean;
  readonly current: boolean;
}
export interface ProjectRegistryService {
  readonly projects: Effect.Effect<
    ReadonlyArray<RegisteredProject>,
    ProjectRegistryProblem
  >;
  readonly worktrees: (
    path: string,
  ) => Effect.Effect<ReadonlyArray<Worktree>, ProjectRegistryProblem>;
}
