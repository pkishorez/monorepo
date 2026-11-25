import { Schema } from 'effect';

export const ChangeStatusSchema = Schema.Literals([
  'added',
  'modified',
  'deleted',
]);

export type ChangeStatus = typeof ChangeStatusSchema.Type;

export const ChangedPathSchema = Schema.Struct({
  path: Schema.String,
  status: ChangeStatusSchema,
}).annotate({
  title: 'Changed Path',
  description:
    'One file a Base ref changed, relative to the root, and how: committed work since the Base ref and uncommitted work alike.',
});

export type ChangedPath = typeof ChangedPathSchema.Type;

export const ChangeSetSchema = Schema.Struct({
  baseRef: Schema.String,
  files: Schema.Array(ChangedPathSchema),
}).annotate({
  title: 'Change Set',
  description:
    "The added, modified and deleted files of a branch since it left another, relative to the root: from the merge-base of the two to the branch's last commit, or to its worktree's files, uncommitted work included, when one has it checked out.",
});

export type ChangeSet = typeof ChangeSetSchema.Type;

export const uncommittedBase = 'HEAD';

export const DiffLineSchema = Schema.Struct({
  kind: Schema.Literals(['context', 'added', 'removed']),
  content: Schema.String,
  oldNumber: Schema.optional(Schema.Number),
  newNumber: Schema.optional(Schema.Number),
}).annotate({
  title: 'Diff Line',
  description:
    'One line of a Diff hunk, numbered in the side of the file it belongs to.',
});

export type DiffLine = typeof DiffLineSchema.Type;

export const DiffHunkSchema = Schema.Struct({
  header: Schema.String,
  oldStart: Schema.Number,
  newStart: Schema.Number,
  lines: Schema.Array(DiffLineSchema),
}).annotate({
  title: 'Diff Hunk',
  description: 'One contiguous changed region of a changed file.',
});

export type DiffHunk = typeof DiffHunkSchema.Type;

export const FileDiffSchema = Schema.Struct({
  path: Schema.String,
  hunks: Schema.Array(DiffHunkSchema),
}).annotate({
  title: 'File Diff',
  description:
    'The changed regions of one file of a branch since it left another, parsed into hunks and numbered lines.',
});

export type FileDiff = typeof FileDiffSchema.Type;

export const BranchSchema = Schema.Struct({
  name: Schema.String,
  worktree: Schema.NullOr(Schema.String),
}).annotate({
  title: 'Branch',
  description:
    'One local branch of the repository the Project lives in: what the Branch and Compare-to controls offer.',
});

export type Branch = typeof BranchSchema.Type;

export const BranchesSchema = Schema.Struct({
  current: Schema.NullOr(Schema.String),
  defaultBase: Schema.NullOr(Schema.String),
  branches: Schema.Array(BranchSchema),
}).annotate({
  title: 'Branches',
  description:
    "The local branches of the Project's repository, and which one its folder is on.",
});

export type Branches = typeof BranchesSchema.Type;
