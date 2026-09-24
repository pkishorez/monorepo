import { Console, Data, Effect } from 'effect';
import { ConfigError, CruiseError, GitError } from 'laymos';

export class SnapshotRenderError extends Data.TaggedError(
  'SnapshotRenderError',
)<{
  readonly reason:
    | 'playwright-missing'
    | 'no-browser'
    | 'ui-missing'
    | 'page-error'
    | 'timeout';
  readonly message: string;
}> {}

export class SnapshotUsageError extends Data.TaggedError('SnapshotUsageError')<{
  readonly message: string;
}> {}

// Analysis, git, browser, and file failures all end the command the same way:
// one line on stderr and a failed exit, like the Client Commands.
export function reportSnapshotError(error: unknown) {
  return Console.error(describeSnapshotError(error)).pipe(
    Effect.andThen(
      Effect.sync(() => {
        process.exitCode = 1;
      }),
    ),
  );
}

export function describeSnapshotError(error: unknown): string {
  if (
    error instanceof SnapshotRenderError ||
    error instanceof SnapshotUsageError
  ) {
    return error.message;
  }
  if (error instanceof ConfigError) {
    return error.reason === 'validation'
      ? [
          `Invalid config: ${error.filePath}`,
          ...error.issues.map((issue) => `  \u2715 ${issue.message}`),
        ].join('\n')
      : `Could not ${error.reason} config: ${error.filePath}`;
  }
  if (error instanceof CruiseError) {
    return `Could not analyze source files beneath: ${error.baseDir}`;
  }
  if (error instanceof GitError) {
    switch (error.reason) {
      case 'not-a-repo':
        return `${error.baseDir} is not inside a git repository.`;
      case 'unknown-ref':
        return `git does not know the base ref; fetch it first.`;
      case 'command-failed':
        return `git failed in ${error.baseDir}: ${String(error.cause)}`;
    }
  }
  return error instanceof Error ? error.message : String(error);
}
