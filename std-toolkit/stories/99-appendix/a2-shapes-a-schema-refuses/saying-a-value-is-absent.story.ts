import { Effect } from 'effect';
import { Story } from 'laymos/story';
import { Task } from '../../01-one-task-one-table/01-defining-the-shape-of-a-task/defining-the-shape-of-a-task.story.js';

// A stored task, exactly as chapter 1 wrote it down, with somebody assigned.
const stored = {
  _v: 'v1',
  taskId: 't1',
  boardId: 'work',
  title: 'Write the plan',
  status: 'open',
  assignee: 'ana',
  colour: 'blue',
  notes: '',
};

export const sayingAValueIsAbsent = Story.make({
  title: 'Saying a value is absent',
  description:
    'A field is always present. When it has no value, the value is `null`; a key that is simply missing is a refused row.',
  sourceUrl: import.meta.url,
  questions: [
    Story.question(
      'How does a field that may be empty read when it is filled in?',
      {
        answer:
          'As the value it holds, unchanged. `assignee` was declared as a string or `null` back in chapter 1, and a string comes through as a string.',
        proof: Effect.gen(function* () {
          // Read the stored task back into the shape the app holds.
          const assigned = yield* Task.decode(stored);
          yield* Story.assert(
            'a present value reads back as it is',
            assigned.assignee === 'ana',
          );
          return { assigned };
        }),
      },
    ),
    Story.question('And how do I say nobody is assigned?', {
      answer:
        'With an explicit `null`, never by leaving the key out. A shape has no optional fields, so a declaration that tries to add one is refused at build time, and every stored row spells absence out.',
      proof: Effect.gen(function* () {
        // Read a task whose assignee is spelled out as `null`.
        const unassigned = yield* Task.decode({ ...stored, assignee: null });
        yield* Story.assert(
          'absence is an explicit null',
          unassigned.assignee === null,
        );
        return { unassigned };
      }),
    }),
    Story.question('What if the key is missing altogether?', {
      answer:
        'The read fails with `ESchemaError` instead of quietly handing you `undefined`. A missing key is a row that does not match its shape.',
      proof: Effect.gen(function* () {
        // Drop the `assignee` key and read the row; the failure comes back as a value.
        const { assignee: _assignee, ...withoutKey } = stored;
        const refused = yield* Task.decode(withoutKey).pipe(Effect.flip);
        yield* Story.assert(
          'a missing key is a decode failure, not an undefined',
          refused._tag === 'ESchemaError' &&
            refused.message === 'Decode failed',
        );
        return { refused: refused.message };
      }),
    }),
  ],
});
