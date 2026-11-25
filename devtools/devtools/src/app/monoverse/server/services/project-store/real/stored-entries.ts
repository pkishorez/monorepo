import { Schema } from 'effect';
import { EntityESchema } from '@kestack/std-toolkit/eschema';
import { StdTable } from '@kestack/std-toolkit/db';

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
  .build();

export const entries = table
  .entity(ProjectEntryEntitySchema)
  .primary()
  .index('tool', 'byTool', { pk: ['tool'] })
  .build();

export const tableName = 'project_registry_data';
