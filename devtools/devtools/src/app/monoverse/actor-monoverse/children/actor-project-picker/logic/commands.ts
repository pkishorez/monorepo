import { Effect, Schema } from 'effect';
import { Command } from '@kestack/kabuki';

import { MonoverseClient } from '../../../../services/monoverse-client/contract/index.js';
import { problemOf } from './workers.js';

// 3. Choose
export const add = Command.make('ProjectPicker.AddProject', {
  args: Schema.Struct({ path: Schema.String }),
  run: ({ path }) =>
    Effect.flatMap(MonoverseClient, (client) =>
      client.AddProject({ path }),
    ).pipe(
      Effect.map((project) => ({ _tag: 'Added' as const, project })),
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'AddRefused' as const,
          problem: problemOf(error),
        }),
      ),
    ),
});

// 1. Recent
export const remove = Command.make('ProjectPicker.RemoveProject', {
  args: Schema.Struct({ id: Schema.String }),
  run: ({ id }) =>
    Effect.flatMap(MonoverseClient, (client) =>
      client.RemoveProject({ id }),
    ).pipe(
      Effect.as({ _tag: 'Removed' as const, id }),
      Effect.catch((error) =>
        Effect.succeed({
          _tag: 'RemoveRefused' as const,
          id,
          problem: problemOf(error),
        }),
      ),
    ),
});
