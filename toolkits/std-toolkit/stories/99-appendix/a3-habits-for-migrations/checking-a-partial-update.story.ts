import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';

export const checkingAPartialUpdate = Story.make({
  title: 'Checking a partial update',
  description:
    '`makePartial` stamps the fields you give it with the newest version and checks nothing else. Use `encode` when a check is what you need.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question('What does `makePartial` do to a partial update?', {
      answer:
        'It copies the fields you handed it and adds the newest version stamp. It neither checks the values nor fills in the rest; a field you did not name stays absent.',
      proof: Effect.gen(function* () {
        // Stamp a change to the title only.
        const patch = Task.makePartial({ title: 'Write the whole plan' });
        yield* Story.assert(
          'the partial carries the newest stamp',
          patch._v === 'v1',
        );
        yield* Story.assert(
          'fields that were not named are simply absent',
          !('status' in patch) && !('assignee' in patch),
        );
        return { patch };
      }),
    }),
    Story.question('And if the partial is empty?', {
      answer:
        'You get a stamp and nothing else, without complaint. Nothing checks that an update changes something, so put that check where you build the update, or run the full value through `encode` when you have one.',
      proof: Effect.gen(function* () {
        // Stamp an update that changes nothing.
        const empty = Task.makePartial({});
        yield* Story.assert(
          'an empty partial is produced without complaint',
          empty._v === 'v1' && Object.keys(empty).length === 1,
        );
        return { empty };
      }),
    }),
  ],
});
