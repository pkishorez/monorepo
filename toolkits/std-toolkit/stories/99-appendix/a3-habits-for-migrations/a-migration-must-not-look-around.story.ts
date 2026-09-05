import { Effect, Schema } from 'effect';
import { Story } from 'laymos/story';
import { EntityESchema } from 'std-toolkit/eschema';

// v2 adds a slug worked out from the title alone: nothing from the clock, nothing random, nothing from outside the row.
const Task = EntityESchema.make('Task', 'taskId', {
  boardId: Schema.String,
  title: Schema.String,
})
  .evolve('v2', { slug: Schema.String }, (previous) => ({
    ...previous,
    slug: previous.title.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
  }))
  .build();

// A v1 row as storage holds it.
const stored = {
  _v: 'v1',
  taskId: 't1',
  boardId: 'work',
  title: 'Write the plan',
};

export const aMigrationMustNotLookAround = Story.make({
  title: 'A migration must not look around',
  description:
    'A step runs on every read, not once. The same stored row must therefore produce the same value every time, on every machine.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'The same stored row is read twice. Do the two reads agree?',
      {
        answer:
          'Exactly, and they must: the step is not a one-time job, it runs each time the row is read, on every server and every day. A step that reached for the clock or a random number would hand two readers two different tasks.',
        proof: Effect.gen(function* () {
          // Read the same row twice.
          const first = yield* Task.decode(stored);
          const second = yield* Task.decode(stored);
          yield* Story.assert(
            'two reads of the same row agree exactly',
            JSON.stringify(first) === JSON.stringify(second),
          );
          return { first, second };
        }),
      },
    ),
    Story.question('So where can the new value come from?', {
      answer:
        'From the previous value only. The slug here is a plain function of the title, so it is the same wherever and whenever the row is read.',
      proof: Effect.gen(function* () {
        // Read the row; the slug is spelled out of the title and nothing else.
        const read = yield* Task.decode(stored);
        yield* Story.assert(
          'the new value is derived from the row alone',
          read.slug === 'write-the-plan',
        );
        return { read };
      }),
    }),
  ],
});
