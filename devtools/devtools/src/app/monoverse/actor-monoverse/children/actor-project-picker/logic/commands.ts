import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';

import { Projects } from '../../../../services/projects/contract/index.js';

export const add = Command.make('ProjectPicker.AddProject', {
  args: Schema.Struct({ path: Schema.String }),
  run: ({ path }) =>
    Effect.flatMap(Projects, (projects) => projects.addProject({ path })).pipe(
      Effect.map((project) => ({ _tag: 'Added' as const, project })),
      Effect.catch(({ message: problem }) =>
        Effect.succeed({ _tag: 'AddRefused' as const, problem }),
      ),
    ),
});

export const remove = Command.make('ProjectPicker.RemoveProject', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.flatMap(Projects, (projects) => projects.removeProject({ id })).pipe(
      Effect.as({ _tag: 'Removed' as const, id }),
      Effect.catch(({ message: problem }) =>
        Effect.succeed({ _tag: 'RemoveRefused' as const, id, problem }),
      ),
    ),
});
