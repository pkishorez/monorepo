import { Effect, Schema } from 'effect';
import { Proof } from 'laymos/story';
import { StdTable } from '@kstackz/std-toolkit/db';
import { Memory } from '@kstackz/std-toolkit/db/memory';
import {
  EntityESchema,
  findOutdatedVersion,
} from '@kstackz/std-toolkit/eschema';

const TaskV1 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
}).build();
const TaskV2 = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { priority: Schema.Literals(['low', 'high']) }, (v1) => ({
    ...v1,
    priority: 'low' as const,
  }))
  .build();

// During a rolling deploy, the new release writes while the old one still reads.
const newRelease = StdTable.make('board').primary('pk', 'sk').build();
const newTask = newRelease
  .entity(TaskV2)
  .primary({ pk: ['boardId'] })
  .build();
const oldRelease = StdTable.make('board').primary('pk', 'sk').build();
const oldTask = oldRelease
  .entity(TaskV1)
  .primary({ pk: ['boardId'] })
  .build();

export default Proof.make({
  title: 'An older release knows when a row is too new for it',
  description:
    'The read fails, and the failure carries OutdatedVersion, so the old release can tell "upgrade me" from "bad data".',
  critical: true,
  prepare: Effect.gen(function* () {
    const db = Memory.make(oldRelease);
    const written = yield* newTask
      .insert({
        taskId: 't1',
        boardId: 'work',
        title: 'Plan',
        priority: 'high',
      })
      .pipe(Effect.provide(db.layer));
    yield* Proof.assert('the new release stored v2', written.meta._v === 'v2');
    return { db };
  }),
  act: ({ db }) =>
    oldTask.get({ boardId: 'work', taskId: 't1' }).pipe(
      Effect.provide(db.layer),
      Effect.match({
        onFailure: (error) => {
          const outdated = findOutdatedVersion(error);
          return {
            reason: error.reason._tag,
            outdated:
              outdated === undefined
                ? null
                : {
                    version: outdated.version,
                    latestVersion: outdated.latestVersion,
                  },
          };
        },
        onSuccess: () => ({ reason: 'read', outdated: null }),
      }),
    ),
  verify: ({ reason, outdated }) =>
    Effect.gen(function* () {
      yield* Proof.assert('the read fails', reason === 'DecodeFailed');
      yield* Proof.assert(
        'the failure is recognisable as OutdatedVersion v2 > v1',
        outdated?.version === 'v2' && outdated.latestVersion === 'v1',
      );
    }),
});
