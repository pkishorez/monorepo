import { Data } from 'effect';

/**
 * `no-package-json`: the root has neither `pnpm-workspace.yaml` nor a
 * `package.json`, so it is not a Monorepo or a Single Package.
 * `workspace-parse`: the file that
 * lists the workspace globs, named by `path`, could not be read as one.
 */
export class MonorepoReadError extends Data.TaggedError('MonorepoReadError')<{
  readonly reason: 'no-package-json' | 'workspace-parse' | 'glob';
  readonly path: string;
  readonly cause?: unknown;
}> {}
