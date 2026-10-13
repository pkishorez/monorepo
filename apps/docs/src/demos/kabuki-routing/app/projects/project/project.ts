import { Effect, Schema } from 'effect';
import { Actor } from '@kestack/kabuki';

/**
 * One project, keyed by its id: another id is a fresh Instance, and its
 * `presence` count starts over. It stays while its share dialog is open
 * over it, so the count goes on.
 */
export const ProjectActor = Actor.make('Project', {
  input: Schema.Struct({ id: Schema.Number }),
  model: Schema.Struct({ id: Schema.Number, seen: Schema.Number }),
  message: Schema.TaggedUnion({ Seen: {} }),
}).build({
  init: ({ id }) => ({ model: { id, seen: 0 } }),
  workers: {
    presence: {
      run: (self) =>
        Effect.forever(
          Effect.sleep('1 second').pipe(
            Effect.andThen(self.send({ _tag: 'Seen' })),
          ),
        ),
    },
  },
  on: {
    Seen: (_, { model }) => ({ model: { ...model, seen: model.seen + 1 } }),
  },
});
