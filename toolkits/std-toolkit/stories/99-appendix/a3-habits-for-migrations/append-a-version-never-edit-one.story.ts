import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

// Three versions of a task, each added after the last one shipped: v2 added an assignee, v3 added a word count.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { assignee: Schema.NullOr(Schema.String) }, (previous) => ({
    ...previous,
    assignee: null,
  }))
  .evolve('v3', { words: Schema.Number }, (previous) => ({
    ...previous,
    words: previous.title.split(/\s+/).length,
  }))
  .build();

export const appendAVersionNeverEditOne = Story.make({
  title: 'Append a version, never edit one',
  description:
    'A new field is a new version on the end of the list. The versions already in storage are never touched, so every old row still reads.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'Two versions were added after the oldest rows were written. Do those rows still read?',
      {
        answer:
          'Yes. The v1 shape was left exactly as it was, so a v1 row still passes its check and simply walks two steps instead of one, arriving at v3.',
        proof: Effect.gen(function* () {
          // Read a row from before either step existed.
          const oldest = yield* Task.decode({
            _v: 'v1',
            taskId: 't1',
            boardId: 'work',
            title: 'Write the whole plan',
          });
          yield* Story.assert(
            'a v1 row walks both steps and arrives at v3',
            oldest.assignee === null && oldest.words === 4,
          );
          return { oldest };
        }),
      },
    ),
    Story.question('What about a row from the middle version?', {
      answer:
        'It keeps everything it had and gains only what v3 added. Appending a version never changes what an earlier version means.',
      proof: Effect.gen(function* () {
        // Read a row written while v2 was the newest version.
        const middle = yield* Task.decode({
          _v: 'v2',
          taskId: 't2',
          boardId: 'work',
          title: 'Review it',
          assignee: 'ana',
        });
        yield* Story.assert(
          'a v2 row keeps its own data and gains the v3 field only',
          middle.assignee === 'ana' && middle.words === 2,
        );
        return { middle };
      }),
    }),
    Story.question('Do rows from every version end up the same shape?', {
      answer:
        'Yes. Whatever version a row was written at, the app sees the newest shape, and only the newest shape.',
      proof: Effect.gen(function* () {
        // One row from each version.
        const v1 = yield* Task.decode({
          _v: 'v1',
          taskId: 't1',
          boardId: 'work',
          title: 'Plan',
        });
        const v2 = yield* Task.decode({
          _v: 'v2',
          taskId: 't2',
          boardId: 'work',
          title: 'Review',
          assignee: 'ana',
        });
        const v3 = yield* Task.decode({
          _v: 'v3',
          taskId: 't3',
          boardId: 'work',
          title: 'Ship',
          assignee: null,
          words: 1,
        });
        // The field names each one came back with.
        const shapes = [v1, v2, v3].map((row) =>
          Object.keys(row).sort().join(),
        );
        yield* Story.assert(
          'all three come back with the same fields',
          new Set(shapes).size === 1,
        );
        return { v1, v2, v3, shape: shapes[0] };
      }),
    }),
  ],
});
