import { EntityESchema } from '@std-toolkit/eschema';
import { Schema } from 'effect';

const TaskCommands = Schema.Struct({
  install: Schema.optionalWith(Schema.String, { exact: true }),
  build: Schema.optionalWith(Schema.String, { exact: true }),
  lint: Schema.optionalWith(Schema.String, { exact: true }),
  test: Schema.optionalWith(Schema.String, { exact: true }),
  format: Schema.optionalWith(Schema.String, { exact: true }),
});

export const ProjectSettings = Schema.Struct({
  baseBranch: Schema.optionalWith(Schema.String, { exact: true }),
  copyFiles: Schema.optionalWith(Schema.Array(Schema.String), { exact: true }),
  taskCommands: Schema.optionalWith(TaskCommands, { exact: true }),
});

export const projectEntity = EntityESchema.make('project', 'id', {
  name: Schema.String,
  homePath: Schema.String,
  gitPath: Schema.String,
})
  .evolve(
    'v2',
    { settings: Schema.optionalWith(ProjectSettings, { exact: true }) },
    (prev) => ({ ...prev }),
  )
  .build();
