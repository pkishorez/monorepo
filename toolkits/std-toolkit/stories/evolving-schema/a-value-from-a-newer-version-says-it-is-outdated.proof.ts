import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import {
  EntityESchema,
  findOutdatedVersion,
} from '@kstackz/std-toolkit/eschema';

// This reader only knows v1. Somewhere, newer code already writes v2.
const Task = EntityESchema.make('Task', 'taskId', {
  title: Schema.String,
}).build();

export default Proof.make({
  title: 'A value from a newer version fails as outdated, not as bad data',
  description:
    'An older reader can tell it is out of date instead of mistaking a newer value for corruption.',
  prepare: Effect.gen(function* () {
    const fromTheFuture = {
      _v: 'v2',
      taskId: 't1',
      title: 'Plan',
      priority: 'high',
    };
    yield* Proof.assert(
      'the reader knows only v1',
      Task.latestVersion === 'v1',
    );
    return { fromTheFuture };
  }),
  act: ({ fromTheFuture }) =>
    Schema.decodeUnknownEffect(Task.schema)(fromTheFuture).pipe(
      Effect.flip,
      Effect.map((error) => {
        const outdated = findOutdatedVersion(error);
        return {
          outdated:
            outdated === undefined
              ? null
              : {
                  schema: outdated.schema,
                  version: outdated.version,
                  latestVersion: outdated.latestVersion,
                },
          message: error.message,
        };
      }),
    ),
  verify: ({ outdated }) =>
    Effect.gen(function* () {
      yield* Proof.assert(
        'the failure is an OutdatedVersion',
        outdated !== null,
      );
      yield* Proof.assert(
        'it names the version it met and the latest it knows',
        outdated?.version === 'v2' && outdated.latestVersion === 'v1',
      );
    }),
});
