import { Console, Effect, Schema } from 'effect';
import { eschemaOf } from '@kestack/std-toolkit/eschema';
import { Task } from '../components/tasks.ts';

export const program = Effect.gen(function* () {
  // A task saved by release 1: Task at v1, its status at v1 too.
  const stored = {
    _v: 'v1',
    taskId: 't1',
    boardId: 'work',
    title: 'Plan the week',
    status: { _v: 'v1', _value: 'todo' },
    checklist: [{ _v: 'v1', text: 'Look at the calendar', checked: false }],
  };
  const read = yield* Schema.decodeUnknownEffect(Task.schema)(stored);
  yield* Console.log('status reads as', read.status);

  // Each field knows which shape, if any, it is.
  yield* Console.log('status is', eschemaOf(Task.fields.status)?.name);
  yield* Console.log('title is', eschemaOf(Task.fields.title)?.name);

  // Saved again: every level carries its own version.
  return yield* Schema.encodeEffect(Task.schema)(read);
});
