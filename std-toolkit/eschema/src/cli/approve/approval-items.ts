import type {
  SchemaSnapshotReport,
  SnapshotIssue,
  SnapshotReport,
} from '../shared/schema-snapshots/index.js';

export type ApprovalItem = {
  readonly schema: SchemaSnapshotReport;
  readonly issue: SnapshotIssue;
  readonly canApprove: boolean;
  readonly blockReason: string;
};

export function approvalItems(
  report: SnapshotReport,
  force: boolean,
): readonly ApprovalItem[] {
  return report.schemas.flatMap((schema) =>
    schema.issues
      .filter(
        (issue) =>
          (issue._tag === 'NewVersion' ||
            issue._tag === 'ModifiedVersion' ||
            issue._tag === 'MissingVersionFile') &&
          issue.version !== undefined,
      )
      .map((issue) => ({
        schema,
        issue,
        canApprove:
          (issue._tag === 'NewVersion' ||
            issue.version === schema.latestVersion ||
            force) &&
          issue._tag !== 'MissingVersionFile',
        blockReason:
          issue._tag === 'MissingVersionFile'
            ? 'Manual fix required: see the lint message for instructions.'
            : 'Approval blocked: use --force',
      })),
  );
}
