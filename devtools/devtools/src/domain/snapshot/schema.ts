import { Schema } from 'effect';
import { ArchitectureAnalysisSchema } from 'laymos/architecture-analysis-schema';
import { ChangeSetSchema } from 'laymos/change-set-schema';

export const snapshotThemes = ['dark', 'light'] as const;

/**
 * What the Snapshot page draws: one Architecture Analysis, the Change set to
 * mark on it, and how large the picture may grow. The `devtools snapshot`
 * command hands it to the bundled page; nothing is fetched.
 */
export const SnapshotRequestSchema = Schema.Struct({
  title: Schema.String,
  theme: Schema.Literals(snapshotThemes),
  includeUnchanged: Schema.Boolean,
  maxWidth: Schema.Number,
  maxHeight: Schema.Number,
  analysis: ArchitectureAnalysisSchema,
  changes: Schema.optional(ChangeSetSchema),
  /** How the caption names the Base ref; the Change set carries the resolved commit. */
  baseLabel: Schema.optional(Schema.String),
}).annotate({
  title: 'Snapshot Request',
  description:
    'The Architecture Analysis, Change set, size limits, and theme one Snapshot draws.',
});

export type SnapshotRequest = typeof SnapshotRequestSchema.Type;

/** The JSON form that crosses from the command into the page. */
export const SnapshotRequestJson = Schema.toCodecJson(SnapshotRequestSchema);
