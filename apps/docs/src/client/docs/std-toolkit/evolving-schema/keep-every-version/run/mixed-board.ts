import { Console, Effect, Schema } from 'effect';
import { Task } from '../components/task.ts';

// Three rows in one database, saved by three releases of the app.
const saved = [
  { _v: 'v1', boardId: 'work', title: 'Plan the week' },
  { _v: 'v2', boardId: 'work', title: 'Water the plants', priority: 'high' },
  {
    _v: 'v3',
    boardId: 'work',
    title: 'Call home',
    priority: 'low',
    done: true,
  },
];

export const program = Effect.gen(function* () {
  for (const row of saved) {
    // Each row is read at its own version, then upgraded to the latest.
    const task = yield* Schema.decodeUnknownEffect(Task.schema)(row);
    yield* Console.log(`stored at ${row._v}:`, row, '→ read:', task);
  }

  // Saving always writes the latest version.
  const written = yield* Schema.encodeEffect(Task.schema)({
    boardId: 'work',
    title: 'Fix the bike',
    priority: 'high',
    done: false,
  });
  yield* Console.log('a new save is stored at', written._v, written);

  return `every task reads at ${Task.latestVersion}`;
});
