import { Console, Effect, Schema } from 'effect';
import { Task } from '../components/task.ts';

// Stored rows, as different releases left them.
const rows = [
  { _v: 'v1', boardId: 'work', title: 'Plan the week' },
  { _v: 'v2', boardId: 'work', title: 'Water the plants', priority: 'high' },
  // Saved before the app used versions at all: no _v.
  { boardId: 'work', title: 'Call home' },
];

export const program = Effect.gen(function* () {
  for (const row of rows) {
    const version = row._v ?? 'none, so v1';
    const task = yield* Schema.decodeUnknownEffect(Task.schema)(row);
    yield* Console.log(`_v: ${version}`, row, '→', task);
  }
  return `every read gives a ${Task.latestVersion} task`;
});
