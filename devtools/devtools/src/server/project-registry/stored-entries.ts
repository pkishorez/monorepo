import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { StdTable } from '@kestack/std-toolkit/db';

/**
 * How the Project registry keeps one entry: one absolute folder, an optional
 * label, and when it was added. `tool` partitions the store: every entry is
 * written as `monoverse` and only those are listed, so entries kept for the
 * retired Laymos Tool stay in the store unread.
 */
export const ProjectEntryEntitySchema = EntityESchema.make(
  'ProjectEntry',
  'id',
  {
    tool: Schema.Literals(['monoverse', 'laymos']),
    path: Schema.String,
    label: Schema.NullOr(Schema.String),
    addedAt: Schema.Finite,
  },
).build();

export const table = StdTable.make('project-registry')
  .primary('pk', 'sk')
  .gsi('tool', 'toolPk', 'toolSk')
  .entity(ProjectEntryEntitySchema, (e) =>
    e.primary().index('tool', 'byTool', { pk: ['tool'] }),
  )
  .build();

export const entries = table.ProjectEntry;

// v2: a fresh table under the Stored contract; the old one is left behind.
export const tableName = 'project_registry_data_v2';
