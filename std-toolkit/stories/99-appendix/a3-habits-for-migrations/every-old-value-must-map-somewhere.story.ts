import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

// v1 let `assignee` be null. v2 replaces it with `owner`, which is always a name; the step must give every v1 value one.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
  assignee: Schema.NullOr(Schema.String),
})
  .evolve(
    'v2',
    { owner: Schema.String, assignee: null },
    ({ assignee, ...rest }) => ({
      ...rest,
      owner: assignee === null || assignee.trim() === '' ? 'nobody' : assignee,
    }),
  )
  .build();

export const everyOldValueMustMapSomewhere = Story.make({
  title: 'Every old value must map somewhere',
  description:
    'A step runs on every row of the version before it, so it has to accept every value that version allowed, including the ones nobody meant to write.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What happens to a v1 row with a real assignee?', {
      answer: 'The name moves across to `owner`, and the old field is gone.',
      proof: Effect.gen(function* () {
        // Read a v1 row where someone was assigned.
        const named = yield* Task.decode({
          _v: 'v1',
          taskId: 't1',
          boardId: 'work',
          title: 'Write the plan',
          assignee: 'ana',
        });
        yield* Story.assert(
          'the name carries over and the old field is dropped',
          named.owner === 'ana' && !('assignee' in named),
        );
        return { named };
      }),
    }),
    Story.question('And the `null` that v1 allowed?', {
      answer:
        'The step has to turn it into a real owner, here `nobody`. It runs on every v1 row there is, so it cannot leave any allowed value unhandled without failing a read later.',
      proof: Effect.gen(function* () {
        // Read a v1 row where nobody was assigned.
        const unassigned = yield* Task.decode({
          _v: 'v1',
          taskId: 't2',
          boardId: 'work',
          title: 'Review it',
          assignee: null,
        });
        yield* Story.assert(
          'null maps to a real owner',
          unassigned.owner === 'nobody',
        );
        return { unassigned };
      }),
    }),
    Story.question('What about the blank name nobody expected?', {
      answer:
        'A complete step covers that too, because v1 allowed any string, blank included. Handle it now, in the step, rather than months later when a read fails on a row you forgot could exist.',
      proof: Effect.gen(function* () {
        // Read a v1 row whose assignee is only spaces.
        const blank = yield* Task.decode({
          _v: 'v1',
          taskId: 't3',
          boardId: 'work',
          title: 'Tidy the desk',
          assignee: '   ',
        });
        yield* Story.assert(
          'even the forgotten case maps somewhere sensible',
          blank.owner === 'nobody',
        );
        return { blank };
      }),
    }),
  ],
});
