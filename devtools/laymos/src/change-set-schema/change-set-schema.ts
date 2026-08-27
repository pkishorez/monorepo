import { Schema } from 'effect';

export const ChangeStatusSchema = Schema.Literals(['added', 'modified']);

export type ChangeStatus = typeof ChangeStatusSchema.Type;

export const ChangedPathSchema = Schema.Struct({
  path: Schema.String,
  status: ChangeStatusSchema,
  committed: Schema.Boolean,
  uncommitted: Schema.Boolean,
}).annotate({
  title: 'Changed Path',
  description:
    "One path a Base ref changed, relative to the Config's folder, and how it changed. A path may carry both committed work since the Base ref and uncommitted work in the working tree.",
});

export type ChangedPath = typeof ChangedPathSchema.Type;

export const ChangeSetSchema = Schema.Struct({
  baseRef: Schema.String,
  files: Schema.Array(ChangedPathSchema),
}).annotate({
  title: 'Change Set',
  description:
    "The added and modified paths between a Base ref and the working tree, relative to the Config's folder. It decorates an Architecture Analysis and never alters the analysis universe.",
});

export type ChangeSet = typeof ChangeSetSchema.Type;

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
  description: 'One contiguous changed region of a modified path.',
});

export type DiffHunk = typeof DiffHunkSchema.Type;

export const FileDiffSchema = Schema.Struct({
  path: Schema.String,
  hunks: Schema.Array(DiffHunkSchema),
}).annotate({
  title: 'File Diff',
  description:
    'The changed regions of one modified path between a Base ref and the working tree, parsed into hunks and numbered lines.',
});

export type FileDiff = typeof FileDiffSchema.Type;

export const BranchSchema = Schema.Struct({
  name: Schema.String,
  remote: Schema.Boolean,
  current: Schema.Boolean,
}).annotate({
  title: 'Branch',
  description:
    "One local or remote-tracking branch a Change set's Base ref may name. `current` marks the branch HEAD is on.",
});

export type Branch = typeof BranchSchema.Type;
