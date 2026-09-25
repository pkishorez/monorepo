import { Effect } from 'effect';
import type { SnapshotIssue, TableSnapshot } from '../../domain/index.js';
import {
  SnapshotDecodeError,
  TableSnapshotESchema,
  tableSnapshotIssues,
} from '../../domain/index.js';

const describeFailure = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const issuesError = (issues: readonly SnapshotIssue[]): SnapshotDecodeError =>
  new SnapshotDecodeError(
    `Malformed snapshot: ${issues
      .map(({ path, issue }) => `${path.join('/')}: ${issue}`)
      .join('; ')}`,
  );

/**
 * Structural validation for a snapshot that is already decoded: references
 * resolve, names are unique. Throws so pure callers such as diff can refuse
 * a malformed document without going through Effect.
 */
function validateTableSnapshot(snapshot: TableSnapshot): TableSnapshot {
  const issues = tableSnapshotIssues(snapshot);
  if (issues.length > 0) throw issuesError(issues);
  return snapshot;
}

/** Reads a stored snapshot document, migrating older document formats forward. */
function parseTableSnapshot(
  input: unknown,
): Effect.Effect<TableSnapshot, SnapshotDecodeError> {
  return TableSnapshotESchema.decode(input).pipe(
    Effect.mapError(
      (cause) =>
        new SnapshotDecodeError(
          `Malformed snapshot: ${describeFailure(cause)}`,
          cause,
        ),
    ),
    Effect.flatMap((snapshot) => {
      const issues = tableSnapshotIssues(snapshot);
      return issues.length === 0
        ? Effect.succeed(snapshot)
        : Effect.fail(issuesError(issues));
    }),
  );
}

export { parseTableSnapshot, validateTableSnapshot };
