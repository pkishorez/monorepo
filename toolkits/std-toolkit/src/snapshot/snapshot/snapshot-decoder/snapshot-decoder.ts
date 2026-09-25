import { Effect } from 'effect';
import type {
  ContractSnapshot,
  SnapshotIssue,
  TableSnapshot,
  TableSnapshotFile,
} from '../../domain/index.js';
import {
  ESchemaSnapshotESchema,
  SnapshotDecodeError,
  TableSnapshotESchema,
  TableSnapshotFileESchema,
  eschemaSnapshotIssues,
  tableSnapshotIssues,
} from '../../domain/index.js';

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const describeFailure = (cause: unknown): string =>
  cause instanceof Error ? cause.message : String(cause);

const issuesError = (issues: readonly SnapshotIssue[]): SnapshotDecodeError =>
  new SnapshotDecodeError(
    `Malformed snapshot: ${issues
      .map(({ path, issue }) => `${path.join('/')}: ${issue}`)
      .join('; ')}`,
  );

const decodeWith =
  <A>(eschema: { decode(value: unknown): Effect.Effect<A, Error> }) =>
  (input: unknown): Effect.Effect<A, SnapshotDecodeError> =>
    eschema
      .decode(input)
      .pipe(
        Effect.mapError(
          (cause) =>
            new SnapshotDecodeError(
              `Malformed snapshot: ${describeFailure(cause)}`,
              cause,
            ),
        ),
      );

const checked =
  <A>(issuesOf: (value: A) => readonly SnapshotIssue[]) =>
  (value: A): Effect.Effect<A, SnapshotDecodeError> => {
    const issues = issuesOf(value);
    return issues.length === 0
      ? Effect.succeed(value)
      : Effect.fail(issuesError(issues));
  };

/**
 * Structural validation for a table snapshot that is already decoded:
 * references resolve, names are unique. Throws so pure callers such as diff
 * can refuse a malformed document without going through Effect.
 */
function validateTableSnapshot(snapshot: TableSnapshot): TableSnapshot {
  const issues = tableSnapshotIssues(snapshot);
  if (issues.length > 0) throw issuesError(issues);
  return snapshot;
}

/** Reads a stored snapshot document, migrating older formats forward. */
function decodeSnapshot(
  input: unknown,
): Effect.Effect<ContractSnapshot, SnapshotDecodeError> {
  const kind = isRecord(input) ? input.kind : undefined;
  if (kind === 'eschema') {
    return decodeWith(ESchemaSnapshotESchema)(input).pipe(
      Effect.flatMap(checked(eschemaSnapshotIssues)),
    );
  }
  if (kind === 'table') {
    return decodeWith(TableSnapshotESchema)(input).pipe(
      Effect.flatMap(checked(tableSnapshotIssues)),
    );
  }
  return Effect.fail(
    new SnapshotDecodeError(
      `Malformed snapshot: expected kind "eschema" or "table", got ${JSON.stringify(kind)}`,
    ),
  );
}

/** Reads a committed table snapshot file: the contract plus its golden rows. */
function decodeTableSnapshotFile(
  input: unknown,
): Effect.Effect<TableSnapshotFile, SnapshotDecodeError> {
  return decodeWith(TableSnapshotFileESchema)(input).pipe(
    Effect.flatMap(checked((file) => tableSnapshotIssues(file.snapshot))),
  );
}

export { decodeSnapshot, decodeTableSnapshotFile, validateTableSnapshot };
