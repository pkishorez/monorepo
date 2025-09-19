import { Schema } from 'effect';
import { ESchema } from './eschema.js';

export const eschema = ESchema.make(
  // br
  'v1', // br
  Schema.Struct({ v1: Schema.String }),
)
  .evolve(
    'v2', // br
    Schema.Struct({ v1: Schema.Literal('v2'), v2: Schema.String }),
    (old, v) =>
      v({
        ...old,
        v1: 'v2',
        v2: 'test',
      }),
  )
  .evolve(
    'v3',
    ({ v2 }) => Schema.Struct({ ...v2.fields, v3: Schema.String }),
    (old) => ({
      ...old,
      v3: 'hell',
    }),
  )
  .build();
