import { Console, Effect, Schema } from 'effect';
import { Reminder } from '../components/reminder.ts';

export const program = Effect.gen(function* () {
  const value = {
    title: 'Call home',
    dueAt: new Date('2026-11-09T18:00:00Z'),
  };
  yield* Console.log('in your code, dueAt is a Date:', value);

  const stored = yield* Schema.encodeEffect(Reminder.schema)(value);
  yield* Console.log('stored, dueAt is a string:', stored);

  const read = yield* Schema.decodeUnknownEffect(Reminder.schema)(stored);
  return read.dueAt instanceof Date ? 'read back as a Date' : 'not a Date';
});
