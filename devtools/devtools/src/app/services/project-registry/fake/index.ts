import { Effect, Layer } from 'effect';
import {
  ProjectRegistry,
  ProjectRegistryProblem,
  type RegisteredProject,
  type Worktree,
} from '../contract/index.js';

export const fakeProjectRegistry = (
  projects: ReadonlyArray<RegisteredProject> | { readonly failed: string },
  worktrees: Readonly<
    Record<string, ReadonlyArray<Worktree> | { readonly failed: string }>
  > = {},
) =>
  Layer.succeed(ProjectRegistry)({
    projects:
      'failed' in projects
        ? Effect.fail(new ProjectRegistryProblem({ message: projects.failed }))
        : Effect.succeed(projects),
    worktrees: (path) => {
      const known = worktrees[path];
      if (known !== undefined && 'failed' in known)
        return Effect.fail(
          new ProjectRegistryProblem({ message: known.failed }),
        );
      return Effect.succeed(
        known ?? [
          {
            folder: path,
            branch: 'main',
            head: '0000000',
            primary: true,
            current: true,
          },
        ],
      );
    },
  });
