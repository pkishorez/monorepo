import { Schema } from 'effect';
import { EntityESchema } from '@kstackz/std-toolkit/eschema';
import { StdTable } from '@kstackz/std-toolkit/db';

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
    addedAt: Schema.Number,
  },
).build();

export const table = StdTable.make('project-registry')
  .primary('pk', 'sk')
  .gsi('tool', 'toolPk', 'toolSk')
  .build();

export const entries = table
  .entity(ProjectEntryEntitySchema)
  .primary()
  .index('tool', 'byTool', { pk: ['tool'] })
  .build();

export const tableName = 'project_registry_data';
