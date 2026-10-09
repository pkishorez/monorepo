import { Data } from 'effect';

/**
 * `not-a-monorepo`: the root has neither `pnpm-workspace.yaml` nor a
 * `workspaces` field in its `package.json`. `workspace-parse`: the file that
 * lists the workspace globs, named by `path`, could not be read as one.
 */
export class MonorepoReadError extends Data.TaggedError('MonorepoReadError')<{
  readonly reason: 'not-a-monorepo' | 'workspace-parse' | 'glob';
  readonly path: string;
  readonly cause?: unknown;
}> {}
